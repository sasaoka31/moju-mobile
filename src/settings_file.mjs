import { normalizeTuning } from './motion_tuning.mjs';
import { normalizeCustomMotion } from './custom_motion.mjs';
import { MANNEQUIN_COLOR_PARTS } from './mannequin.mjs';

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
  return withCustom({
    preset: data.preset,
    params: Object.fromEntries(Object.entries(record(data.params) ? data.params : {})
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))),
    colors: Object.fromEntries(['part', ...MANNEQUIN_COLOR_PARTS.map(({ key }) => key)]
      .filter(key => typeof data.colors?.[key] === 'string' && data.colors[key].length === 7 && /^#[0-9a-f]{6}$/i.test(data.colors[key]))
      .map(key => [key, data.colors[key]])),
    tuning: Object.hasOwn(data, 'tuning') ? normalizeTuning(data.tuning) : null,
    included: Object.hasOwn(data, 'included')
      ? [...new Set((Array.isArray(data.included) ? data.included : []).filter(name => typeof name === 'string'))] : null,
  }, data);
}

export function writeSettingsFile({ preset, params, colors, tuning, included, custom, face, headgear, facegear, outline, surface }) {
  const data = { version: 1, preset, params, colors };
  if (face !== undefined) data.face = face;
  if (headgear !== undefined) data.headgear = headgear;
  if (facegear !== undefined) data.facegear = facegear;
  if (outline !== undefined) data.outline = outline;
  if (surface !== undefined) data.surface = surface;
  if (tuning !== undefined) data.tuning = tuning;
  if (included !== undefined) data.included = included;
  if (custom !== undefined) data.custom = custom;
  const clean = readSettingsFile(JSON.stringify(data));
  return JSON.stringify({ version: 1, preset: clean.preset, params: clean.params, colors: clean.colors,
    ...(face !== undefined ? { face: clean.face } : {}),
    ...(headgear !== undefined ? { headgear: clean.headgear } : {}),
    ...(facegear !== undefined ? { facegear: clean.facegear } : {}),
    ...(outline !== undefined ? { outline: clean.outline } : {}),
    ...(surface !== undefined ? { surface: clean.surface } : {}),
    ...(tuning !== undefined ? { tuning: clean.tuning } : {}),
    ...(included !== undefined ? { included: clean.included } : {}),
    ...(custom !== undefined ? { custom: clean.custom } : {}) }, null, 2);
}

function normalizeCustomList(value) {
  const motions = (Array.isArray(value) ? value : []).map(normalizeCustomMotion);
  return motions.filter((motion, index) => !motions.slice(index + 1).some(later => later.name === motion.name));
}

function withCustom(settings, data) {
  const surfacePresent = Object.hasOwn(data, 'surface');
  Object.defineProperty(settings, 'surface', {
    value: surfacePresent ? Object.fromEntries(Object.entries(record(data.surface) ? data.surface : {})
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))) : null,
    enumerable: surfacePresent, writable: true, configurable: true,
  });
  const outlinePresent = Object.hasOwn(data, 'outline');
  Object.defineProperty(settings, 'outline', {
    value: outlinePresent ? Object.fromEntries(Object.entries(record(data.outline) ? data.outline : {})
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))) : null,
    enumerable: outlinePresent, writable: true, configurable: true,
  });
  const headgearPresent = Object.hasOwn(data, 'headgear');
  Object.defineProperty(settings, 'headgear', {
    value: headgearPresent ? Object.fromEntries(Object.entries(record(data.headgear) ? data.headgear : {})
      .filter(([key, value]) => key === 'id' ? value === null || typeof value === 'string'
        : typeof value === 'number' && Number.isFinite(value))) : null,
    enumerable: headgearPresent, writable: true, configurable: true,
  });
  const facegearPresent = Object.hasOwn(data, 'facegear');
  Object.defineProperty(settings, 'facegear', {
    value: facegearPresent ? Object.fromEntries(Object.entries(record(data.facegear) ? data.facegear : {})
      .filter(([key, value]) => key === 'id' ? value === null || typeof value === 'string'
        : typeof value === 'number' && Number.isFinite(value))) : null,
    enumerable: facegearPresent, writable: true, configurable: true,
  });
  const facePresent = Object.hasOwn(data, 'face');
  // 未指定の項目は列挙せず、古い設定を複写する呼び出し側との互換性を保つ。
  Object.defineProperty(settings, 'face', {
    value: facePresent ? Object.fromEntries(Object.entries(record(data.face) ? data.face : {})
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))) : null,
    enumerable: facePresent, writable: true, configurable: true,
  });
  const present = Object.hasOwn(data, 'custom');
  // 古い呼び出し側が列挙・複写する項目は保つ。未指定でも .custom は null。
  return Object.defineProperty(settings, 'custom', {
    value: present ? normalizeCustomList(data.custom) : null,
    enumerable: present, writable: true, configurable: true,
  });
}
