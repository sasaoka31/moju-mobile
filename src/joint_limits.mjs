// 向きは setPose と同じ回転順(XYZ): x = 前後に曲げる、y = ねじる、z = 横に開く。

const CENTER_LIMITS = Object.freeze({
  Root: { x: [-180, 180], y: [-180, 180], z: [-180, 180] },
  Hips: { x: [-180, 180], y: [-180, 180], z: [-180, 180] },
  Spine: { x: [-30, 30], y: [-30, 30], z: [-20, 20] },
  Chest: { x: [-30, 30], y: [-30, 30], z: [-20, 20] },
  UpperChest: { x: [-30, 30], y: [-30, 30], z: [-20, 20] },
  Neck: { x: [-40, 40], y: [-70, 70], z: [-30, 30] },
  Head: { x: [-40, 40], y: [-70, 70], z: [-30, 30] },
});

const LEFT_LIMITS = Object.freeze({
  LeftLowerLeg: { x: [0, 150], y: [0, 0], z: [0, 0] },
  LeftLowerArm: { x: [-145, 0], y: [-90, 90], z: [0, 0] },
  LeftUpperLeg: { x: [-120, 45], y: [-45, 45], z: [-45, 45] },
  LeftUpperArm: { x: [-180, 180], y: [-90, 90], z: [-90, 180] },
  LeftShoulder: { x: [-20, 20], y: [-20, 20], z: [-20, 20] },
  LeftHand: { x: [-70, 70], y: [-20, 20], z: [-30, 30] },
  LeftFoot: { x: [-45, 30], y: [-20, 20], z: [-20, 20] },
  LeftToes: { x: [-40, 40], y: [0, 0], z: [0, 0] },
});

// 右は左の鏡: x はそのまま、y と z は [-最大, -最小]。
function mirror(limit) {
  return { x: limit.x, y: [-limit.y[1], -limit.y[0]], z: [-limit.z[1], -limit.z[0]] };
}

const RIGHT_LIMITS = Object.freeze(Object.fromEntries(
  Object.entries(LEFT_LIMITS).map(([name, limit]) => [name.replace('Left', 'Right'), mirror(limit)]),
));

export const DEFAULT_LIMITS = Object.freeze({ ...CENTER_LIMITS, ...LEFT_LIMITS, ...RIGHT_LIMITS });

// joints.mjs の placeJoints と同じ言い方(左右は「左右の○○」として1つ)。
const JOINT_LABELS = Object.freeze({
  Root: '足もと(床)', Hips: '腰', Spine: '背骨 下', Chest: '背骨 中', UpperChest: '背骨 上',
  Neck: '首', Head: '頭',
  Shoulder: '左右の鎖骨', UpperArm: '左右の肩(腕の付け根)', LowerArm: '左右のひじ', Hand: '左右の手首',
  UpperLeg: '左右の股(脚の付け根)', LowerLeg: '左右のひざ', Foot: '左右の足首', Toes: '左右のつま先',
});

const AXIS_INFO = Object.freeze({
  x: { label: '前後に曲げる', description: '前後方向に曲げる角度です（度）' },
  y: { label: 'ねじる', description: '軸のまわりにねじる角度です（度）' },
  z: { label: '横に開く', description: '横方向に開く角度です（度）' },
});

export const LIMIT_INFO = Object.freeze(Object.fromEntries(
  Object.entries(JOINT_LABELS).map(([name, label]) => [name, Object.freeze({ label, axes: AXIS_INFO })]),
));

/** 関節名に対応する可動範囲(x/y/z それぞれ [最小, 最大])を返す。 */
export function limitsFor(name, limits = DEFAULT_LIMITS) {
  return limits[name];
}

/** pose の各関節の角度を可動範囲の端で止めた新しい pose を返す。範囲を知らない関節はそのまま。 */
export function clampPose(pose, limits = DEFAULT_LIMITS) {
  if (!pose || typeof pose !== 'object' || Array.isArray(pose)) throw new Error('ポーズは関節名と角度の組にしてください');
  const result = {};
  for (const [name, angles] of Object.entries(pose)) {
    const limit = limits[name];
    if (!limit) { result[name] = angles; continue; }
    result[name] = angles.map((value, axis) => {
      const [min, max] = limit[['x', 'y', 'z'][axis]];
      return Math.min(max, Math.max(min, value));
    });
  }
  return result;
}
