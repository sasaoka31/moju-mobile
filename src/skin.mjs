import * as THREE from 'three';
import { partGeometry } from './shape_mesh.mjs';

export const SKIN_DEFAULTS = Object.freeze({ band: 0.04, ringStep: 0.015 });

export const SKIN_INFO = Object.freeze({
  band: {
    label: '関節のまわりのなじませる幅',
    description: 'この幅の帯で、隣り合う関節の重みをなめらかに分けます（m）',
    min: 0.005, max: 0.12,
  },
  ringStep: {
    label: '関節のまわりの輪の間かく',
    description: '関節の高さの前後に足す断面の、最大の間隔です（m）',
    min: 0.001, max: 0.03,
  },
});

const ROW_VALUES = ['h', 'left', 'right', 'front', 'back'];

// 第4引数は buildSkinnedBody で調整した帯幅を使うためのもの。
export function densifyRows(rows, cuts, step, band = SKIN_DEFAULTS.band) {
  if (!Array.isArray(rows) || rows.length < 2
      || rows.some(row => !ROW_VALUES.every(key => Number.isFinite(row?.[key])))) {
    throw new Error('輪を足すには高さと端位置が有限の数の行を2つ以上用意してください');
  }
  if (!Array.isArray(cuts) || cuts.some(cut => !Number.isFinite(cut))
      || !Number.isFinite(step) || step <= 0 || !Number.isFinite(band) || band <= 0) {
    throw new Error('関節の高さは有限の数、輪の間隔と帯幅は正の有限数にしてください');
  }
  const sorted = [...rows].sort((a, b) => a.h - b.h);
  if (sorted.some((row, i) => i > 0 && row.h === sorted[i - 1].h)) {
    throw new Error('輪を足すには各行の高さを異なる値にしてください');
  }
  const bottom = sorted[0].h;
  const top = sorted.at(-1).h;
  const heights = new Set(sorted.map(row => row.h));
  for (const cut of cuts) {
    for (const h of [cut - band, cut, cut + band]) {
      if (h > bottom && h < top) heights.add(h);
    }
  }
  const knots = [...heights].sort((a, b) => a - b);
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1];
    const b = knots[i];
    const middle = (a + b) / 2;
    if (!cuts.some(cut => Math.abs(middle - cut) <= band)) continue;
    const count = Math.ceil((b - a) / step);
    for (let j = 1; j < count; j++) heights.add(a + (b - a) * j / count);
  }
  const originals = new Map(sorted.map(row => [row.h, row]));
  let upper = 1;
  return [...heights].sort((a, b) => a - b).map(h => {
    if (originals.has(h)) return originals.get(h);
    while (sorted[upper].h < h) upper++;
    const a = sorted[upper - 1];
    const b = sorted[upper];
    const t = (h - a.h) / (b.h - a.h);
    const row = { ...(t <= 0.5 ? a : b), h };
    for (const key of ROW_VALUES.slice(1)) row[key] = a[key] + (b[key] - a[key]) * t;
    return row;
  });
}

function partChain(part) {
  if (part.name === '黄') return { names: ['Neck', 'Head'], descending: false };
  if (part.name === '赤') {
    return { names: ['Hips', 'Spine', 'Chest', 'UpperChest', 'Neck'], descending: false };
  }
  const arm = ['緑', '水色'].includes(part.name);
  if (!arm && !['青', '紫'].includes(part.name)) {
    throw new Error(`関節の列を決められない部品です: ${part.name}`);
  }
  if (arm && part.orientation === 'horizontal') {
    const side = part.side === 'left' ? 'Left' : 'Right';
    return { names: ['UpperArm', 'LowerArm', 'Hand'].map(name => side + name),
      descending: false, mid: side + 'ElbowMid' };
  }
  const top = part.rows.reduce((a, b) => a.h > b.h ? a : b);
  const centerX = (top.right - top.left) / 2;
  if (centerX === 0) throw new Error(`${part.name}の部品の左右を断面の中心から決められません`);
  const side = centerX > 0 ? 'Left' : 'Right';
  const names = arm ? ['UpperArm', 'LowerArm', 'Hand'] : ['UpperLeg', 'LowerLeg', 'Foot', 'Toes'];
  const mid = side + (arm ? 'ElbowMid' : 'KneeMid');
  return { names: names.map(name => side + name), descending: true, leg: !arm, mid };
}

function smoothstep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

// mid を渡すと、names[0]・names[1] の境(ひざ・ひじ)だけ、帯(幅 band)の上半分で
// names[0]↔mid、下半分で mid↔names[1] と、3つの関節で上→中間→下へなめらかになじませる。
// そのぶん境のまわりの帯は上下に band ずつ(合わせて2倍)広がる。
// 横向きの腕は、頂点・関節とも高さの代わりに中心線からの横の距離で決める。
function heightWeights(y, names, joints, descending, band, mid, horizontal = false) {
  const direction = descending ? -1 : 1;
  const height = y * direction;
  const coordinate = name => horizontal ? Math.abs(joints[name].position[0]) : joints[name].position[1];
  if (mid) {
    const boundary = coordinate(names[1]) * direction;
    if (height <= boundary + band) {
      const u = THREE.MathUtils.clamp((height - boundary) / band, -1, 1);
      if (u <= 0) {
        const t = smoothstep(u + 1);
        return [[names[0], 1 - t], [mid, t]];
      }
      const t = smoothstep(u);
      return [[mid, 1 - t], [names[1], t]];
    }
    for (let i = 2; i < names.length; i++) {
      const b = coordinate(names[i]) * direction;
      if (height <= b + band / 2) {
        const weight = smoothstep((height - b + band / 2) / band);
        return [[names[i - 1], 1 - weight], [names[i], weight]];
      }
    }
    return [[names.at(-1), 1]];
  }
  for (let i = 1; i < names.length; i++) {
    const boundary = coordinate(names[i]) * direction;
    if (height <= boundary + band / 2) {
      const weight = smoothstep((height - boundary + band / 2) / band);
      return [[names[i - 1], 1 - weight], [names[i], weight]];
    }
  }
  return [[names.at(-1), 1]];
}

// ひざ・ひじに足す、見えない中間の関節。常に親の子として作るが、
// skeleton・skinIndex に入れるのは options.deep が真のときだけ。
const HELPER_DEFS = Object.freeze([
  ['LeftKneeMid', 'LeftUpperLeg', 'LeftLowerLeg'],
  ['RightKneeMid', 'RightUpperLeg', 'RightLowerLeg'],
  ['LeftElbowMid', 'LeftUpperArm', 'LeftLowerArm'],
  ['RightElbowMid', 'RightUpperArm', 'RightLowerArm'],
]);

/** 中間の関節を、常に LowerLeg / LowerArm の回転の半分に合わせる。 */
export function updateHelpers(body) {
  const bones = body?.bones;
  const helpers = body?.helpers;
  if (!bones || !helpers) return;
  for (const [name, , sourceName] of HELPER_DEFS) {
    const helper = helpers[name];
    if (!helper) continue;
    helper.quaternion.set(0, 0, 0, 1).slerp(bones[sourceName].quaternion, 0.5);
  }
}

/** 立った形で共有骨格に結び付ける。元の shape / joints は変更しない。 */
export function buildSkinnedBody(shape, patterns, joints, options = SKIN_DEFAULTS) {
  const settings = { ...SKIN_DEFAULTS, ...options };
  for (const [key, info] of Object.entries(SKIN_INFO)) {
    if (!Number.isFinite(settings[key]) || settings[key] < info.min || settings[key] > info.max) {
      throw new Error(`${info.label}は ${info.min} から ${info.max} の有限数にしてください`);
    }
  }
  if (!Array.isArray(shape?.parts) || shape.parts.length === 0) {
    throw new Error('肉を付ける部品を用意してください');
  }
  if (!Array.isArray(joints) || joints.length === 0) throw new Error('肉を付ける関節を用意してください');
  const byName = Object.create(null);
  const bones = Object.create(null);
  const indices = new Map();
  for (const [index, joint] of joints.entries()) {
    if (typeof joint?.name !== 'string' || !joint.name || byName[joint.name]
        || !Array.isArray(joint.position) || joint.position.length !== 3
        || !joint.position.every(Number.isFinite)) {
      throw new Error('関節には重複しない名前と有限の数の座標3つを用意してください');
    }
    byName[joint.name] = joint;
    indices.set(joint.name, index);
    const bone = new THREE.Bone();
    bone.name = joint.name;
    bones[joint.name] = bone;
  }
  if (!bones.Root || byName.Root.parent !== null) throw new Error('親のない Root 関節を用意してください');
  // 親の入力順には依存しない。循環は three.js に渡す前に検出する。
  for (const joint of joints) {
    const visited = new Set([joint.name]);
    let parent = joint.parent;
    while (parent !== null) {
      if (!byName[parent] || visited.has(parent)) throw new Error('関節の親が見つからないか、親子関係が循環しています');
      visited.add(parent);
      parent = byName[parent].parent;
    }
    if (!visited.has('Root')) throw new Error('すべての関節を Root につないでください');
  }
  const group = new THREE.Group();
  for (const joint of joints) {
    const bone = bones[joint.name];
    bone.position.fromArray(joint.position);
    if (joint.parent === null) group.add(bone);
    else {
      bone.position.sub(new THREE.Vector3().fromArray(byName[joint.parent].position));
      bones[joint.parent].add(bone);
    }
  }
  group.updateMatrixWorld(true);

  const deep = Boolean(settings.deep);
  const helpers = Object.create(null);
  for (const [name, parentName, sourceName] of HELPER_DEFS) {
    if (!bones[parentName] || !bones[sourceName]) continue;
    const helper = new THREE.Bone();
    helper.name = name;
    helper.position.copy(bones[sourceName].position);
    bones[parentName].add(helper);
    helpers[name] = helper;
    if (deep) indices.set(name, indices.size);
  }
  // 中間の関節を加えたあとに作り直す。bind 前の立った形で boneInverses を作るため。
  group.updateMatrixWorld(true);
  const boneList = joints.map(joint => bones[joint.name]);
  if (deep) for (const [name] of HELPER_DEFS) if (helpers[name]) boneList.push(helpers[name]);
  const skeleton = new THREE.Skeleton(boneList);
  const meshes = shape.parts.map((part, partIndex) => {
    const horizontal = part.orientation === 'horizontal';
    if (horizontal && (!['left', 'right'].includes(part.side) || !Number.isFinite(part.base_height))) {
      throw new Error('横向きの部品には左右の側と有限の高さの基準が必要です');
    }
    const sourceRows = horizontal && Array.isArray(part.rows) ? part.rows.map(row => ({
      ...row, h: row.position, left: row.up, right: row.down,
    })) : part.rows;
    // densifyRows が、左右判定より先に行の数値も検査する。
    const rows = densifyRows(sourceRows, [], settings.ringStep, settings.band);
    const chain = partChain({ ...part, rows });
    for (const name of chain.names) {
      if (!bones[name]) throw new Error(`部品に必要な関節が見つかりません: ${name}`);
    }
    const denseRows = densifyRows(rows, chain.names.map(name => horizontal
      ? Math.abs(byName[name].position[0]) : byName[name].position[1]),
      settings.ringStep, settings.band);
    const parts = [...shape.parts];
    // partGeometry は横向きの行を読み替えるので、補間した値を元の列名へ戻す。
    parts[partIndex] = { ...part, rows: horizontal ? denseRows.map(({ h, left, right, ...row }) => ({
      ...row, position: h, up: left, down: right,
    })) : denseRows };
    const geometry = partGeometry({ ...shape, parts }, patterns, partIndex);
    const position = geometry.getAttribute('position');
    const skinIndices = new Uint16Array(position.count * 4);
    const skinWeights = new Float32Array(position.count * 4);
    const heightChain = chain.leg ? chain.names.slice(0, -1) : chain.names;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const weights = heightWeights(horizontal ? Math.abs(position.getX(i)) : y,
        heightChain, byName, chain.descending, settings.band,
        deep ? chain.mid : undefined, horizontal);
      if (chain.leg) {
        const foot = byName[chain.names[2]];
        const toes = byName[chain.names[3]];
        if (y < foot.position[1]) {
          const toeWeight = smoothstep((position.getZ(i) - toes.position[2] + settings.band / 2) / settings.band);
          for (const weight of weights) weight[1] *= 1 - toeWeight;
          weights.push([toes.name, toeWeight]);
        }
      }
      weights.forEach(([name, weight], slot) => {
        skinIndices[i * 4 + slot] = indices.get(name);
        skinWeights[i * 4 + slot] = weight;
      });
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color: part.color ?? '#ffffff' }));
    mesh.name = part.name;
    mesh.userData.chain = [...chain.names];
    group.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
    return mesh;
  });
  group.updateMatrixWorld(true);
  return { group, skeleton, meshes, bones, helpers };
}

/** helpers を渡すと、最後に updateHelpers も呼んで中間の関節を合わせる。 */
export function setPose(bones, pose, helpers) {
  if (!pose || typeof pose !== 'object' || Array.isArray(pose)) throw new Error('ポーズは関節名と角度の組にしてください');
  for (const [name, angles] of Object.entries(pose)) {
    if (!Object.hasOwn(bones, name)) throw new Error(`ポーズの関節が見つかりません: ${name}`);
    if (!Array.isArray(angles) || angles.length !== 3 || !angles.every(Number.isFinite)) {
      throw new Error(`${name}の回転は度で表した有限の数3つにしてください`);
    }
  }
  for (const [name, bone] of Object.entries(bones)) {
    const angles = Object.hasOwn(pose, name) ? pose[name] : [0, 0, 0];
    bone.rotation.set(...angles.map(THREE.MathUtils.degToRad), 'XYZ');
  }
  if (helpers) updateHelpers({ bones, helpers });
}

/** GPUを使わず、現在の骨の姿勢と外側の group の変換を反映する。 */
export function deformedPositions(mesh) {
  if (!mesh?.isSkinnedMesh || !mesh.skeleton) throw new Error('骨格に結び付けた部品を指定してください');
  let root = mesh;
  while (root.parent) root = root.parent;
  root.updateMatrixWorld(true);
  mesh.skeleton.update();
  const position = mesh.geometry.getAttribute('position');
  const result = new Float32Array(position.count * 3);
  const vertex = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    mesh.applyBoneTransform(i, vertex).applyMatrix4(mesh.matrixWorld);
    vertex.toArray(result, i * 3);
  }
  return result;
}
