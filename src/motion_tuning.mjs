import { DEFAULT_KEEP_SHAPE, DEFAULT_GROUND } from './motions.mjs';
import { DEFAULT_CLEARANCE } from './arm_clearance.mjs';

export const CLEARANCE_SETTINGS = [
  { key: 'strength', label: '腕を体から離す強さ', description: '1で腕を体の外へ逃がします。0で元の動きを使います。', min: 0, max: 1, step: 0.05 },
  { key: 'margin', label: '体とのすき間(m)', description: '腕と体の間に空ける距離です。少し増やすとゆったり構えます。', min: 0, max: 0.05, step: 0.001 },
  { key: 'smooth', label: 'なめらかさ(秒)', description: '前後のコマとなじませる時間です。増やすと腕がゆっくり動きます。', min: 0, max: 0.5, step: 0.01 },
  { key: 'maxOpen', label: '腕を横へ開く上限', description: '体に当たる腕を、ひじを曲げずに肩から横へ開いて逃がす角度の上限です。0 にすると使いません。', min: 0, max: 80, step: 1 },
];

export const KEEP_SHAPE_GROUPS = [
  { key: 'torso', label: '胴(腰〜胸)', description: '0 はお手本の骨の向き、1 はこの素体の胴の形を保って動かします。' },
  { key: 'head', label: '首と頭', description: '0 はお手本の骨の向き、1 はこの素体の首と頭の形を保って動かします。' },
  { key: 'arms', label: '腕', description: '0 はお手本の骨の向き、1 はこの素体の腕の形を保って動かします。' },
  { key: 'legs', label: '脚', description: '0 はお手本の骨の向き、1 はこの素体の脚の形を保って動かします。' },
];

export const OFFSET_JOINTS = [
  ...[['Hips', '腰'], ['Spine', '背骨'], ['Chest', '胸'], ['UpperChest', '胸の上'],
    ['Neck', '首'], ['Head', '頭']].map(([name, label]) => ({ name, label })),
  ...[['Left', '左の'], ['Right', '右の']].flatMap(([side, prefix]) =>
    [['Shoulder', '肩'], ['UpperArm', '二の腕'], ['LowerArm', 'ひじから先'],
      ['Hand', '手'], ['UpperLeg', 'もも'], ['LowerLeg', 'すね'], ['Foot', '足']]
      .map(([name, label]) => ({ name: side + name, label: prefix + label }))),
];

export const OFFSET_AXES = [
  { label: '前後', description: '+ は前へ倒す' },
  { label: '左右', description: '+ は体の左へ倒す' },
  { label: 'ひねり', description: '+ は左を向く' },
].map(axis => ({ ...axis, min: -60, max: 60, step: 0.5 }));

export const GROUND_SETTINGS = [
  { key: 'strength', label: '接地の強さ', description: '0 なら接地させません。1 で足を床にしっかり合わせます。', min: 0, max: 1, step: 0.05 },
  { key: 'threshold', label: '接地とみなす高さ', description: '床からこの高さ(m)より近い足を、床に合わせます。', min: 0, max: 0.2, step: 0.01 },
  { key: 'flatten', label: '足の裏を平らに', description: '1 で足の裏を床にぺたっと付けます。0 なら傾いたままにします。', min: 0, max: 1, step: 0.05 },
  { key: 'floor', label: '床の高さ', description: '床とみなす高さ(m)。普段は 0 のままにします。', min: -0.2, max: 0.2, step: 0.01 },
];
const GROUND_RANGES = Object.fromEntries(GROUND_SETTINGS.map(setting => [setting.key, [setting.min, setting.max]]));

export function defaultTuning() {
  return { keepShape: { ...DEFAULT_KEEP_SHAPE }, ground: { ...DEFAULT_GROUND }, clearance: { ...DEFAULT_CLEARANCE }, offsets: {} };
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const knownJoints = new Set(OFFSET_JOINTS.map(joint => joint.name));

export function normalizeTuning(value) {
  const result = defaultTuning();
  if (!record(value)) return result;
  if (record(value.clearance)) {
    for (const { key, min, max } of CLEARANCE_SETTINGS) {
      if (Number.isFinite(value.clearance[key])) result.clearance[key] = clamp(value.clearance[key], min, max);
    }
  }
  if (record(value.keepShape)) {
    for (const { key } of KEEP_SHAPE_GROUPS) {
      if (Number.isFinite(value.keepShape[key])) {
        result.keepShape[key] = clamp(value.keepShape[key], 0, 1);
      }
    }
  }
  if (record(value.ground)) {
    for (const { key } of GROUND_SETTINGS) {
      if (Number.isFinite(value.ground[key])) {
        const [min, max] = GROUND_RANGES[key];
        result.ground[key] = clamp(value.ground[key], min, max);
      }
    }
  }
  if (record(value.offsets)) {
    result.offsets = Object.fromEntries(Object.entries(value.offsets).flatMap(([clip, joints]) => {
      if (!record(joints)) return [];
      const offsets = Object.fromEntries(Object.entries(joints).flatMap(([name, angles]) => {
        if (!knownJoints.has(name) || !Array.isArray(angles) || angles.length !== 3
            || !Array.from(angles).every(Number.isFinite)) return [];
        const normalized = angles.map(angle => clamp(angle, -60, 60));
        return normalized.some(angle => angle !== 0) ? [[name, normalized]] : [];
      }));
      return Object.keys(offsets).length ? [[clip, offsets]] : [];
    }));
  }
  return result;
}

export function retargetOptions(tuning) {
  return normalizeTuning(tuning);
}
