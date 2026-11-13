// 保存値は描画を行わず、素体・動きと同じ定義で正規化する。
import { MANNEQUIN_COLORS, normalizeParams } from '../src/mannequin.mjs';
import { normalizeTuning } from '../src/motion_tuning.mjs';
import { normalizeCustomMotion } from '../src/custom_motion.mjs';

export const STANDARD_NAMES = Object.freeze(['Idle', 'Walk', 'Run', 'Jump', 'Melee', 'Aim', 'Hurt']);
const STANDARD_LABELS = { Idle: '立つ', Walk: '歩く', Run: '走る', Jump: '跳ぶ', Melee: 'なぐる', Aim: '構える', Hurt: 'やられる' };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value, initial, min, max) => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(min, Math.min(max, value)) : initial;
const motionName = value => typeof value === 'string' && (STANDARD_NAMES.includes(value)
  || /^(s|u|q1|q2)\/[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/.test(value));

const customList = value => {
  const motions = (Array.isArray(value) ? value : []).map(normalizeCustomMotion);
  return [...new Map(motions.map(motion => [motion.name, motion])).values()].slice(0, 50);
};

export function pageAddress(location) {
  return location.origin + location.pathname.replace(/\/index\.html$/, '/');
}

export function defaultState() {
  return normalizeState({});
}

export function normalizeState(value) {
  const input = record(value) ? value : {};
  const preset = input.preset === 'female' ? 'female' : 'male';
  const params = normalizeParams(record(input.params) ? input.params : {}, preset);
  const colors = { part: typeof input.colors?.part === 'string' && /^#[0-9a-f]{6}$/i.test(input.colors.part)
    ? input.colors.part : MANNEQUIN_COLORS.part };
  const sourceTuning = record(input.tuning) ? input.tuning : {};
  // 古いスマホ版の、不正な角度だけを 0 に戻す扱いを保つ。
  const offsets = Object.fromEntries(Object.entries(record(sourceTuning.offsets) ? sourceTuning.offsets : {})
    .filter(([, joints]) => record(joints)).map(([name, joints]) =>
      [name, Object.fromEntries(Object.entries(joints).map(([joint, angles]) =>
        [joint, Array.isArray(angles) ? angles.map(angle => Number.isFinite(angle) ? angle : 0) : angles]))]));
  const tuning = normalizeTuning({ ...sourceTuning, offsets });
  const included = Array.isArray(input.included)
    ? [...new Set(input.included.filter(motionName))] : [...STANDARD_NAMES];
  const name = typeof input.name === 'string'
    ? input.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 64) || 'moju' : 'moju';
  return { version: 1, preset, params, colors, tuning, included, custom: customList(input.custom),
    selectedMotion: motionName(input.selectedMotion) ? input.selectedMotion : 'Idle',
    name, speed: number(input.speed, 1, 0.1, 2) };
}

export function serializeState(state) {
  return JSON.stringify(normalizeState(state), null, 2);
}

export function parseState(text) {
  try { return normalizeState(JSON.parse(text)); }
  catch { return defaultState(); }
}

/** ファイルに含まれない調整とチェックは現在の状態から引き継ぐ。 */
export function applySettingsFile(state, settings) {
  return normalizeState({ ...state, preset: settings.preset, params: settings.params,
    colors: { ...state.colors, ...settings.colors },
    tuning: settings.tuning ?? state.tuning, included: settings.included ?? state.included,
    custom: settings.custom == null ? state.custom : customList([...customList(state.custom), ...customList(settings.custom)]) });
}

/** 上からの表示順。Quaternius の中には素材ごとの小見出しを持つ。 */
export function motionGroups({ standardNames = STANDARD_NAMES, custom = [], scriptGroups = [], scriptLabels = {},
  quaterniusGroups = [], quaterniusLabels = {} } = {}) {
  const rows = (motions, labels) => motions.map(motion => {
    const name = typeof motion === 'string' ? motion : motion.name;
    return { name, label: labels[name] ?? motion.label ?? name };
  });
  return [
    { label: '標準', rows: rows(standardNames, STANDARD_LABELS) },
    { label: '自分で作った動き', rows: customList(custom).map(motion => ({ name: `u/${motion.name}`, label: motion.label })) },
    ...scriptGroups.map(group => ({ label: `自作: ${group.label}`, rows: rows(group.motions, scriptLabels) })),
    { label: 'Quaternius', groups: quaterniusGroups.map(group =>
      ({ label: group.label, rows: rows(group.motions, quaterniusLabels) })) },
  ];
}

export function exportNames(state, allNames) {
  const selected = new Set(normalizeState(state).included);
  return [...new Set(allNames)].filter(name => selected.has(name));
}
