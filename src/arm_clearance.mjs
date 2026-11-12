import { AnimationClip, Vector3, Quaternion, Euler, MathUtils } from 'three';
import { limitsFor } from './joint_limits.mjs';
import { isLoopMotion } from './motion_loop.mjs';
import { armSamples, penetration } from './body_volumes.mjs';

export const DEFAULT_CLEARANCE = { strength: 1, margin: 0.01, smooth: 0.1, maxOpen: 40 };
const SIDES = ['Left', 'Right'];
const ARM_NAMES = SIDES.flatMap(side => ['UpperArm', 'LowerArm', 'Hand'].map(name => side + name));
const NAMES = ['Root', 'Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head',
  ...SIDES.flatMap(side => ['Shoulder', 'UpperArm', 'LowerArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot', 'Toes'].map(name => side + name))];
const EPS = 1e-6;
const MAX_STEP = MathUtils.degToRad(15);
const MAX_IK_ITERATIONS = 8;
const MAX_SWIVEL_STEPS = 6;
const IK_PADDING = 0.002;

function validate(clip, joints, volumes) {
  if (!Array.isArray(joints) || joints.length !== NAMES.length) throw new Error('Moju の23関節を用意してください');
  const byName = new Map(Array.from(joints, j => [j?.name, j]));
  for (const name of NAMES) {
    const j = byName.get(name);
    if (!j || !Array.isArray(j.position) || j.position.length !== 3 || !j.position.every(Number.isFinite)) {
      throw new Error(`関節の名前と有限の座標3つを確認してください: ${name}`);
    }
    if ((name === 'Root' && j.parent !== null) || (name !== 'Root' && !byName.has(j.parent))) {
      throw new Error(`関節の親を確認してください: ${name}`);
    }
  }
  if (byName.get('Hips').parent !== 'Root') throw new Error('腰の親には Root 関節を指定してください');
  for (const name of NAMES) {
    const visited = new Set();
    for (let current = name; current !== null; current = byName.get(current).parent) {
      if (visited.has(current)) throw new Error(`関節の親が循環しています: ${name}`);
      visited.add(current);
    }
  }
  if (!(clip instanceof AnimationClip)) throw new Error('腕を逃がす動きには AnimationClip を用意してください');
  if (!Number.isFinite(clip.duration) || clip.duration <= 0) throw new Error('動きの長さは0より大きい有限数にしてください');
  const tracks = new Map(clip.tracks.map(t => [t.name, t]));
  for (const [name, size, type] of [...NAMES.map(n => [`${n}.quaternion`, 4, 'quaternion']), ['Hips.position', 3, 'vector']]) {
    const t = tracks.get(name);
    if (!t || t.ValueTypeName !== type || !t.times.length || t.values.length !== t.times.length * size
        || !t.values.every(Number.isFinite) || !t.times.every((v, i) => Number.isFinite(v) && v >= 0 && (!i || v > t.times[i - 1]))) {
      throw new Error(`動きのトラックと有限の値を確認してください: ${name}`);
    }
  }
  if (!volumes?.capsules?.length || !volumes.sphere || !volumes.arm
      || !['upper', 'lower', 'hand'].every(key => Number.isFinite(volumes.arm[key]) && volumes.arm[key] >= 0)) {
    throw new Error('腕を逃がすための胴・頭と腕の太さを用意してください');
  }
  return { byName, tracks };
}

function bounded(name, q) {
  const e = new Euler().setFromQuaternion(q, 'XYZ'), limits = limitsFor(name);
  for (const axis of ['x', 'y', 'z']) {
    const [min, max] = limits[axis].map(MathUtils.degToRad);
    e[axis] = MathUtils.clamp(e[axis], min, max);
  }
  return new Quaternion().setFromEuler(e);
}

/** 局所回転クリップの腕だけを補正する。元のクリップ、関節、体積は変更しない。 */
export function clearArms(clip, joints, volumes, clearance = DEFAULT_CLEARANCE) {
  const { byName, tracks } = validate(clip, joints, volumes);
  const settings = Object.fromEntries(Object.entries(DEFAULT_CLEARANCE).map(([key, initial]) => {
    const value = clearance?.[key], max = { strength: 1, margin: 0.05, smooth: 0.5, maxOpen: 80 }[key];
    return [key, Number.isFinite(value) ? MathUtils.clamp(value, 0, max) : initial];
  }));
  const result = clip.clone();
  if (clip.userData !== undefined) result.userData = { ...clip.userData };
  if (settings.strength === 0) return result;
  const interpolants = new Map([...tracks].map(([name, track]) => [name, track.createInterpolant()]));
  const offsets = new Map(joints.map(j => [j.name, new Vector3().fromArray(j.position)
    .sub(j.parent === null ? new Vector3() : new Vector3().fromArray(byName.get(j.parent).position))]));
  const worldAt = (local, hips) => {
    const world = {};
    const get = name => {
      if (world[name]) return world[name];
      const parentName = byName.get(name).parent, parent = parentName === null ? null : get(parentName);
      const position = (name === 'Hips' ? hips : offsets.get(name)).clone();
      const quaternion = local[name].clone();
      if (parent) {
        position.applyQuaternion(parent.quaternion).add(parent.position);
        quaternion.premultiply(parent.quaternion);
      }
      return world[name] = { position, quaternion: quaternion.normalize() };
    };
    for (const name of NAMES) get(name);
    return world;
  };
  const collisions = (side, world) => armSamples(volumes, side, world).map((sample, index) => ({
    ...sample, index, ...penetration(volumes, sample.point, sample.radius + settings.margin, world),
  }));
  const score = samples => samples.reduce((sum, s) => sum + s.depth * s.depth, 0);
  const updateArm = (local, world, side) => {
    for (const suffix of ['UpperArm', 'LowerArm', 'Hand']) {
      const name = side + suffix, parent = world[byName.get(name).parent];
      world[name] = {
        position: offsets.get(name).clone().applyQuaternion(parent.quaternion).add(parent.position),
        quaternion: parent.quaternion.clone().multiply(local[name]).normalize(),
      };
    }
    return world;
  };
  function rescue(local, world, side, handRotation) {
    const upper = side + 'UpperArm', lower = side + 'LowerArm', hand = side + 'Hand';
    const lenUpper = offsets.get(lower).length(), lenLower = offsets.get(hand).length();
    if (Math.min(lenUpper, lenLower) <= EPS) return false;
    const parentRotation = world[byName.get(upper).parent].quaternion;
    const outward = new Vector3(side === 'Left' ? 1 : -1, 0, -1)
      .applyQuaternion(world.UpperChest.quaternion).normalize();
    // 平滑化した局所回転の合成でも、銃を持つ手のワールドの向きを先に復元する。
    local[hand] = world[lower].quaternion.clone().invert().multiply(handRotation).normalize();
    updateArm(local, world, side);
    for (let iteration = 0; iteration < MAX_IK_ITERATIONS; iteration++) {
      const samples = collisions(side, world);
      if (samples.every(s => s.depth <= EPS)) break;
      const deepestHand = samples.slice(2).reduce((a, b) => a.depth > b.depth ? a : b);
      const deepest = deepestHand.depth > EPS ? deepestHand
        : samples.reduce((a, b) => a.depth > b.depth ? a : b);
      const shoulder = world[upper].position.clone(), wrist = world[hand].position.clone();
      // 手の球の目標から、現在の手首→球中心のずれを引いて手首の目標に直す。
      const target = deepest.point.clone().addScaledVector(deepest.direction,
        deepest.depth + settings.margin + IK_PADDING).sub(deepest.point.clone().sub(wrist));
      const reach = target.sub(shoulder);
      const distance = MathUtils.clamp(reach.length(), Math.abs(lenUpper - lenLower) + EPS,
        lenUpper + lenLower - EPS);
      const axis = reach.lengthSq() > EPS * EPS ? reach.normalize()
        : world[lower].position.clone().sub(shoulder).normalize();
      const finalWrist = shoulder.clone().addScaledVector(axis, distance);
      const along = (lenUpper * lenUpper + distance * distance - lenLower * lenLower) / (2 * distance);
      const height = Math.sqrt(Math.max(0, lenUpper * lenUpper - along * along));
      const oldUpper = world[lower].position.clone().sub(shoulder);
      const bend = oldUpper.clone().addScaledVector(axis, -oldUpper.dot(axis));
      if (bend.lengthSq() < EPS * EPS) bend.copy(outward).addScaledVector(axis, -outward.dot(axis));
      if (bend.lengthSq() < EPS * EPS) {
        const basis = Math.abs(axis.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
        bend.copy(basis).addScaledVector(axis, -basis.dot(axis));
      }
      bend.normalize();
      const upperRotation = world[upper].quaternion.clone(), lowerRotation = world[lower].quaternion.clone();
      const preferredSign = new Vector3().crossVectors(axis, bend).dot(outward) >= 0 ? 1 : -1;
      let best, bestScore = Infinity;
      // 今のひじを出発点に、横・後ろへ向かう側から15度ずつ。完全に出る最小の回り方を採用する。
      for (let step = 0; step <= MAX_SWIVEL_STEPS; step++) {
        let clear = false;
        for (const sign of step === 0 ? [1] : [preferredSign, -preferredSign]) {
          const elbow = shoulder.clone().addScaledVector(axis, along)
            .addScaledVector(bend.clone().applyAxisAngle(axis, step * MAX_STEP * sign), height);
          const upperDelta = new Quaternion().setFromUnitVectors(oldUpper.clone().normalize(),
            elbow.clone().sub(shoulder).normalize());
          const newUpper = upperRotation.clone().premultiply(upperDelta).normalize();
          const rotatedLower = lowerRotation.clone().premultiply(upperDelta).normalize();
          const lowerDelta = new Quaternion().setFromUnitVectors(
            offsets.get(hand).clone().applyQuaternion(rotatedLower).normalize(),
            finalWrist.clone().sub(elbow).normalize());
          const newLower = rotatedLower.premultiply(lowerDelta).normalize();
          // IKを制限角へ戻すと目標からずれる。手はワールドの向きを保つ局所回転にする。
          local[upper] = parentRotation.clone().invert().multiply(newUpper).normalize();
          local[lower] = newUpper.clone().invert().multiply(newLower).normalize();
          local[hand] = newLower.clone().invert().multiply(handRotation).normalize();
          const candidateSamples = collisions(side, updateArm(local, world, side));
          const value = score(candidateSamples);
          const outside = candidateSamples.every(s => s.depth <= EPS);
          if (outside || value < bestScore - 1e-14) {
            bestScore = value;
            best = [local[upper].clone(), local[lower].clone(), local[hand].clone()];
          }
          if (outside) { clear = true; break; }
        }
        if (clear) break;
      }
      [local[upper], local[lower], local[hand]] = best;
      updateArm(local, world, side);
    }
    return true;
  }
  function solve(local, hips, side, handRotation) {
    const world = worldAt(local, hips);
    handRotation ??= world[side + 'Hand'].quaternion.clone();
    if (settings.maxOpen > 0 && collisions(side, world).some(s => s.depth > EPS)) {
      const upper = side + 'UpperArm', original = local[upper];
      const direction = world[side + 'Hand'].position.clone().sub(world[upper].position).normalize();
      const lateral = new Vector3(side === 'Left' ? 1 : -1, 0, 0).applyQuaternion(world.UpperChest.quaternion);
      const axis = direction.cross(lateral);
      if (axis.length() >= 1e-4) {
        axis.normalize();
        const parent = world[byName.get(upper).parent].quaternion;
        // ひじと手首の局所回転を保ち、腕全体を肩から外へ開く最小角を探す。
        for (let degrees = 1; degrees <= Math.ceil(settings.maxOpen); degrees++) {
          const delta = new Quaternion().setFromAxisAngle(axis, MathUtils.degToRad(Math.min(degrees, settings.maxOpen)));
          local[upper] = parent.clone().invert().multiply(delta).multiply(parent).multiply(original).normalize();
          if (collisions(side, updateArm(local, world, side)).every(s => s.depth <= EPS)) {
            return { ik: false, opened: true };
          }
        }
        local[upper] = original;
        updateArm(local, world, side);
      }
    }
    for (let iteration = 0; iteration < 12; iteration++) {
      let samples = collisions(side, world);
      if (samples.every(s => s.depth <= EPS)) break;
      // 肩を優先し、肩だけで改善できない手の侵入ではひじも使う。
      for (const suffix of ['UpperArm', 'LowerArm']) {
        const relevant = suffix === 'UpperArm' ? samples : samples.slice(1);
        const deepest = relevant.reduce((a, b) => a.depth > b.depth ? a : b);
        if (deepest.depth <= EPS) continue;
        const name = side + suffix, joint = world[name];
        const lever = deepest.point.clone().sub(joint.position);
        const gradient = lever.clone().cross(deepest.direction);
        const lateral = new Vector3(side === 'Left' ? 1 : -1, 0, 0).applyQuaternion(world.UpperChest.quaternion);
        const axes = [gradient.clone(), lever.clone().cross(lateral)];
        if (suffix === 'LowerArm') {
          const parent = world[byName.get(name).parent].quaternion;
          // ひじの横開きは0度。許されている曲げ・ねじりの軸でも外へ出せるか調べる。
          for (const basis of [new Vector3(1, 0, 0), new Vector3(0, 1, 0)]) {
            const axis = basis.applyQuaternion(parent);
            axes.push(axis, axis.clone().negate());
          }
        }
        const original = local[name];
        let best = original, bestScore = score(samples);
        for (const axis of axes) {
          const length = axis.length();
          if (length < 1e-10) continue;
          axis.divideScalar(length);
          const derivative = Math.abs(gradient.dot(axis));
          const angle = Math.min(MAX_STEP, Math.max(0.002, (deepest.depth + 0.0002) * 1.5 / Math.max(derivative, 0.01)));
          for (const fraction of [1, 0.5]) {
            const parent = world[byName.get(name).parent].quaternion;
            const delta = new Quaternion().setFromAxisAngle(axis, angle * fraction);
            const candidate = bounded(name, parent.clone().invert().multiply(delta).multiply(parent).multiply(original));
            local[name] = candidate;
            const value = score(collisions(side, updateArm(local, world, side)));
            if (value < bestScore) { bestScore = value; best = candidate; }
          }
        }
        local[name] = best;
        updateArm(local, world, side);
        samples = collisions(side, world);
        // 二の腕だけで改善している間は、元のひじの曲がり方を保つ。
        if (suffix === 'UpperArm' && best !== original) break;
      }
    }
    // 通常の動きで既に体の外に出ている解は保ち、銃を持つ手などの残りを解く。
    const ik = collisions(side, world).some(s => s.depth > settings.margin + EPS)
      && rescue(local, world, side, handRotation);
    return { ik, opened: false };
  }
  // 元の時刻に加え、疎な入力にも30fpsで補正を記録する。近接した浮動小数時刻は増やさない。
  const sourceTimes = [...new Set(clip.tracks.flatMap(t => Array.from(t.times)))].sort((a, b) => a - b);
  const times = [];
  for (const time of [0, ...sourceTimes, clip.duration].sort((a, b) => a - b)) {
    if (times.length && time - times.at(-1) < EPS) continue;
    const previous = times.at(-1);
    if (previous !== undefined && time - previous > 1 / 30 + EPS) {
      const steps = Math.ceil((time - previous) * 30);
      for (let i = 1; i < steps; i++) times.push(previous + (time - previous) * i / steps);
    }
    times.push(time);
  }
  const frames = times.map(time => {
    const raw = Object.fromEntries(NAMES.map(name => [name, Array.from(interpolants.get(`${name}.quaternion`).evaluate(time))]));
    const local = Object.fromEntries(NAMES.map(name => [name, new Quaternion().fromArray(raw[name])]));
    const hips = new Vector3().fromArray(interpolants.get('Hips.position').evaluate(time));
    const world = worldAt(local, hips);
    const active = Object.fromEntries(SIDES.map(side => [side, collisions(side, world).some(s => s.depth > EPS)]));
    const handRotations = Object.fromEntries(SIDES.map(side => [side, world[side + 'Hand'].quaternion.clone()]));
    const solutions = Object.fromEntries(SIDES.map(side => [side,
      active[side] ? solve(local, hips, side, handRotations[side]) : { ik: false, opened: false }]));
    const ik = Object.fromEntries(SIDES.map(side => [side, solutions[side].ik]));
    const opened = Object.fromEntries(SIDES.map(side => [side, solutions[side].opened]));
    const deltas = Object.fromEntries(ARM_NAMES.map(name => [name, local[name].clone().multiply(new Quaternion().fromArray(raw[name]).invert()).normalize()]));
    return { raw, hips, active, deltas, ik, opened, handRotations };
  });
  if (!frames.some(f => SIDES.some(side => f.active[side]))) return result;
  const loop = isLoopMotion(clip.name);
  const output = Object.fromEntries(ARM_NAMES.map(name => [name, []]));
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const local = Object.fromEntries(NAMES.map(name => [name, new Quaternion().fromArray(frame.raw[name])]));
    const smoothedIK = { ...frame.ik };
    const smoothedOpen = { ...frame.opened };
    for (const name of ARM_NAMES) {
      const side = name.startsWith('Left') ? 'Left' : 'Right';
      if (!frame.active[side]) continue;
      let average = frame.deltas[name].clone(), weight = 1;
      if (settings.smooth > 0) for (let j = 0; j < frames.length; j++) {
        if (i === j || (loop && j === frames.length - 1)) continue;
        let distance = Math.abs(times[i] - times[j]);
        if (loop) distance = Math.min(distance, Math.abs(clip.duration - distance));
        if (distance >= settings.smooth) continue;
        smoothedIK[side] ||= frames[j].ik[side];
        smoothedOpen[side] ||= frames[j].opened[side];
        const w = 1 - distance / settings.smooth;
        average.slerp(frames[j].deltas[name], w / (weight + w));
        weight += w;
      }
      if (average.angleTo(new Quaternion()) > 1e-10) {
        const rotation = average.multiply(local[name]).normalize();
        local[name] = smoothedIK[side] || name.endsWith('Hand') || (smoothedOpen[side] && name.endsWith('UpperArm'))
          ? rotation : bounded(name, rotation);
      }
    }
    // 平滑化で戻った分だけをそのコマで補う。
    for (const side of SIDES) if (frame.active[side]) {
      if (smoothedIK[side]) rescue(local, worldAt(local, frame.hips), side, frame.handRotations[side]);
      else solve(local, frame.hips, side, frame.handRotations[side]);
    }
    for (const name of ARM_NAMES) {
      const side = name.startsWith('Left') ? 'Left' : 'Right';
      if (!frame.active[side]) { output[name].push(...frame.raw[name]); continue; }
      const original = new Quaternion().fromArray(frame.raw[name]);
      output[name].push(...original.slerp(local[name], settings.strength));
    }
  }
  for (const track of result.tracks) {
    const name = track.name.replace(/\.quaternion$/, '');
    if (!output[name]) continue;
    const side = name.startsWith('Left') ? 'Left' : 'Right';
    if (!frames.some(f => f.active[side])) continue;
    if (output[name].every((value, i) => value === frames[Math.floor(i / 4)].raw[name][i % 4])) continue;
    track.times = new Float32Array(times);
    track.values = new Float32Array(output[name]);
  }
  return result;
}
