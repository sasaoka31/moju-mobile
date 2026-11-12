import { Vector3, Quaternion, Euler, MathUtils } from 'three';
import { buildMannequinBody, mannequinJoints, normalizeParams } from './mannequin.mjs';
import { setPose } from './skin.mjs';
import { solvePoseIK } from './pose_ik.mjs';
import { limitsFor, clampPose } from './joint_limits.mjs';
import { mirrorPose } from './keypose.mjs';
import { mannequinVolumes, penetration, armSamples, legVolumes, legSamples, legPenetration } from './body_volumes.mjs';

export const POSE_JOINTS = mannequinJoints().filter(j => j.name !== 'Root').map(({ name, label, parent }) => ({
  name, label: label.replace(/^(左|右)/, '$1の'), parent,
}));
export const POSE_AXES = {
  position: [
    { key: 'x', label: '左右', description: '+ は体の左へ' },
    { key: 'y', label: '上下', description: '+ は上へ' },
    { key: 'z', label: '前後', description: '+ は前へ' },
  ],
  angle: [
    { key: 'x', label: '前後に曲げる', description: '前後方向に曲げる角度（度）' },
    { key: 'y', label: 'ねじる', description: '軸のまわりにねじる角度（度）' },
    { key: 'z', label: '横に開く', description: '横方向に開く角度（度）' },
  ],
};
const internals = new WeakMap();
const axisIndex = axis => {
  const index = ['x', 'y', 'z'].indexOf(axis);
  if (index < 0) throw new Error('軸は x・y・z から選んでください');
  return index;
};
const copyState = state => ({
  pose: Object.fromEntries(Object.entries(state?.pose ?? {}).map(([name, angles]) => [name, [...angles]])),
  hips: [...(state?.hips ?? [0, 0, 0])],
});
function checkJoint(session, joint) {
  if (joint === 'Root' || !session.body.bones[joint]) throw new Error(`動かせない関節です: ${joint}`);
}

export function createPoseSession(params) {
  const p = normalizeParams(params), body = buildMannequinBody(p);
  const volumes = mannequinVolumes(p, body.joints);
  const restHips = body.bones.Hips.position.clone();
  const session = {
    body, volumes,
    apply(state) {
      const hips = state?.hips ?? [0, 0, 0];
      if (!Array.isArray(hips) || hips.length !== 3 || !hips.every(Number.isFinite)) {
        throw new Error('腰の移動は有限の数3つにしてください');
      }
      setPose(body.bones, state?.pose ?? {}, body.helpers);
      body.bones.Hips.position.copy(restHips).add(new Vector3(...hips));
      body.group.updateMatrixWorld(true);
    },
    dispose() {
      const materials = new Set();
      for (const mesh of body.meshes) {
        mesh.geometry.dispose();
        for (const material of [].concat(mesh.material)) materials.add(material);
      }
      for (const material of materials) material.dispose();
      body.skeleton.dispose();
      internals.delete(session);
    },
  };
  internals.set(session, {
    legs: legVolumes(p, body.joints), baseline: [],
    world: Object.fromEntries(body.joints.map(({ name }) => [name, { position: new Vector3(), quaternion: new Quaternion() }])),
  });
  session.apply({ pose: {}, hips: [0, 0, 0] });
  internals.get(session).baseline = depths(session);
  return session;
}

// 順番を固定し、各採取点の「床・胴・各脚」の元来の重なりだけを差し引く。
function depths(session) {
  const { world, legs } = internals.get(session);
  for (const [name, bone] of Object.entries(session.body.bones)) {
    world[name].position.setFromMatrixPosition(bone.matrixWorld);
    world[name].quaternion.setFromRotationMatrix(bone.matrixWorld);
  }
  const result = [];
  for (const side of ['Left', 'Right']) {
    for (const { point, radius } of armSamples(session.volumes, side, world)) {
      result.push(Math.max(0, radius - point.y), penetration(session.volumes, point, radius, world).depth,
        legPenetration(legs, 'Left', point, radius, world), legPenetration(legs, 'Right', point, radius, world));
    }
    for (const [index, { point, radius }] of legSamples(legs, side, world).entries()) {
      // Toes は脚同士の当たりには含めるが、床には含めない。
      result.push(index === 3 ? 0 : Math.max(0, radius - point.y),
        legPenetration(legs, side === 'Left' ? 'Right' : 'Left', point, radius, world));
    }
  }
  return result;
}
export function contactDepth(session, state) {
  session.apply(state);
  const baseline = internals.get(session).baseline;
  return Math.max(0, ...depths(session).map((depth, index) => depth - baseline[index]));
}
export function jointPosition(session, state, joint) {
  checkJoint(session, joint);
  session.apply(state);
  return new Vector3().setFromMatrixPosition(session.body.bones[joint].matrixWorld).toArray();
}

// CCD が一直線の経路から折りたためるよう、ひじ・ひざに曲げ始めを作る。
function pullJoint(session, state, joint, target, chain) {
  session.apply(state);
  const bones = session.body.bones;
  let folding = false;
  for (let step = 1; step < chain; step++) {
    const middle = upperJoint(joint, step), base = upperJoint(joint, step + 1);
    if (!middle || !base || !/(LowerArm|LowerLeg)$/.test(middle)) continue;
    const angles = state.pose[middle] ?? [0, 0, 0];
    const pivot = new Vector3().setFromMatrixPosition(bones[base].matrixWorld);
    const tip = new Vector3().setFromMatrixPosition(bones[joint].matrixWorld);
    if (pivot.distanceToSquared(new Vector3(...target)) >= pivot.distanceToSquared(tip)) continue;
    folding = true;
    if (Math.abs(angles[0]) >= 5) continue;
    const [min, max] = limitsFor(middle).x;
    state.pose[middle] = [...angles];
    state.pose[middle][0] = Math.abs(min) > Math.abs(max) ? Math.max(min, -8) : Math.min(max, 8);
    session.apply(state);
    // 曲げただけだと CCD の最初の更新で直線に戻る。付け根も目標へ向け、
    // 折れた三角形を保ったまま CCD に渡す。
    const bone = bones[base];
    const end = bone.parent.worldToLocal(new Vector3().setFromMatrixPosition(bones[joint].matrixWorld)).sub(bone.position);
    const goal = bone.parent.worldToLocal(new Vector3(...target)).sub(bone.position);
    const rotation = new Quaternion().setFromUnitVectors(end.normalize(), goal.normalize()).multiply(bone.quaternion);
    const euler = new Euler().setFromQuaternion(rotation, 'XYZ');
    state.pose[base] = clampPose({ [base]: [euler.x, euler.y, euler.z].map(MathUtils.radToDeg) })[base];
    session.apply(state);
  }
  let previousError = Infinity;
  for (let pass = 0; pass < (folding ? 12 : 1); pass++) {
    Object.assign(state.pose, solvePoseIK({ bones, pose: state.pose, joint, target, chain, iterations: 30 }));
    session.apply(state);
    const error = new Vector3().setFromMatrixPosition(bones[joint].matrixWorld).distanceTo(new Vector3(...target));
    if (error < 0.0001 || previousError - error < 1e-6) break;
    previousError = error;
  }
}

function pinnedFeet(session, state) {
  session.apply(state);
  return ['LeftFoot', 'RightFoot'].map(joint => ({
    joint,
    position: new Vector3().setFromMatrixPosition(session.body.bones[joint].matrixWorld),
    quaternion: session.body.bones[joint].getWorldQuaternion(new Quaternion()),
  }));
}

function restoreFeet(session, state, feet) {
  for (const { joint, position, quaternion } of feet) {
    pullJoint(session, state, joint, position.toArray(), 2);
    session.apply(state);
    const bone = session.body.bones[joint];
    if (new Vector3().setFromMatrixPosition(bone.matrixWorld).distanceTo(position) >= 0.008) return false;
    const local = bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(quaternion);
    const euler = new Euler().setFromQuaternion(local, 'XYZ');
    state.pose[joint] = [euler.x, euler.y, euler.z].map(MathUtils.radToDeg);
  }
  return true;
}

function positionWalk(session, state, { joint, axis, chain = 1, pinFeet = true }) {
  const index = axisIndex(axis);
  const origin = jointPosition(session, state, joint);
  const threshold = contactDepth(session, state) + 0.001;
  const count = Math.max(1, Math.min(4, Math.floor(chain) || 1));
  const feet = joint === 'Hips' && pinFeet ? pinnedFeet(session, state) : null;
  const counts = [];
  if (chain === 'auto' && joint !== 'Hips') {
    // solvePoseIK と同じ実際の親経路を数え、Hips 以降の重複候補を省く。
    for (let bone = session.body.bones[joint].parent; bone && counts.length < 6; bone = bone.parent) {
      if (bone.name === 'Hips' || bone.name === 'Root' || session.body.bones[bone.name] !== bone) break;
      counts.push(counts.length + 1);
    }
  }
  const outside = joint.startsWith('Right') ? -1 : 1;
  const detours = [[2, 1], [0, outside], [1, 1], [2, -1], [0, -outside], [1, -1]]
    .filter(([offsetAxis]) => offsetAxis !== index);
  return { state, joint, index, origin, threshold, count, counts: chain === 'auto' ? counts : null,
    detours, feet, limit: joint === 'Hips' ? 0.5 : 0.8 };
}

function acceptPosition(session, walk, accepted, direction, target, candidate) {
  const { joint, index, threshold } = walk;
  const actual = jointPosition(session, candidate, joint);
  const requested = direction * (target[index] - accepted.value);
  if (direction * (actual[index] - accepted.value) < Math.min(0.001, requested * 0.2) - 1e-10 ||
      contactDepth(session, candidate) > threshold + 1e-10) return null;
  return { state: candidate, value: actual[index] };
}

function autoPositionStep(session, walk, accepted, direction, target) {
  const attempt = (goal, count) => {
    // 不採用の試行は次の候補に引き継がない。
    const candidate = copyState(accepted.state);
    pullJoint(session, candidate, walk.joint, goal, count);
    return acceptPosition(session, walk, accepted, direction, goal, candidate);
  };
  for (const count of walk.counts) {
    const next = attempt(target, count);
    if (next) return next;
  }
  // 回り道は最大3種類の長さに絞る。短い腕の経路と最も長い経路を残す。
  const counts = walk.counts.length <= 3 ? walk.counts : [walk.counts[0], walk.counts[1], walk.counts.at(-1)];
  for (const [axis, sign] of walk.detours) {
    for (const offset of [0.01, 0.03, 0.09]) {
      const goal = [...target];
      goal[axis] += sign * offset;
      for (const count of counts) {
        const next = attempt(goal, count);
        if (next) return next;
      }
    }
  }
  return null;
}

function positionStep(session, walk, accepted, direction, travel) {
  const { state, joint, index, origin, count, feet } = walk;
  const target = jointPosition(session, accepted.state, joint);
  target[index] = origin[index] + direction * travel;
  if (joint !== 'Hips' && walk.counts) return autoPositionStep(session, walk, accepted, direction, target);
  const candidate = copyState(accepted.state);
  if (joint === 'Hips') {
    candidate.hips[index] = (state.hips?.[index] ?? 0) + direction * travel;
    if (Math.abs(candidate.hips[index]) > 0.5 + 1e-10) return null;
    if (feet && !restoreFeet(session, candidate, feet)) return null;
  }
  else {
    pullJoint(session, candidate, joint, target, count);
  }
  return acceptPosition(session, walk, accepted, direction, target, candidate);
}

function* positionSteps(session, state, options, direction, distance) {
  const walk = positionWalk(session, state, options);
  const cap = Math.min(walk.limit, distance);
  let accepted = { state: copyState(state), value: walk.origin[walk.index] };
  // 端数も最後の1歩として検査する。moveJoint もこの経路を必ず通る。
  for (let step = 1; ; step++) {
    const travel = Math.min(step * 0.005, cap);
    if (travel <= 0) break;
    const next = positionStep(session, walk, accepted, direction, travel);
    if (!next) break;
    accepted = next;
    if (travel >= cap) break;
    yield;
  }
  return accepted;
}
function walkPosition(session, state, options, direction, distance) {
  const steps = positionSteps(session, state, options, direction, distance);
  let next;
  do { next = steps.next(); } while (!next.done);
  return next.value;
}
export function positionRange(session, state, options) {
  return createRangeTask(session, state, options).run(Infinity);
}
export function createRangeTask(session, state, options) {
  function* rangeSteps() {
    const value = jointPosition(session, state, options.joint)[axisIndex(options.axis)];
    const min = (yield* positionSteps(session, state, options, -1, Infinity)).value;
    const max = (yield* positionSteps(session, state, options, 1, Infinity)).value;
    return { min, max, value };
  }
  const steps = rangeSteps();
  let result = null;
  return {
    run(budgetMs) {
      try {
        if (result) return result;
        const deadline = performance.now() + Math.max(0, budgetMs);
        do {
          const next = steps.next();
          if (next.done) { result = next.value; return result; }
        } while (budgetMs === Infinity || performance.now() < deadline);
        return null;
      } finally { session.apply(state); }
    },
  };
}
export function moveJoint(session, state, options) {
  if (!Number.isFinite(options.value)) throw new Error('位置は有限の数にしてください');
  const value = jointPosition(session, state, options.joint)[axisIndex(options.axis)];
  // 範囲と同じ経路を歩くので、逆方向の範囲まで計算する必要はない。
  const result = walkPosition(session, state, options, Math.sign(options.value - value), Math.abs(options.value - value)).state;
  session.apply(result);
  return result;
}

export function createMoveGesture(session, state, options) {
  const walk = positionWalk(session, copyState(state), options);
  const origin = walk.origin[walk.index];
  const initial = { state: copyState(state), value: origin };
  const sides = new Map([-1, 1].map(direction => [direction, { steps: [initial], stopped: false }]));
  return {
    moveTo(value) {
      if (!Number.isFinite(value)) throw new Error('位置は有限の数にしてください');
      const direction = Math.sign(value - origin);
      const cap = Math.min(walk.limit, Math.abs(value - origin));
      let accepted = initial;
      if (direction) {
        const side = sides.get(direction);
        // 掛け算を walkPosition とそろえ、浮動小数点の境界でも同じ歩数にする。
        let whole = Math.floor(cap / 0.005);
        while ((whole + 1) * 0.005 <= cap) whole++;
        while (whole * 0.005 > cap) whole--;
        while (side.steps.length <= whole && !side.stopped) {
          const next = positionStep(session, walk, side.steps[side.steps.length - 1],
            direction, side.steps.length * 0.005);
          if (next) side.steps.push(next);
          else side.stopped = true;
        }
        accepted = side.steps[Math.min(whole, side.steps.length - 1)];
        // 端数での停止は整数歩の停止とは別。次回は直前の整数歩から再計算する。
        if (whole < side.steps.length && whole * 0.005 < cap) {
          accepted = positionStep(session, walk, accepted, direction, cap) ?? accepted;
        }
      }
      const result = copyState(accepted.state);
      session.apply(result);
      return result;
    },
  };
}
function walkAngle(session, state, { joint, axis }, direction, destination) {
  checkJoint(session, joint);
  const index = axisIndex(axis), limits = limitsFor(joint)[axis];
  const value = state.pose?.[joint]?.[index] ?? 0;
  const end = Math.max(limits[0], Math.min(limits[1], destination));
  const threshold = contactDepth(session, state) + 0.001;
  let accepted = copyState(state), angle = value;
  for (let step = 1; Math.abs(end - value) > 0; step++) {
    // 小数の角度では value + (end - value) が end とぴったり同じにならず、終わらなくなる。
    // 残りが 1 歩以下なら end そのものを使う。
    const next = step >= Math.abs(end - value) ? end : value + direction * step;
    const candidate = copyState(state);
    candidate.pose[joint] ??= [0, 0, 0];
    candidate.pose[joint][index] = next;
    if (contactDepth(session, candidate) > threshold + 1e-10) break;
    accepted = candidate;
    angle = next;
    if (next === end) break;
  }
  return { state: accepted, value: angle };
}
export function angleRange(session, state, options) {
  checkJoint(session, options.joint);
  const value = state.pose?.[options.joint]?.[axisIndex(options.axis)] ?? 0;
  const [min, max] = limitsFor(options.joint)[options.axis];
  try {
    return { min: walkAngle(session, state, options, -1, min).value,
      max: walkAngle(session, state, options, 1, max).value, value };
  } finally { session.apply(state); }
}
export function rotateJoint(session, state, options) {
  if (!Number.isFinite(options.value)) throw new Error('角度は有限の数にしてください');
  const range = angleRange(session, state, options);
  const destination = Math.max(range.min, Math.min(range.max, options.value));
  const result = walkAngle(session, state, options, Math.sign(destination - range.value), destination).state;
  session.apply(result);
  return result;
}
export function upperJoint(joint, steps) {
  if (!Number.isInteger(steps) || steps < 0) return null;
  let current = POSE_JOINTS.find(j => j.name === joint);
  for (let i = 0; i < steps && current; i++) current = POSE_JOINTS.find(j => j.name === current.parent);
  return current?.name ?? null;
}
export function mirrorState(state) {
  const result = copyState(state);
  result.pose = mirrorPose(result.pose);
  result.hips[0] = result.hips[0] === 0 ? 0 : -result.hips[0];
  return result;
}
