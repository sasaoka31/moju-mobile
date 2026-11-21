import { Quaternion, Vector3 } from 'three';

export const POLISH_INFO = Object.freeze({
  footLock: { label: '足を固定する', description: '地面についている足をその場にとどめ、足の滑りを減らします。', min: 0, max: 1, step: 0.05 },
  balance: { label: '重心を足の上へ', description: '体の重さが足の上に乗るように整え、安定した姿勢にします。', min: 0, max: 1, step: 0.05 },
  follow: { label: '遅れと行き過ぎ', description: '体の部分が少し遅れて動き、止まるときに少し行き過ぎる動きを加えます。', min: 0, max: 1, step: 0.05 },
  jump: { label: '跳ぶ動きを放物線に', description: '跳んでいる間の体の道すじを、自然な山なりの形に整えます。', min: 0, max: 1, step: 0.05 },
});
export const DEFAULT_POLISH = Object.freeze({ footLock: 0, balance: 0, follow: 0, jump: 0 });
export const RECOMMENDED_POLISH = Object.freeze({ footLock: 1, balance: 0.6, follow: 0.5, jump: 1 });

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function normalizePolish(value) {
  return Object.fromEntries(Object.keys(DEFAULT_POLISH).map(name => [name,
    Number.isFinite(value?.[name]) ? clamp(value[name], 0, 1) : 0]));
}

const entries = rotations => rotations instanceof Map ? [...rotations] : Object.entries(rotations);
const getRotation = (frame, name) => new Quaternion().fromArray(
  (frame.rotations instanceof Map ? frame.rotations.get(name) : frame.rotations[name]) ?? [0, 0, 0, 1]);
function setRotation(frame, name, rotation) {
  const value = rotation.normalize().toArray();
  if (frame.rotations instanceof Map) frame.rotations.set(name, value);
  else frame.rotations[name] = value;
}
function copyFrame(frame) {
  const rotations = entries(frame.rotations).map(([name, value]) => [name, [...value]]);
  return { ...frame, hips: [...frame.hips], rotations: frame.rotations instanceof Map
    ? new Map(rotations) : Object.fromEntries(rotations) };
}
function sameFrame(a, b) {
  const ar = entries(a.rotations), br = entries(b.rotations);
  return a.hips.every((v, i) => v === b.hips[i]) && ar.length === br.length && ar.every(([name, value]) => {
    const other = b.rotations instanceof Map ? b.rotations.get(name) : b.rotations[name];
    return other && value.every((v, i) => v === other[i]);
  });
}

// Joint positions are absolute rest positions; animation rotations are local to each parent.
function forward(frame, byName) {
  const world = new Map();
  function visit(name) {
    if (world.has(name)) return world.get(name);
    const joint = byName.get(name), parent = byName.get(joint.parent);
    const local = new Vector3().fromArray(joint.position);
    if (parent) local.sub(new Vector3().fromArray(parent.position));
    if (name === 'Hips') local.fromArray(frame.hips);
    const rotation = getRotation(frame, name);
    if (parent) {
      const transform = visit(parent.name);
      local.applyQuaternion(transform.rotation).add(transform.position);
      rotation.premultiply(transform.rotation);
    }
    const result = { position: local, rotation };
    world.set(name, result);
    return result;
  }
  for (const name of byName.keys()) visit(name);
  return world;
}

function contactRuns(points, fps, loop) {
  const n = points.length;
  let floor = Infinity;
  for (const point of points) floor = Math.min(floor, point.y);
  const contact = points.map((point, i) => {
    const previous = points[i ? i - 1 : loop ? n - 1 : 0];
    return point.y <= floor + 0.03 + 1e-10 &&
      Math.hypot(point.x - previous.x, point.z - previous.z) * fps <= 0.35 + 1e-10;
  });
  // Start after a gap so a contact crossing the loop seam stays a single run.
  const gap = loop ? contact.indexOf(false) : -1;
  const start = gap < 0 ? 0 : gap + 1;
  const runs = [];
  let run = [];
  for (let offset = 0; offset < n; offset++) {
    const i = (start + offset) % n;
    if (contact[i]) run.push(i);
    else if (run.length) { if (run.length >= 3) runs.push(run); run = []; }
  }
  if (run.length >= 3) runs.push(run);
  return runs;
}

const FOLLOW_HZ = 7;
const FOLLOW_DAMPING = 0.55;
const FOLLOW_MAX_ANGLE = 25 * Math.PI / 180;
const FOLLOW_RATES = Object.freeze({
  LeftShoulder: 1, RightShoulder: 1, LeftClavicle: 1, RightClavicle: 1,
  LeftUpperArm: 1, RightUpperArm: 1, LeftLowerArm: 0.85, RightLowerArm: 0.85,
  LeftHand: 0.7, RightHand: 0.7, Neck: 1, Head: 0.85,
});
const BALANCE_MASS = Object.freeze({
  Hips: 20, Spine: 8, Chest: 9, UpperChest: 8, Neck: 2, Head: 8,
  LeftShoulder: 1, RightShoulder: 1,
  LeftUpperArm: 3, RightUpperArm: 3, LeftLowerArm: 2, RightLowerArm: 2,
  LeftHand: 1, RightHand: 1, LeftUpperLeg: 10, RightUpperLeg: 10,
  LeftLowerLeg: 5, RightLowerLeg: 5, LeftFoot: 2, RightFoot: 2,
});
const JUMP_GRAVITY = 9.8;
const BALANCE_MAX_OFFSET = 0.08;
const BALANCE_MAX_STEP = 0.03;

// Shortest quaternion difference, expressed as a rotation vector in parent space.
function rotationVector(rotation) {
  const q = rotation.clone().normalize();
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const length = Math.hypot(q.x, q.y, q.z);
  return new Vector3(q.x, q.y, q.z).multiplyScalar(length < 1e-12 ? 2 :
    2 * Math.atan2(length, clamp(q.w, -1, 1)) / length);
}
function vectorRotation(vector) {
  const angle = vector.length();
  return angle < 1e-12 ? new Quaternion() :
    new Quaternion().setFromAxisAngle(vector.clone().divideScalar(angle), angle);
}
function followFrames(output, byName, count, strength, fps, loop) {
  for (const [name, rate] of Object.entries(FOLLOW_RATES)) {
    if (!byName.has(name)) continue;
    const targets = output.slice(0, count).map(frame => getRotation(frame, name).normalize());
    let current = targets[0].clone();
    const velocity = new Vector3();
    const omega = 2 * Math.PI * FOLLOW_HZ * rate, decay = FOLLOW_DAMPING * omega;
    const damped = omega * Math.sqrt(1 - FOLLOW_DAMPING ** 2);
    const attenuation = Math.exp(-decay / fps), cosine = Math.cos(damped / fps);
    const sine = Math.sin(damped / fps) / damped;
    // Exact integration with a fixed target per sample stays stable at any fps.
    for (let step = loop ? 0 : 1; step < count * (loop ? 2 : 1); step++) {
      const i = step % count, target = targets[i];
      const error = rotationVector(current.clone().multiply(target.clone().invert()));
      const next = error.clone().multiplyScalar(cosine + decay * sine)
        .addScaledVector(velocity, sine).multiplyScalar(attenuation);
      velocity.multiplyScalar(cosine - decay * sine).addScaledVector(error, -omega * omega * sine)
        .multiplyScalar(attenuation);
      next.clampLength(0, FOLLOW_MAX_ANGLE);
      if (next.lengthSq() > 0 && next.length() >= FOLLOW_MAX_ANGLE - 1e-12) {
        const outward = velocity.dot(next) / next.lengthSq();
        if (outward > 0) velocity.addScaledVector(next, -outward);
      }
      current = vectorRotation(next).multiply(target).normalize();
      if (loop && step < count) continue;
      const fade = loop ? 1 : Math.min(1, (count - 1 - i) / 4);
      if (fade > 0) setRotation(output[i], name, target.clone().slerp(current, strength * fade));
    }
  }
}

function jumpFrames(output, byName, count, strength, fps, loop) {
  if (!byName.has('LeftFoot') || !byName.has('RightFoot')) return;
  const worlds = output.slice(0, count).map(frame => forward(frame, byName));
  const feet = ['LeftFoot', 'RightFoot'].map(name => worlds.map(world => world.get(name).position.y));
  const floors = feet.map(heights => heights.reduce((a, b) => Math.min(a, b), Infinity));
  const airborne = worlds.map((_, i) => feet.every((heights, side) => heights[i] > floors[side] + 0.05));
  const gap = airborne.indexOf(false);
  if (gap < 0) return; // No known landing or takeoff.
  const start = loop ? gap + 1 : 0;
  const heights = output.slice(0, count).map(frame => frame.hips[1]);
  let run = [];
  const apply = () => {
    if (run.length < 3 || (!loop && (run[0] === 0 || run.at(-1) === count - 1))) return;
    // The grounded samples immediately outside the run anchor takeoff and landing.
    const before = (run[0] - 1 + count) % count, after = (run.at(-1) + 1) % count;
    const duration = (run.length + 1) / fps, y0 = heights[before], y1 = heights[after];
    for (const [offset, i] of run.entries()) {
      const t = (offset + 1) / fps;
      const y = y0 + (y1 - y0) * t / duration + JUMP_GRAVITY * t * (duration - t) / 2;
      output[i].hips[1] += strength * clamp(y - heights[i], -0.5, 0.5);
    }
  };
  for (let offset = 0; offset < count; offset++) {
    const i = (start + offset) % count;
    if (airborne[i]) run.push(i);
    else { apply(); run = []; }
  }
  apply();
}

function balanceFrames(output, byName, count, strength, fps, loop) {
  // A legs-only rig has no torso mass from which to estimate body balance.
  if (!['Spine', 'Chest', 'UpperChest', 'Head'].some(name => byName.has(name))) return;
  const worlds = output.slice(0, count).map(frame => forward(frame, byName));
  const supports = Array.from({ length: count }, () => []);
  for (const side of ['Left', 'Right']) {
    const name = `${side}Foot`;
    if (!byName.has(name)) continue;
    const points = worlds.map(world => world.get(name).position);
    for (const run of contactRuns(points, fps, loop)) {
      for (const i of run) supports[i].push(points[i]);
    }
  }
  const offsets = worlds.map((world, i) => {
    const center = new Vector3(), support = new Vector3();
    let mass = 0;
    for (const [name, weight] of Object.entries(BALANCE_MASS)) {
      if (!world.has(name)) continue;
      center.addScaledVector(world.get(name).position, weight);
      mass += weight;
    }
    if (!mass || !supports[i].length) return support;
    for (const foot of supports[i]) support.add(foot);
    support.divideScalar(supports[i].length).sub(center.divideScalar(mass));
    support.y = 0;
    const parent = world.get(byName.get('Hips')?.parent);
    if (parent) support.applyQuaternion(parent.rotation.clone().invert());
    support.y = 0;
    if (support.lengthSq() < 1e-24) return support.set(0, 0, 0);
    return support.clampLength(0, BALANCE_MAX_OFFSET);
  });
  // A symmetric five-sample window also wraps at the loop seam.
  const smooth = offsets.map((_, i) => {
    const result = new Vector3();
    if (!supports[i].length) return result;
    let total = 0;
    for (let delta = -2; delta <= 2; delta++) {
      const index = loop ? (i + delta + count) % count : i + delta;
      if (index < 0 || index >= count) continue;
      const weight = 3 - Math.abs(delta);
      result.addScaledVector(offsets[index], weight);
      total += weight;
    }
    return result.divideScalar(total);
  });
  let previous = loop ? smooth.at(-1).clone() : new Vector3();
  for (let i = 0; i < count; i++) {
    if (supports[i].length) smooth[i].copy(previous.clone().add(
      smooth[i].clone().sub(previous).clampLength(0, BALANCE_MAX_STEP)));
    previous = smooth[i];
  }
  // A final uniform contraction preserves airborne zeros and caps every seam/landing step.
  let largestStep = 0;
  for (let i = 0; i < count; i++) {
    const before = i ? smooth[i - 1] : loop ? smooth.at(-1) : new Vector3();
    largestStep = Math.max(largestStep, smooth[i].distanceTo(before));
  }
  const scale = largestStep > BALANCE_MAX_STEP ? BALANCE_MAX_STEP / largestStep : 1;
  for (let i = 0; i < count; i++) {
    const offset = smooth[i].multiplyScalar(scale * strength);
    for (let axis = 0; axis < 3; axis += 2) output[i].hips[axis] += offset.getComponent(axis);
  }
}

function lockLeg(frame, world, byName, side, target, amount) {
  const upperName = `${side}UpperLeg`, lowerName = `${side}LowerLeg`, footName = `${side}Foot`;
  const upper = world.get(upperName), lower = world.get(lowerName), foot = world.get(footName);
  const thigh = lower.position.clone().sub(upper.position), shin = foot.position.clone().sub(lower.position);
  const a = thigh.length(), b = shin.length();
  if (a < 1e-8 || b < 1e-8) return;
  const oldAxis = foot.position.clone().sub(upper.position).normalize();
  const axis = target.clone().sub(upper.position);
  const distance = clamp(axis.length(), Math.max(1e-8, Math.abs(a - b)), a + b);
  if (axis.lengthSq() < 1e-16) axis.copy(oldAxis.lengthSq() ? oldAxis : new Vector3(0, -1, 0));
  axis.normalize();
  // Keep the original knee plane; a straight leg bends toward the body's front (+z).
  const pole = thigh.clone().addScaledVector(oldAxis, -thigh.dot(oldAxis));
  if (pole.length() < (a + b) * 1e-4) {
    pole.set(0, 0, 1).applyQuaternion(world.get('Hips')?.rotation ?? new Quaternion());
  }
  pole.addScaledVector(axis, -pole.dot(axis));
  if (pole.lengthSq() < 1e-12) {
    pole.set(1, 0, 0).addScaledVector(axis, -axis.x);
    if (pole.lengthSq() < 1e-12) pole.set(0, 1, 0).addScaledVector(axis, -axis.y);
  }
  pole.normalize();
  const along = clamp((a * a - b * b + distance * distance) / (2 * distance), -a, a);
  const knee = upper.position.clone().addScaledVector(axis, along)
    .addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
  const ankle = upper.position.clone().addScaledVector(axis, distance);
  const upperWorld = new Quaternion().setFromUnitVectors(thigh.normalize(), knee.clone().sub(upper.position).normalize())
    .multiply(upper.rotation);
  const lowerWorld = new Quaternion().setFromUnitVectors(shin.normalize(), ankle.sub(knee).normalize()).multiply(lower.rotation);
  const parentWorld = world.get(byName.get(upperName).parent)?.rotation ?? new Quaternion();
  const upperLocal = getRotation(frame, upperName).slerp(parentWorld.clone().invert().multiply(upperWorld), amount);
  const lowerLocal = getRotation(frame, lowerName).slerp(upperWorld.clone().invert().multiply(lowerWorld), amount);
  setRotation(frame, upperName, upperLocal);
  setRotation(frame, lowerName, lowerLocal);
  // Compensate after blending too, so the foot keeps its original world orientation.
  setRotation(frame, footName, parentWorld.clone().multiply(upperLocal).multiply(lowerLocal).invert().multiply(foot.rotation));
}

export function polishFrames(frames, joints, polish, { fps = 30, loop = false } = {}) {
  const output = frames.map(copyFrame), amounts = normalizePolish(polish), strength = amounts.footLock;
  if (!Object.values(amounts).some(Boolean) || !frames.length) return output;
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('コマ数は正の有限数にしてください');
  const byName = new Map(joints.map(joint => [joint.name, joint]));
  // Clips may include a duplicate endpoint; it must not count as an extra contact frame.
  const duplicateEnd = loop && frames.length > 1 && sameFrame(frames[0], frames.at(-1));
  const count = frames.length - (duplicateEnd ? 1 : 0);
  if (amounts.follow) followFrames(output, byName, count, amounts.follow, fps, loop);
  if (amounts.jump) jumpFrames(output, byName, count, amounts.jump, fps, loop);
  if (amounts.balance) balanceFrames(output, byName, count, amounts.balance, fps, loop);
  const worlds = strength ? output.slice(0, count).map(frame => forward(frame, byName)) : [];
  // Root corrections must not turn an originally planted foot into a moving contact.
  // Keep original anchors, but solve IK against the fully polished pose.
  const contactWorlds = strength && (amounts.follow || amounts.jump || amounts.balance)
    ? frames.slice(0, count).map(frame => forward(frame, byName)) : worlds;
  for (const side of strength ? ['Left', 'Right'] : []) {
    const upper = byName.get(`${side}UpperLeg`), lower = byName.get(`${side}LowerLeg`), foot = byName.get(`${side}Foot`);
    if (!upper || lower?.parent !== upper.name || foot?.parent !== lower.name) continue;
    const points = contactWorlds.map(world => world.get(foot.name).position);
    const targets = Array(count).fill(null);
    const assign = (i, target, weight) => {
      if (loop) i = (i % count + count) % count;
      if (i >= 0 && i < count && (!targets[i] || weight > targets[i].weight)) targets[i] = { target, weight };
    };
    const runs = contactRuns(points, fps, loop);
    // Contact itself stays fully locked; the three outside frames ease in and out.
    for (const run of runs) {
      const target = points[run[0]].clone();
      for (const i of run) target.y = Math.min(target.y, points[i].y);
      for (const i of run) assign(i, target, 1);
    }
    for (const run of runs) {
      const target = targets[run[0]].target;
      for (let offset = 1; offset <= 3; offset++) {
        const t = 1 - offset / 4, weight = t * t * (3 - 2 * t);
        assign(run[0] - offset, target, weight);
        assign(run.at(-1) + offset, target, weight);
      }
    }
    for (let i = 0; i < count; i++) {
      if (targets[i]) lockLeg(output[i], worlds[i], byName, side, targets[i].target, strength * targets[i].weight);
    }
  }
  if (duplicateEnd) output[output.length - 1] = copyFrame(output[0]);
  return output;
}
