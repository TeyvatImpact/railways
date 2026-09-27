/**
 * One-shot migration: move each line's `costPreset` (from the retired
 * `src/config/fare-presets.json`) onto its variants as `vehicle`, the id of an
 * entry in `src/config/vehicles.ts` (same ids). A line without `costPreset` used
 * the old `standard` fallback, so its variants get `vehicle: "standard"`.
 *
 * The transform works on the raw text so the compact array formatting of the data
 * files is preserved (only the affected keys move).
 *
 *   node scripts/migrate-vehicles.cjs
 */
const fs = require('fs');
const path = require('path');

const FILES = ['teyvat', 'inazuma', 'liyue', 'snezhnaya', 'ferry', 'same'];
const dataDir = path.join(__dirname, '..', 'src', 'data');
const WS = /\s/;

/** Index of the `]` / `}` matching the bracket at `open` (strings skipped). */
function matchBracket(text, open) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error('unbalanced brackets');
}

/** Edits that add `"vehicle": preset` to every variant object inside a `"variants": [ ... ]` block. */
function variantEdits(text, open, close, preset) {
  const edits = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = open + 1; i < close; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') {
      if (c === '{' && depth === 0) {
        // top-level element of the variants array → a variant object
        let k = i + 1;
        while (WS.test(text[k])) k++;
        let insert = `"vehicle": ${JSON.stringify(preset)},`;
        if (text.slice(i + 1, k).includes('\n')) {
          const lineStart = text.lastIndexOf('\n', k - 1) + 1;
          insert += '\n' + text.slice(lineStart, k);
        } else {
          insert += ' ';
        }
        edits.push({ start: k, end: k, text: insert });
      }
      depth++;
    } else if (c === ']' || c === '}') depth--;
  }
  return edits;
}

/** Edit that removes the property whose opening key quote is at `keyStart`. */
function removeProperty(text, keyStart) {
  let q = keyStart + '"costPreset"'.length;
  while (WS.test(text[q])) q++;
  if (text[q] !== ':') throw new Error('costPreset 后不是冒号');
  q++;
  while (WS.test(text[q])) q++;
  if (text[q] !== '"') throw new Error('costPreset 的值不是字符串');
  let r = q + 1;
  while (text[r] !== '"') r++;
  const valueEnd = r + 1;

  let s = valueEnd;
  while (WS.test(text[s])) s++;
  if (text[s] === ',') {
    // 不是最后一个键：连后面的逗号与换行一起删
    let e = s + 1;
    while (WS.test(text[e])) e++;
    return { start: keyStart, end: e, text: '' };
  }
  // 最后一个键：连前面的逗号一起删
  let ps = keyStart - 1;
  while (WS.test(text[ps])) ps--;
  if (text[ps] !== ',') throw new Error('costPreset 前的分隔符不是逗号');
  return { start: ps, end: valueEnd, text: '' };
}

function migrateText(text) {
  const edits = [];
  const linesMatch = /"lines"\s*:\s*\[/.exec(text);
  if (!linesMatch) throw new Error('找不到 lines 数组');
  const linesOpen = text.indexOf('[', linesMatch.index);
  const linesClose = matchBracket(text, linesOpen);

  for (let i = linesOpen + 1; i < linesClose; i++) {
    if (text[i] !== '{') continue;
    const lineClose = matchBracket(text, i);
    const body = text.slice(i, lineClose + 1);

    const presetMatch = /"costPreset"\s*:\s*"([^"]*)"/.exec(body);
    const preset = presetMatch ? presetMatch[1] : 'standard';
    if (presetMatch) edits.push(removeProperty(text, i + presetMatch.index));

    const varMatch = /"variants"\s*:\s*\[/.exec(body);
    if (!varMatch) throw new Error(`线路缺 variants：${body.slice(0, 60)}`);
    const vOpen = i + body.indexOf('[', varMatch.index);
    const vClose = matchBracket(text, vOpen);
    edits.push(...variantEdits(text, vOpen, vClose, preset));

    i = lineClose;
  }

  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** 递归按键名排序，便于忽略键序比较 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}

for (const key of FILES) {
  const file = path.join(dataDir, `${key}.json`);
  const before = fs.readFileSync(file, 'utf8');
  const after = migrateText(before);

  // 校验：改写后的解析结果必须与「直接改对象再序列化」一致
  const expected = JSON.parse(before);
  for (const line of expected.lines ?? []) {
    const preset = line.costPreset ?? 'standard';
    delete line.costPreset;
    for (const variant of line.variants) {
      const next = {};
      if ('name' in variant) next.name = variant.name;
      if ('nameEn' in variant) next.nameEn = variant.nameEn;
      next.vehicle = preset;
      next.stations = variant.stations;
      for (const k of Object.keys(variant)) delete variant[k];
      Object.assign(variant, next);
    }
  }
  if (JSON.stringify(canonical(JSON.parse(after))) !== JSON.stringify(canonical(expected)))
    throw new Error(`${key}.json 迁移结果不一致`);

  fs.writeFileSync(file, after);
  console.log(`${key}.json: ${(after.match(/"vehicle":/g) || []).length} variants`);
}
