import { Vector3, MathUtils } from 'three';
import { MANNEQUIN_BASE as BASE } from './mannequin_base.mjs';

const V = (...args) => new Vector3(...args);
const ease = (a, b, value) => {
  const t = MathUtils.clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function rowAt(rows, y) {
  let i = 0;
  while (i < rows.length - 2 && rows[i + 1][0] < y) i++;
  const a = rows[i], b = rows[i + 1];
  const t = MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
  return a.map((value, k) => MathUtils.lerp(value, b[k], t));
}

/** 点検ツールと共通の近似。端の中心は所属する骨のローカル座標、半径はm。 */
export function mannequinVolumes(p, joints) {
  const rest = Object.fromEntries(joints.map(j => [j.name, V(...j.position)]));
  const endpoint = (name, table, widthScale, depthScale) => {
    const point = rest[name], row = rowAt(table, point.y / p.height);
    const t = (row[0] - table[0][0]) / (table.at(-1)[0] - table[0][0]);
    const bust = table === BASE.torso ? p.bust * ease(0.45, 0.7, t) * (1 - ease(0.85, 1, t)) : 0;
    const center = V(0, point.y, ((row[2] - row[3]) * depthScale + bust) * p.height / 2);
    return { name, offset: center.sub(point), rx: row[1] * p.height * widthScale,
      rz: ((row[2] + row[3]) * depthScale + bust) * p.height / 2 };
  };
  const torso = ['Hips', 'Spine', 'Chest', 'UpperChest'].map(name => {
    const y = rest[name].y / p.height;
    const t = (y - BASE.torso[0][0]) / (BASE.torso.at(-1)[0] - BASE.torso[0][0]);
    const lower = ease(0.25, 0.5, t), upper = ease(0.5, 0.75, t);
    const width = MathUtils.lerp(p.hipW * (1 - lower) + p.waist * (lower - upper) + p.chestW * upper,
      p.shoulderW, ease(0.72, 0.88, t));
    return endpoint(name, BASE.torso, width, p.torsoD);
  });
  const neck = ['Neck', 'Head'].map(name => endpoint(name, BASE.head, p.headW, p.headD));
  const capsules = [...torso.slice(1).map((b, i) => [torso[i], b]), neck];
  const widest = BASE.head.reduce((a, b) => a[1] > b[1] ? a : b);
  const sphere = { name: 'Head', offset: V(0, widest[0] * p.height,
    (widest[2] - widest[3]) * p.height * p.headD / 2).sub(rest.Head),
    radius: Math.min(widest[1] * p.headW, (widest[2] + widest[3]) * p.headD / 2) * p.height };
  const elbow = BASE.joints.armLength * BASE.joints.elbowAt;
  const wrist = BASE.joints.armLength * BASE.joints.wristAt;
  const radius = rows => Math.max(...rows.map(row => Math.max(row[1], row[2])));
  const arm = {
    upper: radius([...BASE.arm.filter(r => r[0] < elbow), rowAt(BASE.arm, elbow)]) * p.armR * p.height,
    lower: radius([rowAt(BASE.arm, elbow), ...BASE.arm.filter(r => r[0] > elbow && r[0] < wrist), rowAt(BASE.arm, wrist)]) * p.armR * p.height,
    hand: radius(BASE.arm.filter(r => r[0] >= wrist)) * p.handSize * p.height,
  };
  return { capsules, sphere, arm };
}

/** 半径0の深さは従来の点検と同じ。directionは最も深い体積の外向きの単位法線。 */
export function penetration(volumes, point, radius, world) {
  const bone = name => world instanceof Map ? world.get(name) : world[name];
  const center = end => end.offset.clone().applyQuaternion(bone(end.name).quaternion).add(bone(end.name).position);
  const delta = point.clone().sub(center(volumes.sphere));
  let depth = Math.max(0, volumes.sphere.radius + radius - delta.length());
  let direction = delta.lengthSq() ? delta.normalize() : V(1, 0, 0);
  for (const [a, b] of volumes.capsules) {
    const start = center(a), axis = center(b).sub(start);
    const t = MathUtils.clamp(point.clone().sub(start).dot(axis) / (axis.lengthSq() || 1), 0, 1);
    const nearest = start.addScaledVector(axis, t);
    const rotation = bone(a.name).quaternion;
    const local = point.clone().sub(nearest).applyQuaternion(rotation.clone().invert());
    const rx = MathUtils.lerp(a.rx, b.rx, t), rz = MathUtils.lerp(a.rz, b.rz, t), ry = Math.min(rx, rz);
    const radial = Math.sqrt((local.x / rx) ** 2 + (local.z / rz) ** 2 + (local.y / ry) ** 2);
    const candidate = (1 - radial) * ry + radius;
    if (candidate <= depth) continue;
    depth = candidate;
    direction = V(local.x / (rx * rx), local.y / (ry * ry), local.z / (rz * rz));
    if (direction.lengthSq() < 1e-20) direction.set(1, 0, 0);
    direction.normalize().applyQuaternion(rotation);
  }
  return { depth, direction };
}

/** ひじ・前腕中央・手首・手の球。手の中心は手首から手の局所軸へ半径分進める。 */
export function armSamples(volumes, side, world) {
  const get = name => world instanceof Map ? world.get(side + name) : world[side + name];
  const elbow = get('LowerArm'), hand = get('Hand');
  const direction = hand.position.clone().sub(elbow.position)
    .applyQuaternion(elbow.quaternion.clone().invert()).normalize().applyQuaternion(hand.quaternion);
  return [
    { point: elbow.position.clone(), radius: volumes.arm.upper },
    { point: elbow.position.clone().lerp(hand.position, 0.5), radius: volumes.arm.lower },
    { point: hand.position.clone(), radius: volumes.arm.lower },
    { point: hand.position.clone().addScaledVector(direction, volumes.arm.hand), radius: volumes.arm.hand },
  ];
}

/** 脚の断面表から作る当たり用の半径。既存の腕・胴の近似とは独立。 */
export function legVolumes(p, joints) {
  const rest = Object.fromEntries(joints.map(j => [j.name, V(...j.position)]));
  const scale = rest.LeftLowerLeg.y / (BASE.joints.kneeY * p.legLen);
  const radius = height => {
    const row = rowAt(BASE.leg, height);
    const foot = MathUtils.lerp(p.footSize, 1,
      ease(BASE.joints.ankleY - 0.02, BASE.joints.ankleY, height));
    return Math.max(row[2], (row[3] + row[4]) * foot / 2) * p.legR * scale;
  };
  return Object.fromEntries(['Left', 'Right'].map(side => [side, [
    { name: side + 'UpperLeg', radius: radius(BASE.leg.at(-1)[0]) },
    { name: side + 'LowerLeg', radius: radius(BASE.joints.kneeY) },
    { name: side + 'Foot', radius: radius(BASE.joints.ankleY) },
    { name: side + 'Toes', radius: radius(BASE.joints.ankleY / 2) },
  ]]));
}

export function legSamples(legs, side, world) {
  const get = name => world instanceof Map ? world.get(name) : world[name];
  const [, knee, ankle, toes] = legs[side];
  const point = end => get(end.name).position.clone();
  return [
    { point: point(knee), radius: knee.radius },
    { point: point(knee).lerp(point(ankle), 0.5), radius: (knee.radius + ankle.radius) / 2 },
    { point: point(ankle), radius: ankle.radius },
    { point: point(toes), radius: toes.radius },
  ];
}

/** 太さが変わる3本のカプセルで片脚へのめり込みを測る。 */
export function legPenetration(legs, side, point, radius, world) {
  const get = name => (world instanceof Map ? world.get(name) : world[name]).position;
  const chain = legs[side];
  let depth = 0;
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1], b = chain[i];
    const start = get(a.name), axis = get(b.name).clone().sub(start);
    const t = MathUtils.clamp(point.clone().sub(start).dot(axis) / (axis.lengthSq() || 1), 0, 1);
    const distance = point.distanceTo(start.clone().addScaledVector(axis, t));
    depth = Math.max(depth, MathUtils.lerp(a.radius, b.radius, t) + radius - distance);
  }
  return depth;
}
