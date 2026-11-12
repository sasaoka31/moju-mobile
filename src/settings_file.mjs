import { normalizeTuning } from './motion_tuning.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const formatError = () => new Error('体型の形式またはバージョンが対応していません');

/** 共通の設定ファイル。体型の範囲は、使う側の normalizeParams に任せる。 */
export function readSettingsFile(text) {
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error('JSON の形式が壊れています'); }
  // 初期のスマホ版には version のない設定 JSON もある。
  const legacyMobile = record(data) && !Object.hasOwn(data, 'version') &&
    ['tuning', 'included', 'selectedMotion', 'name', 'speed'].some(key => Object.hasOwn(data, key));
  if (!record(data) || (data.version !== 1 && !legacyMobile) || !['male', 'female'].includes(data.preset)) {
    throw formatError();
  }
  return {
    preset: data.preset,
    params: Object.fromEntries(Object.entries(record(data.params) ? data.params : {})
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))),
    colors: typeof data.colors?.part === 'string' && /^#[0-9a-f]{6}$/i.test(data.colors.part)
      ? { part: data.colors.part } : {},
    tuning: Object.hasOwn(data, 'tuning') ? normalizeTuning(data.tuning) : null,
    included: Object.hasOwn(data, 'included')
      ? [...new Set((Array.isArray(data.included) ? data.included : []).filter(name => typeof name === 'string'))] : null,
  };
}

export function writeSettingsFile({ preset, params, colors, tuning, included }) {
  const data = { version: 1, preset, params, colors };
  if (tuning !== undefined) data.tuning = tuning;
  if (included !== undefined) data.included = included;
  const clean = readSettingsFile(JSON.stringify(data));
  return JSON.stringify({ version: 1, preset: clean.preset, params: clean.params, colors: clean.colors,
    ...(tuning !== undefined ? { tuning: clean.tuning } : {}),
    ...(included !== undefined ? { included: clean.included } : {}) }, null, 2);
}
