// DOM・three.js なしで保存値を扱う。数値の定義は src/mannequin.mjs と
// src/motion_tuning.mjs の範囲・初期値に合わせる（画面は元の定義から作る）。
export const STANDARD_NAMES = Object.freeze(['Idle', 'Walk', 'Run', 'Jump', 'Melee', 'Aim', 'Hurt']);
const STANDARD_LABELS = { Idle: '立つ', Walk: '歩く', Run: '走る', Jump: '跳ぶ', Melee: 'なぐる', Aim: '構える', Hurt: 'やられる' };
const MALE = {
  height: 1.5, headW: 1, headH: 1, headD: 1, shoulderW: 1, chestW: 1, waist: 1, hipW: 1,
  torsoD: 1, torsoLen: 1, bust: 0, armLen: 1, armR: 1, handSize: 1, legLen: 1, legR: 1,
  footSize: 1, armAngle: 29, blend: 0.03,
};
const FEMALE = { ...MALE, height: 1.45, shoulderW: 0.9, chestW: 0.92, waist: 0.84,
  hipW: 1.04, torsoD: 0.94, bust: 0.02, armR: 0.86, handSize: 0.92, legR: 0.92,
  footSize: 0.92, armAngle: 27 };
const PARAM_RANGES = { height: [0.5, 2.5], bust: [0, 0.08], armAngle: [0, 90], blend: [0.01, 0.08] };
const TUNING_DEFAULTS = {
  clearance: { strength: 1, margin: 0.01, smooth: 0.1, maxOpen: 40 },
  keepShape: { torso: 1, head: 1, arms: 0, legs: 0 },
  ground: { strength: 1, threshold: 0.04, flatten: 1, floor: 0 },
};
const TUNING_RANGES = {
  clearance: { strength: [0, 1], margin: [0, 0.05], smooth: [0, 0.5], maxOpen: [0, 80] },
  ground: { strength: [0, 1], threshold: [0, 0.2], flatten: [0, 1], floor: [-0.2, 0.2] },
};
const JOINTS = new Set(['Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head',
  ...['Left', 'Right'].flatMap(side => ['Shoulder', 'UpperArm', 'LowerArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot'].map(name => side + name))]);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value, initial, min, max) => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(min, Math.min(max, value)) : initial;
const motionName = value => typeof value === 'string' && (STANDARD_NAMES.includes(value)
  || /^(s|q1|q2)\/[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/.test(value));

export function defaultState() {
  return normalizeState({});
}

export function normalizeState(value) {
  const input = record(value) ? value : {};
  const preset = input.preset === 'female' ? 'female' : 'male';
  const base = preset === 'female' ? FEMALE : MALE;
  const sourceParams = record(input.params) ? input.params : {};
  const params = Object.fromEntries(Object.entries(base).map(([key, initial]) =>
    [key, number(sourceParams[key], initial, ...(PARAM_RANGES[key] ?? [0.5, 1.6]))]));
  const sourceTuning = record(input.tuning) ? input.tuning : {};
  const tuning = Object.fromEntries(Object.entries(TUNING_DEFAULTS).map(([group, defaults]) => {
    const source = record(sourceTuning[group]) ? sourceTuning[group] : {};
    return [group, Object.fromEntries(Object.entries(defaults).map(([key, initial]) =>
      [key, number(source[key], initial, ...(TUNING_RANGES[group]?.[key] ?? [0, 1]))]))];
  }));
  tuning.offsets = {};
  if (record(sourceTuning.offsets)) {
    tuning.offsets = Object.fromEntries(Object.entries(sourceTuning.offsets).filter(([name, joints]) =>
      motionName(name) && record(joints)).flatMap(([name, joints]) => {
      const entries = Object.entries(joints).filter(([joint, angles]) => JOINTS.has(joint)
        && Array.isArray(angles) && angles.length === 3).map(([joint, angles]) =>
        [joint, Array.from(angles, angle => number(angle, 0, -60, 60))])
        .filter(([, angles]) => angles.some(angle => angle !== 0));
      return entries.length ? [[name, Object.fromEntries(entries)]] : [];
    }));
  }
  const included = Array.isArray(input.included)
    ? [...new Set(input.included.filter(motionName))] : [...STANDARD_NAMES];
  const name = typeof input.name === 'string'
    ? input.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 64) || 'moju' : 'moju';
  return { version: 1, preset, params, tuning, included,
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

/** 上からの表示順。Quaternius の中には素材ごとの小見出しを持つ。 */
export function motionGroups({ standardNames = STANDARD_NAMES, scriptGroups = [], scriptLabels = {},
  quaterniusGroups = [], quaterniusLabels = {} } = {}) {
  const rows = (motions, labels) => motions.map(motion => {
    const name = typeof motion === 'string' ? motion : motion.name;
    return { name, label: labels[name] ?? motion.label ?? name };
  });
  return [
    { label: '標準', rows: rows(standardNames, STANDARD_LABELS) },
    ...scriptGroups.map(group => ({ label: `自作: ${group.label}`, rows: rows(group.motions, scriptLabels) })),
    { label: 'Quaternius', groups: quaterniusGroups.map(group =>
      ({ label: group.label, rows: rows(group.motions, quaterniusLabels) })) },
  ];
}

export function exportNames(state, allNames) {
  const selected = new Set(normalizeState(state).included);
  return [...new Set(allNames)].filter(name => selected.has(name));
}
