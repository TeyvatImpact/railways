// /display 的语音播报引擎（模块级单例）：音色列表与选择、打断式语音队列、播报日志。
// VoicePanel / AnnounceLog / index.vue 共用同一份状态与同一个队列（语音本来就是全局一路的）。
import { reactive, ref, type Ref } from 'vue';
import {
  LOG_LIMIT,
  PREVIEW,
  UTTERANCE_LANGS,
  VOICE_LANGS,
  VOICE_STORAGE_KEY,
  type AnnounceLang,
} from '../config/announce.config';
import type { Announcement } from '../views/display/announce';

export type SpeechStatus =
  | 'queued'
  | 'speaking'
  | 'done'
  | 'canceled'
  | 'skipped'
  | 'error'
  | 'note';

export interface SpeechLogEntry {
  id: number;
  /** null = 只记日志、不发音的条目（如「动态模式已关闭」） */
  lang: AnnounceLang | null;
  text: string;
  status: SpeechStatus;
}

interface StoredVoices {
  zh?: string;
  ja?: string;
  en?: string;
  auto?: boolean;
}

const LANGS: AnnounceLang[] = ['zh', 'ja', 'en'];
const LANG_LABEL: Record<AnnounceLang, string> = { zh: '中文', ja: '日文', en: '英文' };

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
const voices: Ref<SpeechSynthesisVoice[]> = ref([]);
const selection = reactive<Record<AnnounceLang, string>>({ zh: '', ja: '', en: '' });
const auto = ref(true);
const log: Ref<SpeechLogEntry[]> = ref([]);
/** 已经提示过「没有这种语言的音色」的语言，避免每次刷新语音都刷屏 */
const missingVoices = new Set<AnnounceLang>();
let nextId = 1;

function optionsFor(lang: AnnounceLang): SpeechSynthesisVoice[] {
  const prefix = VOICE_LANGS[lang];
  return voices.value.filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
}

function readStored(): StoredVoices {
  try {
    return JSON.parse(localStorage.getItem(VOICE_STORAGE_KEY) ?? '{}') as StoredVoices;
  } catch {
    return {};
  }
}

function saveStored(): void {
  try {
    localStorage.setItem(
      VOICE_STORAGE_KEY,
      JSON.stringify({ zh: selection.zh, ja: selection.ja, en: selection.en, auto: auto.value }),
    );
  } catch {
    // 隐私模式等写不进 localStorage：忽略，只是不持久化
  }
}

/** 记一条日志并返回数组里的那条（响应式代理，回调里改状态能触发刷新） */
function push(entry: Omit<SpeechLogEntry, 'id'>): SpeechLogEntry {
  log.value.push({ ...entry, id: nextId++ });
  if (log.value.length > LOG_LIMIT) log.value.splice(0, log.value.length - LOG_LIMIT);
  return log.value[log.value.length - 1]!;
}

function note(text: string): void {
  push({ lang: null, text, status: 'note' });
}

/** 音色列表是异步的（Chrome 首次可能为空或不全，之后触发 voiceschanged）；
 *  initial = 首次调用，这时「没有这种语言的音色」只是还没加载，不记日志 */
function loadVoices(initial = false): void {
  if (!supported) return;
  voices.value = speechSynthesis.getVoices();
  for (const lang of LANGS) {
    const list = optionsFor(lang);
    if (!list.length) {
      if (!initial && !missingVoices.has(lang)) {
        missingVoices.add(lang);
        note(`未找到${LANG_LABEL[lang]}音色，将使用浏览器默认音色`);
      }
      continue;
    }
    missingVoices.delete(lang);
    if (!list.some((voice) => voice.voiceURI === selection[lang])) {
      selection[lang] = list[0]!.voiceURI;
      saveStored();
    }
  }
}

function resolveVoice(lang: AnnounceLang): SpeechSynthesisVoice | null {
  const list = optionsFor(lang);
  return list.find((voice) => voice.voiceURI === selection[lang]) ?? list[0] ?? null;
}

/** 打断式：清空正在播与排队的语音，并把日志里没播完的标成「已打断」 */
function cancelPending(): void {
  speechSynthesis.cancel();
  for (const entry of log.value) {
    if (entry.status === 'queued' || entry.status === 'speaking') entry.status = 'canceled';
  }
}

function speak(items: Announcement[], opts: { force?: boolean } = {}): void {
  if (!supported) {
    note('当前浏览器不支持语音合成');
    return;
  }
  // 自动播报关闭时静默跳过（「播报」按钮与「试听」传 force = true）
  if (!opts.force && !auto.value) return;
  cancelPending();
  for (const item of items) {
    const entry = push({ lang: item.lang, text: item.text, status: 'queued' });
    const utter = new SpeechSynthesisUtterance(item.text);
    utter.lang = UTTERANCE_LANGS[item.lang];
    const voice = resolveVoice(item.lang);
    if (voice) utter.voice = voice;
    utter.onstart = () => {
      if (entry.status === 'queued') entry.status = 'speaking';
    };
    utter.onend = () => {
      if (entry.status === 'queued' || entry.status === 'speaking') entry.status = 'done';
    };
    utter.onerror = () => {
      if (entry.status === 'queued' || entry.status === 'speaking') entry.status = 'error';
    };
    speechSynthesis.speak(utter);
  }
}

function preview(lang: AnnounceLang): void {
  speak([{ lang, text: PREVIEW[lang] }], { force: true });
}

function setAuto(value: boolean): void {
  auto.value = value;
  saveStored();
  note(value ? '自动播报已打开' : '自动播报已关闭');
}

function setVoice(lang: AnnounceLang, voiceURI: string): void {
  selection[lang] = voiceURI;
  saveStored();
}

const stored = readStored();
selection.zh = stored.zh ?? '';
selection.ja = stored.ja ?? '';
selection.en = stored.en ?? '';
auto.value = stored.auto ?? true;
if (supported) {
  loadVoices(true);
  speechSynthesis.addEventListener('voiceschanged', () => loadVoices(false));
}

const speech = reactive({
  supported,
  voices,
  optionsFor,
  selection,
  auto,
  log,
  speak,
  preview,
  note,
  setAuto,
  setVoice,
});

/** 模块级单例：模板里直接读 speech.auto / speech.log / speech.selection.zh */
export function useSpeech(): typeof speech {
  return speech;
}
