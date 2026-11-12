import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack, MathUtils } from 'three';
import { mannequinJoints } from './mannequin.mjs';
import { clampPose } from './joint_limits.mjs';

export const CUSTOM_PREFIX = 'u/';
const jointNames = new Set(mannequinJoints().filter(j => j.name !== 'Root').map(j => j.name));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const bound = (value, min, max) => Math.max(min, Math.min(max, value));
const cleanName = name => (typeof name === 'string' ? name.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) : '') || 'CustomMotion';
const copyState = state => ({ pose: Object.fromEntries(Object.entries(state.pose).map(([name, angles]) => [name, [...angles]])),
  hips: [...state.hips] });
const cleanState = value => ({
  pose: clampPose(Object.fromEntries(Object.entries(record(value?.pose) ? value.pose : {})
    .filter(([name, angles]) => jointNames.has(name) && vector(angles)).map(([name, angles]) => [name, [...angles]]))),
  hips: vector(value?.hips) ? [...value.hips] : [0, 0, 0],
});

export function defaultCustomMotion(name) {
  return { name: cleanName(name), label: '自分で作る動き', duration: 1, loop: false, ease: 'ease',
    keys: [0, 1].map(t => ({ t, pose: {}, hips: [0, 0, 0] })) };
}

export function normalizeCustomMotion(value) {
  if (!record(value)) return defaultCustomMotion();
  const result = {
    name: cleanName(value.name),
    label: typeof value.label === 'string' && value.label.trim() ? value.label : '自分で作る動き',
    duration: Number.isFinite(value.duration) ? bound(value.duration, 0.2, 10) : 1,
    loop: value.loop === true, ease: value.ease === 'linear' ? 'linear' : 'ease',
  };
  const keys = (Array.isArray(value.keys) ? value.keys : []).filter(key => record(key) && Number.isFinite(key.t))
    .map(key => ({ t: bound(key.t, 0, result.duration), ...cleanState(key) })).sort((a, b) => a.t - b.t);
  if (!keys.length) return defaultCustomMotion(result.name);
  if (keys.length === 1) keys.push({ t: result.duration, ...copyState(keys[0]) });
  // 有限の時間内に収まるだけ中間を残し、両端の姿勢を必ず保つ。
  const middle = keys.slice(1, -1).slice(0, Math.floor(result.duration / 0.01 + 1e-8) - 1);
  result.keys = [keys[0], ...middle, keys.at(-1)];
  result.keys[0].t = 0;
  result.keys.at(-1).t = result.duration;
  for (let i = 1; i < result.keys.length - 1; i++) {
    const latest = result.duration - (result.keys.length - 1 - i) * 0.01;
    result.keys[i].t = Math.round(bound(result.keys[i].t, result.keys[i - 1].t + 0.01, latest) * 1e9) / 1e9;
  }
  return result;
}

const rotation = angles => new Quaternion().setFromEuler(new Euler(...angles.map(MathUtils.degToRad), 'XYZ'));
function interpolate(motion, time) {
  const keys = motion.keys;
  const t = bound(Number.isFinite(time) ? time : 0, 0, motion.duration);
  let index = 0;
  while (index < keys.length - 2 && t > keys[index + 1].t) index++;
  const a = keys[index];
  const b = motion.loop && index + 1 === keys.length - 1 ? { ...keys[0], t: motion.duration } : keys[index + 1];
  if (t === a.t) return copyState(a);
  if (t === b.t) return copyState(b);
  let alpha = (t - a.t) / (b.t - a.t);
  if (motion.ease === 'ease') alpha = alpha * alpha * (3 - 2 * alpha);
  const pose = {};
  for (const name of new Set([...Object.keys(a.pose), ...Object.keys(b.pose)])) {
    const q = rotation(a.pose[name] ?? [0, 0, 0]).slerp(rotation(b.pose[name] ?? [0, 0, 0]), alpha).normalize();
    const euler = new Euler().setFromQuaternion(q, 'XYZ');
    pose[name] = [euler.x, euler.y, euler.z].map(MathUtils.radToDeg);
  }
  return { pose, hips: a.hips.map((v, axis) => v + (b.hips[axis] - v) * alpha) };
}
export function stateAt(motion, t) {
  return interpolate(normalizeCustomMotion(motion), t);
}

function checkIndex(motion, index, middleOnly = false) {
  if (!Number.isInteger(index) || index < (middleOnly ? 1 : 0) || index >= motion.keys.length - (middleOnly ? 1 : 0)) {
    throw new Error(middleOnly ? '変更できるのは中間のキーだけです' : 'キーが見つかりません');
  }
}
export function addMiddleKey(motion, t) {
  const result = normalizeCustomMotion(motion);
  if (!Number.isFinite(t) || t <= 0.02 || t >= result.duration - 0.02 ||
      result.keys.some(key => Math.abs(key.t - t) < 0.01 - 1e-9)) {
    throw new Error('中間は最初・最後から0.02秒より離し、ほかのキーから0.01秒以上離してください');
  }
  result.keys.push({ t, ...interpolate(result, t) });
  result.keys.sort((a, b) => a.t - b.t);
  return result;
}
export function removeKey(motion, index) {
  const result = normalizeCustomMotion(motion);
  checkIndex(result, index, true);
  result.keys.splice(index, 1);
  return result;
}
export function moveKey(motion, index, t) {
  const result = normalizeCustomMotion(motion);
  checkIndex(result, index, true);
  if (!Number.isFinite(t)) throw new Error('時刻は有限の数にしてください');
  result.keys[index].t = bound(t, result.keys[index - 1].t + 0.01, result.keys[index + 1].t - 0.01);
  return result;
}
export function setKeyState(motion, index, state) {
  const result = normalizeCustomMotion(motion);
  checkIndex(result, index);
  result.keys[index] = { t: result.keys[index].t, ...cleanState(state) };
  return result;
}

export function buildCustomClip(motion, joints, { fps = 30 } = {}) {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('コマ数は正の有限数にしてください');
  const normalized = normalizeCustomMotion(motion);
  const byName = new Map(joints.map(j => [j.name, j]));
  const names = ['Root', ...jointNames];
  for (const name of names) {
    if (!vector(byName.get(name)?.position)) throw new Error(`関節が足りないか位置が壊れています: ${name}`);
  }
  const duration = normalized.duration, end = Math.fround(duration), times = [0];
  for (let frame = 1; Math.fround(frame / fps) < end; frame++) {
    const time = Math.fround(frame / fps);
    if (time > times.at(-1)) times.push(time);
  }
  times.push(end);
  const rotations = new Map(names.map(name => [name, []]));
  const positions = [];
  const hipsRest = byName.get('Hips').position.map((v, axis) => v - byName.get('Root').position[axis]);
  for (let i = 0; i < times.length; i++) {
    const state = interpolate(normalized, i === times.length - 1 ? duration : times[i]);
    for (const [name, output] of rotations) rotation(state.pose[name] ?? [0, 0, 0]).toArray(output, output.length);
    positions.push(...state.hips.map((v, axis) => v + hipsRest[axis]));
  }
  return new AnimationClip(`${CUSTOM_PREFIX}${normalized.name}`, duration, [
    ...[...rotations].map(([name, output]) => new QuaternionKeyframeTrack(`${name}.quaternion`, times, output)),
    new VectorKeyframeTrack('Hips.position', times, positions),
  ]);
}
