// 配音模板的装配：把 src/data/voice/*.json 读成注册表（模板 id = 文件名 stem），并校验
// 线路 / 体系引用的模板 id 都存在于注册表。新增一个模板 = 新增一个 JSON 文件（无需改代码）。
import networksData from '../../data/networks.json';
import { lines } from '../../composables/useMapData';
import { createVoiceRegistry, type VoiceTemplate, type VoiceTemplateData } from './announce';

const modules = import.meta.glob('../../data/voice/*.json', { eager: true, import: 'default' });

const datas: Record<string, VoiceTemplateData> = {};
for (const [path, data] of Object.entries(modules)) {
  const stem = path
    .split('/')
    .pop()!
    .replace(/\.json$/, '');
  datas[stem] = data as VoiceTemplateData;
}

export const VOICE_TEMPLATES: Map<string, VoiceTemplate> = createVoiceRegistry(datas);

// 校验：线路（含体系默认）引用的模板 id 必须存在
for (const line of lines) {
  if (!VOICE_TEMPLATES.has(line.voice)) {
    throw new Error(`线路 ${line.id} 引用了不存在的配音模板：${line.voice}`);
  }
}
for (const [id, net] of Object.entries(networksData as Record<string, { voice?: string }>)) {
  if (net.voice && !VOICE_TEMPLATES.has(net.voice)) {
    throw new Error(`体系 ${id} 引用了不存在的配音模板：${net.voice}`);
  }
}
