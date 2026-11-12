import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three';
import { clampPose, DEFAULT_LIMITS } from './joint_limits.mjs';
import { groundClip } from './motions.mjs';

const LEG = /^(Left|Right)(UpperLeg|LowerLeg|Foot|Toes)$/;
const ARM = /^(Left|Right)(Shoulder|UpperArm|LowerArm|Hand)$/;
const radians = Math.PI / 180;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const vector = value => Array.isArray(value) && value.length === 3
  && Array.from(value).every(Number.isFinite);

function validatePose(pose) {
  if (!isRecord(pose)) throw new Error('ポーズは関節名と角度の組にしてください');
  for (const [name, angles] of Object.entries(pose)) {
    if (!Object.hasOwn(DEFAULT_LIMITS, name)) throw new Error(`ポーズの関節が見つかりません: ${name}`);
    if (!vector(angles)) throw new Error(`${name}の回転は度で表した有限の数3つにしてください`);
  }
}

/** 左右の関節を交換し、中央の関節も含めて鏡に映した新しいポーズを返す。 */
export function mirrorPose(pose) {
  validatePose(pose);
  return Object.fromEntries(Object.entries(pose).map(([name, [x, y, z]]) => [
    name.replace(/^(Left|Right)/, side => side === 'Left' ? 'Right' : 'Left'),
    [x, y === 0 ? 0 : -y, z === 0 ? 0 : -z],
  ]));
}

export const KEYPOSE_SETTINGS = [
  { key: 'duration', label: '1 周の時間(秒)', description: '左右の足が1回ずつ前に出る時間。短いほど速い。', min: 0.3, max: 3, step: 0.01 },
  { key: 'stride', label: '歩幅(倍)', description: '脚・ひざ・足首・つま先の曲げをこの倍にする。', min: 0, max: 2, step: 0.01 },
  { key: 'armSwing', label: '腕の振り(倍)', description: '鎖骨・肩・ひじ・手首の曲げをこの倍にする。', min: 0, max: 2, step: 0.01 },
  { key: 'bounce', label: '体の上下(m)', description: '足の交差で腰が上がり、着地で下がる幅。', min: 0, max: 0.1, step: 0.001 },
  { key: 'lag', label: '遅れ(秒)', description: '腕と首・頭が体より遅れて付いてくる時間。', min: 0, max: 0.3, step: 0.01 },
  { key: 'easing', label: '速さの付き方', description: 'キーポーズの間を進む速さを選ぶ。', choices: [
    { value: 'linear', label: '一定' },
    { value: 'ease', label: 'ゆっくり始まりゆっくり止まる' },
  ] },
];

export const DEFAULT_KEYPOSES = {
  CustomWalk: {
    label: '自作: 歩く',
    contact: {
      Spine: [3, 0, 0], Neck: [-3, 0, 0],
      LeftUpperLeg: [-25, 0, 0], LeftLowerLeg: [5, 0, 0], LeftFoot: [-12, 0, 0],
      RightUpperLeg: [20, 0, 0], RightLowerLeg: [10, 0, 0], RightFoot: [-8, 0, 0], RightToes: [15, 0, 0],
      LeftUpperArm: [20, 0, -5], LeftLowerArm: [-15, 0, 0],
      RightUpperArm: [-20, 0, 5], RightLowerArm: [-20, 0, 0],
    },
    passing: {
      Spine: [3, 0, 0], Neck: [-3, 0, 0],
      LeftUpperLeg: [0, 0, 0], LeftLowerLeg: [5, 0, 0], LeftFoot: [-5, 0, 0],
      RightUpperLeg: [-15, 0, 0], RightLowerLeg: [55, 0, 0], RightFoot: [-20, 0, 0],
      LeftUpperArm: [0, 0, -5], LeftLowerArm: [-15, 0, 0],
      RightUpperArm: [0, 0, 5], RightLowerArm: [-20, 0, 0],
    },
    settings: { duration: 1, stride: 1, armSwing: 1, bounce: 0.02, lag: 0.05, easing: 'ease' },
  },
  CustomRun: {
    label: '自作: 走る',
    contact: {
      Hips: [8, 0, 0], Spine: [10, 0, 0], Chest: [5, 0, 0], Neck: [-15, 0, 0],
      LeftUpperLeg: [-45, 0, 0], LeftLowerLeg: [25, 0, 0], LeftFoot: [-10, 0, 0],
      RightUpperLeg: [30, 0, 0], RightLowerLeg: [85, 0, 0], RightFoot: [-25, 0, 0], RightToes: [20, 0, 0],
      LeftUpperArm: [40, 0, -8], LeftLowerArm: [-90, 0, 0],
      RightUpperArm: [-45, 0, 8], RightLowerArm: [-100, 0, 0],
    },
    passing: {
      Hips: [8, 0, 0], Spine: [10, 0, 0], Chest: [5, 0, 0], Neck: [-15, 0, 0],
      LeftUpperLeg: [5, 0, 0], LeftLowerLeg: [25, 0, 0], LeftFoot: [-20, 0, 0],
      RightUpperLeg: [-35, 0, 0], RightLowerLeg: [120, 0, 0], RightFoot: [-30, 0, 0],
      LeftUpperArm: [0, 0, -8], LeftLowerArm: [-90, 0, 0],
      RightUpperArm: [-5, 0, 8], RightLowerArm: [-100, 0, 0],
    },
    settings: { duration: 0.6, stride: 1, armSwing: 1, bounce: 0.04, lag: 0.04, easing: 'ease' },
  },
};

/** 数値は範囲内へ収め、不正な値は base (不正な base は歩く初期値)で補う。 */
export function normalizeKeyposeSettings(value, base = DEFAULT_KEYPOSES.CustomWalk.settings) {
  const defaults = DEFAULT_KEYPOSES.CustomWalk.settings;
  const result = {};
  for (const info of KEYPOSE_SETTINGS) {
    const fallback = base?.[info.key];
    const input = value?.[info.key];
    if (info.choices) {
      const known = candidate => info.choices.some(choice => choice.value === candidate);
      result[info.key] = known(input) ? input : known(fallback) ? fallback : defaults[info.key];
    } else {
      const number = typeof input === 'number' && !Number.isNaN(input) ? input
        : typeof fallback === 'number' && !Number.isNaN(fallback) ? fallback : defaults[info.key];
      result[info.key] = Math.min(info.max, Math.max(info.min, number));
    }
  }
  return result;
}

function validateJoints(joints) {
  const names = Object.keys(DEFAULT_LIMITS);
  if (!Array.isArray(joints) || joints.length !== names.length) {
    throw new Error('Moju の23関節を用意してください');
  }
  const byName = new Map(Array.from(joints, joint => [joint?.name, joint]));
  for (const name of names) {
    const joint = byName.get(name);
    if (!joint || !vector(joint.position)) throw new Error(`関節の名前と有限の座標3つを確認してください: ${name}`);
    if (name === 'Root' ? joint.parent !== null : !byName.has(joint.parent)) {
      throw new Error(`関節の親を確認してください: ${name}`);
    }
  }
  if (byName.get('Hips').parent !== 'Root') throw new Error('腰の親には Root 関節を指定してください');
  for (const name of names) {
    const visited = new Set();
    let current = name;
    while (current !== null) {
      if (visited.has(current)) throw new Error(`関節の親が循環しています: ${name}`);
      visited.add(current);
      current = byName.get(current).parent;
    }
  }
}

/** 4つのキーポーズを局所回転でつなぎ、ループする動きを作る。 */
export function buildKeyposeClip(options) {
  if (!isRecord(options)) throw new Error('キーポーズと動きの設定を用意してください');
  const { name, contact, passing, settings, joints, hipsRest, ground, fps = 30 } = options;
  if (typeof name !== 'string' || !name.trim()) throw new Error('動きの名前を指定してください');
  validatePose(contact);
  validatePose(passing);
  validateJoints(joints);
  if (!vector(hipsRest)) throw new Error('立ち姿の腰の位置は有限の数3つにしてください');
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('動きのコマ数は1秒あたりの正の有限数にしてください');
  if (settings !== undefined && !isRecord(settings)) throw new Error('動きの設定は項目名と値の組にしてください');
  if (ground !== undefined && !isRecord(ground)) throw new Error('接地の設定は項目名と値の組にしてください');
  const tuning = normalizeKeyposeSettings(settings);
  const { duration, stride, armSwing, bounce, lag, easing } = tuning;
  const prepare = pose => clampPose(Object.fromEntries(Object.entries(pose).map(([joint, angles]) => [
    joint, angles.map(angle => angle * (LEG.test(joint) ? stride : ARM.test(joint) ? armSwing : 1)),
  ])));
  const poses = [contact, passing, mirrorPose(contact), mirrorPose(passing)].map(prepare);
  const keys = poses.map(pose => new Map(joints.map(joint => [joint.name,
    new Quaternion().setFromEuler(new Euler(...(pose[joint.name] ?? [0, 0, 0]).map(angle => angle * radians), 'XYZ')),
  ])));
  const times = [0];
  // トラックへ保存した時点の終端時刻と比較し、丸めで重なるコマを作らない。
  const endTime = Math.fround(duration);
  for (let frame = 1; Math.fround(frame / fps) < endTime; frame++) times.push(Math.fround(frame / fps));
  times.push(duration);
  const rotations = new Map(joints.map(joint => [joint.name, []]));
  const positions = [];
  for (let frame = 0; frame < times.length; frame++) {
    // 終端は先頭と同じ評価時刻にして、遅れも含めて完全に閉じる。
    const time = frame === times.length - 1 ? 0 : times[frame];
    const pose = {};
    for (const { name: joint } of joints) {
      const delay = ARM.test(joint) || joint === 'Neck' || joint === 'Head' ? lag : 0;
      let wrapped = (time - delay) % duration;
      if (wrapped < 0) wrapped += duration;
      const phase = wrapped / duration * 4;
      const section = Math.floor(phase) % 4;
      const progress = phase - Math.floor(phase);
      const alpha = easing === 'ease' ? progress * progress * (3 - 2 * progress) : progress;
      const rotation = keys[section].get(joint).clone().slerp(keys[(section + 1) % 4].get(joint), alpha);
      const euler = new Euler().setFromQuaternion(rotation, 'XYZ');
      pose[joint] = [euler.x / radians, euler.y / radians, euler.z / radians];
    }
    const limited = clampPose(pose);
    for (const { name: joint } of joints) {
      new Quaternion().setFromEuler(new Euler(...limited[joint].map(angle => angle * radians), 'XYZ'))
        .toArray(rotations.get(joint), rotations.get(joint).length);
    }
    const lift = bounce * (1 - Math.cos(4 * Math.PI * time / duration)) / 2;
    positions.push(hipsRest[0], hipsRest[1] + lift, hipsRest[2]);
  }
  const clip = new AnimationClip(name, duration, [
    ...joints.map(joint => new QuaternionKeyframeTrack(`${joint.name}.quaternion`, times, rotations.get(joint.name))),
    new VectorKeyframeTrack('Hips.position', times, positions),
  ]);
  return ground === undefined ? clip : groundClip(clip, joints, ground);
}
