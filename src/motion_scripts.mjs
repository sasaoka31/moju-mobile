import {
  AnimationClip, Bone, Euler, Group, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack,
} from 'three';
import { mirrorPose } from './keypose.mjs';
import { retargetClips } from './motions.mjs';
import { MOTION_SCRIPTS } from './motion_scripts_data.mjs';

// 局所座標。回転ゼロで気をつけの姿勢、Left は +X、前は +Z。
const skeleton = [
  ['Root', null, [0, 0, 0]],
  ['Hips', 'Root', [0, 1.0, 0]],
  ['Spine', 'Hips', [0, 0.12, 0]],
  ['Chest', 'Spine', [0, 0.14, 0]],
  ['UpperChest', 'Chest', [0, 0.14, 0]],
  ['Neck', 'UpperChest', [0, 0.16, 0]],
  ['Head', 'Neck', [0, 0.10, 0]],
  ...['Left', 'Right'].flatMap((side, index) => {
    const sign = index === 0 ? 1 : -1;
    return [
      [side + 'Shoulder', 'UpperChest', [sign * 0.06, 0.10, 0]],
      [side + 'UpperArm', side + 'Shoulder', [sign * 0.14, 0, 0]],
      [side + 'LowerArm', side + 'UpperArm', [0, -0.30, 0]],
      [side + 'Hand', side + 'LowerArm', [0, -0.27, 0]],
      [side + 'UpperLeg', 'Hips', [sign * 0.10, -0.05, 0]],
      [side + 'LowerLeg', side + 'UpperLeg', [0, -0.45, 0]],
      [side + 'Foot', side + 'LowerLeg', [0, -0.42, 0]],
      [side + 'Toes', side + 'Foot', [0, -0.06, 0.14]],
    ];
  }),
];
const jointNames = new Set(skeleton.map(([name]) => name));
const groupLabels = { fight: '戦う', move: '移動', emote: '気持ち' };
export const SCRIPT_LABELS = Object.fromEntries(MOTION_SCRIPTS.map(script => [`s/${script.name}`, script.label]));
export const SCRIPT_GROUPS = Object.keys(groupLabels).map(key => ({
  key, label: groupLabels[key],
  motions: MOTION_SCRIPTS.filter(script => script.group === key)
    .map(script => ({ name: `s/${script.name}`, label: script.label })),
})).filter(group => group.motions.length);

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const vector = value => Array.isArray(value) && value.length === 3 && Array.from(value).every(Number.isFinite);

function validateScript(script) {
  if (!record(script) || typeof script.name !== 'string' || !script.name.trim()) {
    throw new Error('台本の名前を指定してください');
  }
  const fail = message => { throw new Error(`台本「${script.name}」: ${message}`); };
  if (!Number.isFinite(script.duration) || script.duration <= 0) fail('長さは正の有限の秒数にしてください');
  if (!['ease', 'linear'].includes(script.ease)) fail('速さは ease または linear にしてください');
  if (!record(script.poses)) fail('ポーズは名前と関節の角度の組にしてください');
  for (const [poseName, pose] of Object.entries(script.poses)) {
    if (!record(pose)) fail(`ポーズ「${poseName}」は関節名と角度の組にしてください`);
    for (const [name, angles] of Object.entries(pose)) {
      if (!jointNames.has(name)) fail(`知らない関節名です: ${name}`);
      if (!vector(angles)) fail(`${name}の角度は有限の数3つにしてください`);
    }
  }
  if (!Array.isArray(script.keys) || script.keys.length < 2) fail('キーを最初と最後の2つ以上指定してください');
  let previous = -Infinity;
  for (const key of script.keys) {
    if (!record(key) || !Number.isFinite(key.t) || key.t <= previous) fail('キーの時刻 t は昇順にしてください');
    previous = key.t;
    if (typeof key.pose !== 'string' || !Object.hasOwn(script.poses, key.pose)) fail(`存在しないポーズ名です: ${key.pose}`);
    if (key.hips !== undefined && !vector(key.hips)) fail('腰の移動 hips は有限の数3つにしてください');
    if (key.mirror !== undefined && typeof key.mirror !== 'boolean') fail('左右反転 mirror は true または false にしてください');
  }
  if (script.keys[0].t !== 0) fail('最初のキーの時刻は0にしてください');
  if (script.keys.at(-1).t !== script.duration) fail('最後のキーの時刻と duration を一致させてください');
}

/** 台本を焼いたお手本。呼び出すたび独立した骨とクリップを返す。 */
export function buildScriptSource(scripts = MOTION_SCRIPTS, { fps = 30 } = {}) {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('台本のコマ数は1秒あたりの正の有限数にしてください');
  if (!Array.isArray(scripts)) throw new Error('台本は配列で指定してください');
  const names = new Set();
  for (const script of scripts) {
    validateScript(script);
    if (names.has(script.name)) throw new Error(`台本の名前が重複しています: ${script.name}`);
    names.add(script.name);
  }
  const scene = new Group();
  const bones = new Map();
  for (const [name, parent, position] of skeleton) {
    const bone = new Bone();
    bone.name = name;
    bone.position.fromArray(position);
    (parent === null ? scene : bones.get(parent)).add(bone);
    bones.set(name, bone);
  }
  scene.updateMatrixWorld(true);
  const clips = scripts.map(script => {
    const keys = script.keys.map(key => {
      const pose = key.mirror ? mirrorPose(script.poses[key.pose]) : script.poses[key.pose];
      const hips = [...(key.hips ?? [0, 0, 0])];
      if (key.mirror) hips[0] = -hips[0];
      return {
        t: key.t, hips,
        rotations: new Map(skeleton.map(([name]) => [name, new Quaternion().setFromEuler(
          new Euler(...(pose[name] ?? [0, 0, 0]).map(angle => angle * Math.PI / 180), 'XYZ'))])),
      };
    });
    // loop の終端は最初の姿勢と腰位置を使い、最後の区間も自然につなぐ。
    if (script.loop) keys[keys.length - 1] = { ...keys[0], t: script.duration };
    const times = [0];
    for (let frame = 1; Math.fround(frame / fps) < Math.fround(script.duration); frame++) {
      times.push(Math.fround(frame / fps));
    }
    times.push(script.duration);
    const values = new Map(skeleton.map(([name]) => [name, []]));
    const positions = [];
    const rotation = new Quaternion();
    let segment = 0;
    for (const time of times) {
      while (segment < keys.length - 2 && time > keys[segment + 1].t) segment++;
      const a = keys[segment], b = keys[segment + 1];
      let alpha = Math.max(0, Math.min(1, (time - a.t) / (b.t - a.t)));
      if (script.ease === 'ease') alpha = alpha * alpha * (3 - 2 * alpha);
      for (const [name, output] of values) {
        rotation.slerpQuaternions(a.rotations.get(name), b.rotations.get(name), alpha).normalize();
        rotation.toArray(output, output.length);
      }
      positions.push(...a.hips.map((value, axis) => value + (b.hips[axis] - value) * alpha + (axis === 1 ? 1 : 0)));
    }
    return new AnimationClip(`s/${script.name}`, script.duration, [
      ...[...values].map(([name, output]) => new QuaternionKeyframeTrack(`${name}.quaternion`, times, output)),
      new VectorKeyframeTrack('Hips.position', times, positions),
    ]);
  });
  return { scene, clips };
}

export function loadScriptedMotions(joints, options = {}) {
  return retargetClips(buildScriptSource(MOTION_SCRIPTS, { fps: options.fps ?? 30 }), joints, options);
}
