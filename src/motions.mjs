import {
  AnimationClip, AnimationMixer, LoopOnce, Quaternion, QuaternionKeyframeTrack,
  Vector3, VectorKeyframeTrack,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

// 分岐では、腰は背骨へ、背骨 上は首へ向ける。手は前腕の向きを使い、頭・つま先は補正しない。
const chains = [
  ['Root', 'Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head'],
  ...['Left', 'Right'].flatMap(side => [
    ['Shoulder', 'UpperArm', 'LowerArm', 'Hand'].map(name => side + name),
    ['UpperLeg', 'LowerLeg', 'Foot', 'Toes'].map(name => side + name),
  ]),
];
const directionChild = new Map(chains.flatMap(chain =>
  chain.slice(0, -1).map((name, i) => [name, chain[i + 1]])));
const jointNames = [...new Set(chains.flat())];

export const DEFAULT_KEEP_SHAPE = { torso: 1, head: 1, arms: 0, legs: 0 };
export const DEFAULT_GROUND = { strength: 1, threshold: 0.04, flatten: 1, floor: 0 };
const GROUND_RANGES = { strength: [0, 1], threshold: [0, 0.2], flatten: [0, 1], floor: [-0.2, 0.2] };
const STRAIGHT_LEG_SIN_START = 0.05;
const STRAIGHT_LEG_SIN_END = 0.16; // 股→足首と股→ひざの角度が約9度なら元の軸を保つ。
const shapeGroup = new Map([
  ...['Root', 'Hips', 'Spine', 'Chest', 'UpperChest'].map(name => [name, 'torso']),
  ...['Neck', 'Head'].map(name => [name, 'head']),
  ...chains.slice(1).flatMap((chain, index) =>
    chain.map(name => [name, index % 2 === 0 ? 'arms' : 'legs'])),
]);

function arrayBufferOf(data) {
  if (data instanceof ArrayBuffer) return data;
  // fs の Buffer は、共有するバッファ全体でなく読み込んだ範囲だけを渡す。
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  throw new Error('動きの素にはバイナリデータを指定してください');
}

function smoothstep(edge0, edge1, x) {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** テクスチャを持たない GLB を、画面にも Node にも依存せずに読む。 */
export async function loadMotionSource(arrayBuffer) {
  try {
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().parse(arrayBufferOf(arrayBuffer), '', resolve, reject);
    });
    return { scene: gltf.scene, clips: gltf.animations };
  } catch (cause) {
    throw new Error('動きの素を読み込めませんでした', { cause });
  }
}

function normalizeGround(value) {
  return Object.fromEntries(Object.entries(DEFAULT_GROUND).map(([key, initial]) => {
    const number = value?.[key];
    const [min, max] = GROUND_RANGES[key];
    return [key, typeof number === 'number' && !Number.isNaN(number)
      ? Math.max(min, Math.min(max, number)) : initial];
  }));
}

function jointMap(joints) {
  if (!Array.isArray(joints) || joints.length !== jointNames.length) {
    throw new Error('Moju の23関節を用意してください');
  }
  const byName = new Map(Array.from(joints, joint => [joint?.name, joint]));
  for (const name of jointNames) {
    const joint = byName.get(name);
    if (!joint || !Array.isArray(joint.position) || joint.position.length !== 3
        || !joint.position.every(Number.isFinite)) {
      throw new Error(`関節の名前と有限の座標3つを確認してください: ${name}`);
    }
    if ((name === 'Root' && joint.parent !== null)
        || (name !== 'Root' && !byName.has(joint.parent))) {
      throw new Error(`関節の親を確認してください: ${name}`);
    }
  }
  if (byName.get('Hips').parent !== 'Root') {
    throw new Error('腰の親には Root 関節を指定してください');
  }
  // 配列の並び順には依存しないが、親をたどって必ず Root に着くこと。
  for (const name of jointNames) {
    const visited = new Set();
    let current = name;
    while (current !== null) {
      if (visited.has(current)) throw new Error(`関節の親が循環しています: ${name}`);
      visited.add(current);
      current = byName.get(current).parent;
    }
  }
  return byName;
}

function createGrounding(byName, ground, alignKneePlane = false) {
  // 接地: 立ち姿ではワールド回転が単位回転なので、関節の位置の差がそのまま親からの
  // オフセットになる。足の裏の点は、その差分だけ関節からずらして骨へ付ける。
  const restVec = name => new Vector3().fromArray(byName.get(name).position);
  const legs = ground.strength > 0 ? ['Left', 'Right'].map(side => {
    const upper = `${side}UpperLeg`;
    const lower = `${side}LowerLeg`;
    const foot = `${side}Foot`;
    const toes = `${side}Toes`;
    const restUpper = restVec(upper);
    const restLower = restVec(lower);
    const restFoot = restVec(foot);
    const restToes = restVec(toes);
    return {
      upper, lower, foot, toes,
      lenUpper: restLower.distanceTo(restUpper),
      lenLower: restFoot.distanceTo(restLower),
      toesOffsetFromFoot: restToes.clone().sub(restFoot),
      heelOffset: new Vector3(0, -restFoot.y, 0),
      toeOffset: new Vector3(0, -restToes.y, 0),
    };
  }) : [];

  // 現在の調整済みワールド回転と腰のローカル位置から、関節のワールド座標を求める
  // (親から子へ、立ち姿のオフセットを現在の親の回転で回して積み上げる)。
  function jointWorldPosition(name, adjustedWorld, hipsWorldPos, cache) {
    if (cache.has(name)) return cache.get(name);
    if (name === 'Hips') { cache.set(name, hipsWorldPos); return hipsWorldPos; }
    const parentName = byName.get(name).parent;
    const parentPos = jointWorldPosition(parentName, adjustedWorld, hipsWorldPos, cache);
    const offset = restVec(name).sub(restVec(parentName)).applyQuaternion(adjustedWorld.get(parentName));
    const pos = parentPos.clone().add(offset);
    cache.set(name, pos);
    return pos;
  }

  // 1本の脚を接地させる。足首(Foot)の回転で足の裏を平らにし、もも・すねの
  // 2骨IKで足首の高さを床へ合わせる。腰の位置とつま先(Toes)の局所回転は変えない。
  function applyGroundLeg(leg, adjustedWorld, hipsWorldPos, rotations) {
    const cache = new Map();
    const footPos = jointWorldPosition(leg.foot, adjustedWorld, hipsWorldPos, cache);
    const toesPos = jointWorldPosition(leg.toes, adjustedWorld, hipsWorldPos, cache);
    const footWorldQuat = adjustedWorld.get(leg.foot);
    const toesWorldQuat = adjustedWorld.get(leg.toes);
    const heelPoint = footPos.clone().add(leg.heelOffset.clone().applyQuaternion(footWorldQuat));
    const toePoint = toesPos.clone().add(leg.toeOffset.clone().applyQuaternion(toesWorldQuat));
    const h = Math.min(heelPoint.y, toePoint.y) - ground.floor;
    let w = 0;
    if (h < 0) w = ground.strength;
    else if (h < ground.threshold) w = ground.strength * (1 - smoothstep(0, ground.threshold, h));

    // 足の裏(かかと→つま先)を水平にする、足首の回転。前後の傾きだけを直す。
    const sole = toePoint.clone().sub(heelPoint);
    const flatSole = new Vector3(sole.x, 0, sole.z);
    const flattenDelta = new Quaternion();
    if (sole.lengthSq() > 1e-12 && flatSole.lengthSq() > 1e-12) {
      flattenDelta.setFromUnitVectors(sole.clone().normalize(), flatSole.clone().normalize());
    }
    const flattenWeight = Math.min(1, Math.max(0, w * ground.flatten));
    const appliedFlatten = new Quaternion().slerp(flattenDelta, flattenWeight);
    const newFootWorldQuat = footWorldQuat.clone().premultiply(appliedFlatten);
    const newToesWorldQuat = toesWorldQuat.clone().premultiply(appliedFlatten);

    const toesPos2 = footPos.clone().add(leg.toesOffsetFromFoot.clone().applyQuaternion(newFootWorldQuat));
    const heelPoint2 = footPos.clone().add(leg.heelOffset.clone().applyQuaternion(newFootWorldQuat));
    const toePoint2 = toesPos2.clone().add(leg.toeOffset.clone().applyQuaternion(newToesWorldQuat));
    const low2 = Math.min(heelPoint2.y, toePoint2.y);
    const diff = ground.floor - low2;
    let moveAmount = 0;
    if (diff > 0) moveAmount = diff * ground.strength;
    else if (w > 0) moveAmount = diff * w;

    if (moveAmount === 0 && flattenWeight === 0) return;

    const upperPos = jointWorldPosition(leg.upper, adjustedWorld, hipsWorldPos, cache);
    const lowerPos = jointWorldPosition(leg.lower, adjustedWorld, hipsWorldPos, cache);
    const target = footPos.clone().add(new Vector3(0, moveAmount, 0));
    const reach = target.clone().sub(upperPos);
    const minReach = Math.abs(leg.lenUpper - leg.lenLower) + 1e-6;
    const maxReach = leg.lenUpper + leg.lenLower - 1e-6;
    const dist = Math.min(maxReach, Math.max(minReach, reach.length()));
    const dir = reach.lengthSq() > 1e-12 ? reach.clone().normalize() : new Vector3(0, -1, 0);
    const finalTarget = upperPos.clone().add(dir.clone().multiplyScalar(dist));

    const cos = Math.min(1, Math.max(-1, (leg.lenUpper * leg.lenUpper + dist * dist
      - leg.lenLower * leg.lenLower) / (2 * leg.lenUpper * dist)));
    const angle = Math.acos(cos);

    // 曲がった脚は元の回転面を保ち、まっすぐな脚はももの前へ曲げる。
    const toKneeOld = lowerPos.clone().sub(upperPos);
    const toFootOld = footPos.clone().sub(upperPos);
    let axis = new Vector3().crossVectors(toFootOld.clone().normalize(), toKneeOld.clone().normalize());
    const bendSin = axis.length();
    // 立ち姿のワールド回転は単位回転。+zを現在のももの回転で回すと、
    // 体ごと回る動きでも立ち姿からの差に追従した前方向になる。
    const thighForward = new Vector3(0, 0, 1).applyQuaternion(adjustedWorld.get(leg.upper));
    const straightAxis = new Vector3().crossVectors(toFootOld, thighForward);
    if (straightAxis.lengthSq() > 1e-10) {
      straightAxis.normalize();
      if (bendSin < 1e-10) {
        axis.copy(straightAxis);
      } else {
        axis.normalize();
        // 後ろへ折れるポーズでは、元の軸と逆向きの前曲げ軸を混ぜない。
        if (axis.dot(straightAxis) >= 0) {
          const originalWeight = smoothstep(STRAIGHT_LEG_SIN_START, STRAIGHT_LEG_SIN_END, bendSin);
          axis = straightAxis.clone().lerp(axis, originalWeight);
        }
      }
    }
    if (axis.lengthSq() < 1e-10) axis = new Vector3(1, 0, 0);
    if (alignKneePlane) {
      // 余弦定理で求めた角度は、移動後の足首への方向と直交する軸で回す。
      // 元の軸に沿う成分が残ると、すねの長さと到達点がずれ、足裏が床へ沈む。
      axis.addScaledVector(dir, -axis.dot(dir));
      if (axis.lengthSq() < 1e-10) axis.crossVectors(dir, new Vector3(0, 0, 1));
      if (axis.lengthSq() < 1e-10) axis.crossVectors(dir, new Vector3(0, 1, 0));
    }
    axis.normalize();

    const kneeDir = dir.clone().applyAxisAngle(axis, angle).normalize();
    const newKnee = upperPos.clone().add(kneeDir.clone().multiplyScalar(leg.lenUpper));
    const newLowerDir = finalTarget.clone().sub(newKnee).normalize();

    const currentUpperDir = toKneeOld.clone().normalize();
    const currentLowerDir = footPos.clone().sub(lowerPos).normalize();
    const deltaUpper = new Quaternion().setFromUnitVectors(currentUpperDir, kneeDir);
    const newUpperWorldQuat = adjustedWorld.get(leg.upper).clone().premultiply(deltaUpper);
    const deltaLower = new Quaternion().setFromUnitVectors(currentLowerDir, newLowerDir);
    const newLowerWorldQuat = adjustedWorld.get(leg.lower).clone().premultiply(deltaLower);

    const upperParent = byName.get(leg.upper).parent;
    const localUpper = newUpperWorldQuat.clone()
      .premultiply(adjustedWorld.get(upperParent).clone().invert()).normalize();
    const localLower = newLowerWorldQuat.clone().premultiply(newUpperWorldQuat.clone().invert()).normalize();
    const localFoot = newFootWorldQuat.clone().premultiply(newLowerWorldQuat.clone().invert()).normalize();

    const overwrite = (name, quat) => quat.toArray(rotations.get(name), rotations.get(name).length - 4);
    overwrite(leg.upper, localUpper);
    overwrite(leg.lower, localLower);
    overwrite(leg.foot, localFoot);
  }
  return { legs, applyGroundLeg };
}

/** 局所回転と Root から見た腰の位置を持つクリップを、元を変えずに接地する。 */
export function groundClip(clip, joints, ground) {
  const byName = jointMap(joints);
  if (!(clip instanceof AnimationClip)) {
    throw new Error('接地する動きには AnimationClip を用意してください');
  }
  if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
    throw new Error('動きの長さは0より大きい有限数にしてください');
  }
  const tracks = new Map(clip.tracks.map(track => [track.name, track]));
  for (const [name, size, type] of [
    ...jointNames.map(name => [`${name}.quaternion`, 4, 'quaternion']),
    ['Hips.position', 3, 'vector'],
  ]) {
    const track = tracks.get(name);
    if (!track || track.ValueTypeName !== type || !track.times.length
        || track.values.length !== track.times.length * size
        || !track.values.every(Number.isFinite)
        || !track.times.every((time, i) => Number.isFinite(time) && time >= 0
          && (i === 0 || time > track.times[i - 1]))) {
      throw new Error(`動きのトラックと有限の値を確認してください: ${name}`);
    }
  }
  const normalized = normalizeGround(ground);
  const result = clip.clone();
  if (normalized.strength === 0) return result;

  // retargetClips の既存の結果を保ち、局所回転クリップでは移動後の膝の面を使う。
  const { legs, applyGroundLeg } = createGrounding(byName, normalized, true);
  // 異なる時刻で記録したトラックでも、全トラックのコマで局所回転を評価する。
  const times = [...new Set(clip.tracks.flatMap(track => Array.from(track.times)))].sort((a, b) => a - b);
  const interpolants = new Map([...tracks].map(([name, track]) => [name, track.createInterpolant()]));
  const rotations = new Map(joints.map(joint => [joint.name, []]));
  const rootRest = new Vector3().fromArray(byName.get('Root').position);
  for (const time of times) {
    const local = new Map(joints.map(joint => {
      const values = interpolants.get(`${joint.name}.quaternion`).evaluate(time);
      rotations.get(joint.name).push(...values);
      return [joint.name, new Quaternion().fromArray(values).normalize()];
    }));
    const world = new Map();
    const accumulate = name => {
      if (world.has(name)) return world.get(name);
      const parent = byName.get(name).parent;
      const rotation = local.get(name).clone();
      if (parent !== null) rotation.premultiply(accumulate(parent));
      world.set(name, rotation.normalize());
      return rotation;
    };
    for (const joint of joints) accumulate(joint.name);
    const hipsWorldPos = new Vector3().fromArray(interpolants.get('Hips.position').evaluate(time))
      .applyQuaternion(world.get('Root')).add(rootRest);
    for (const leg of legs) applyGroundLeg(leg, world, hipsWorldPos, rotations);
  }
  for (const track of result.tracks) {
    if (!track.name.endsWith('.quaternion')) continue;
    const name = track.name.slice(0, -'.quaternion'.length);
    if (!rotations.has(name)) continue;
    track.times = new Float32Array(times);
    track.values = new Float32Array(rotations.get(name));
  }
  return result;
}

/** 立った形のワールド回転からの差を、Moju の23関節へ移す。 */
export function retargetClips(source, joints, options = { fps: 30 }) {
  const fps = options.fps ?? 30;
  const keepShape = Object.fromEntries(Object.entries(DEFAULT_KEEP_SHAPE).map(([group, initial]) => {
    const value = options.keepShape?.[group];
    return [group, typeof value === 'number' && !Number.isNaN(value)
      ? Math.max(0, Math.min(1, value)) : initial];
  }));
  const ground = normalizeGround(options.ground);
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('動きのコマ数は1秒あたりの正の有限数にしてください');
  }
  if (!source?.scene?.isObject3D || !Array.isArray(source.clips)) {
    throw new Error('読み込んだ素体と動きを用意してください');
  }
  const byName = jointMap(joints);
  const { legs, applyGroundLeg } = createGrounding(byName, ground);

  // 呼び出し元の立ち姿を壊さず、各クリップも同じ立ち姿から始める。
  const scene = clone(source.scene);
  scene.updateMatrixWorld(true);
  const bones = new Map();
  for (const name of jointNames) {
    const bone = scene.getObjectByName(name);
    if (!bone?.isBone) throw new Error(`動きの素の関節が見つかりません: ${name}`);
    bones.set(name, bone);
  }
  const rest = new Map(joints.map(joint => {
    const bone = bones.get(joint.name);
    const childName = directionChild.get(joint.name);
    // 手首も前腕と同じ立ち姿補正にして、前腕に対する手の回転を保つ。
    const isHand = joint.name === 'LeftHand' || joint.name === 'RightHand';
    const fromName = isHand ? joint.parent : joint.name;
    const toName = isHand ? joint.name : childName;
    const correction = new Quaternion();
    if (toName) {
      const dstDirection = new Vector3().fromArray(byName.get(toName).position)
        .sub(new Vector3().fromArray(byName.get(fromName).position));
      const srcDirection = bones.get(toName).getWorldPosition(new Vector3())
        .sub(bones.get(fromName).getWorldPosition(new Vector3()));
      if (dstDirection.lengthSq() === 0 || srcDirection.lengthSq() === 0) {
        throw new Error(`向きを求める関節の間隔を空けてください: ${joint.name}`);
      }
      correction.setFromUnitVectors(dstDirection.normalize(), srcDirection.normalize());
      correction.copy(new Quaternion().slerp(correction, 1 - keepShape[shapeGroup.get(joint.name)]));
    }
    return [joint.name, {
      inverse: bone.getWorldQuaternion(new Quaternion()).invert(), correction,
    }];
  }));
  const srcHipsRest = bones.get('Hips').getWorldPosition(new Vector3());
  const dstHipsRest = new Vector3().fromArray(byName.get('Hips').position);
  const dstRootRest = new Vector3().fromArray(byName.get('Root').position);
  if (srcHipsRest.y <= 0 || dstHipsRest.y <= 0) {
    throw new Error('立った形の腰の高さは0より大きくしてください');
  }
  const heightRatio = dstHipsRest.y / srcHipsRest.y;
  const mixer = new AnimationMixer(scene);

  try {
    return source.clips.map(clip => {
      if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
        throw new Error(`動きの長さは0より大きくしてください: ${clip.name}`);
      }
      // fps の間隔で採り、最後のコマも正確に含める（ループで先頭に戻さない）。
      const times = [0];
      // トラックの時刻は Float32。丸めで終端と重なるコマを二重に入れない。
      for (let frame = 1; Math.fround(frame / fps) < Math.fround(clip.duration); frame++) {
        times.push(Math.fround(frame / fps));
      }
      times.push(clip.duration);
      const rotations = new Map(joints.map(joint => [joint.name, []]));
      const offsets = new Map();
      for (const joint of joints) {
        const values = options.offsets?.[clip.name]?.[joint.name];
        if (!Array.isArray(values)) continue;
        const [forward, sideways, twist] = [0, 1, 2].map(index =>
          Number.isFinite(values[index]) ? values[index] * Math.PI / 180 : 0);
        // 体の固定軸で X → Z → Y の順。+Z 回転は左倒しと逆なので符号を反転。
        // R = Ry(ひねり) × Rz(-左右) × Rx(前後) として W に左から掛ける。
        offsets.set(joint.name, new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), forward)
          .premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -sideways))
          .premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), twist)));
      }
      const positions = [];
      const action = mixer.clipAction(clip);
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.reset().play();
      try {
        for (const time of times) {
          mixer.setTime(time);
          scene.updateMatrixWorld(true);
          const world = new Map(joints.map(joint => {
            const { inverse, correction } = rest.get(joint.name);
            // W_dst = (W_src(t) × W_src_rest^-1) × F
            return [joint.name, bones.get(joint.name).getWorldQuaternion(new Quaternion())
              .multiply(inverse).multiply(correction).normalize()];
          }));
          const adjustedWorld = new Map();
          const adjust = name => {
            if (adjustedWorld.has(name)) return adjustedWorld.get(name);
            const joint = byName.get(name);
            const rotation = world.get(name).clone();
            if (joint.parent !== null) {
              // 親の足し引きを継承し、子自身のローカル回転は保つ。
              rotation.premultiply(world.get(joint.parent).clone().invert());
              rotation.premultiply(adjust(joint.parent));
            }
            if (offsets.has(name)) rotation.premultiply(offsets.get(name));
            adjustedWorld.set(name, rotation.normalize());
            return rotation;
          };
          for (const joint of joints) {
            const local = adjust(joint.name).clone();
            if (joint.parent !== null) local.premultiply(adjust(joint.parent).clone().invert());
            local.normalize().toArray(rotations.get(joint.name), rotations.get(joint.name).length);
          }
          const hips = bones.get('Hips').getWorldPosition(new Vector3())
            .sub(srcHipsRest).multiplyScalar(heightRatio).add(dstHipsRest);
          // 位置トラックは親から見た座標。Root に向き補正がある場合にも高さを保つ。
          hips.sub(dstRootRest).applyQuaternion(world.get('Root').clone().invert());
          hips.toArray(positions, positions.length);
          if (legs.length) {
            const hipsWorldPos = dstRootRest.clone().add(hips.clone().applyQuaternion(adjustedWorld.get('Root')));
            for (const leg of legs) applyGroundLeg(leg, adjustedWorld, hipsWorldPos, rotations);
          }
        }
      } finally {
        action.stop();
        mixer.uncacheAction(clip);
      }
      return new AnimationClip(clip.name, clip.duration, [
        ...joints.map(joint => new QuaternionKeyframeTrack(
          `${joint.name}.quaternion`, times, rotations.get(joint.name))),
        new VectorKeyframeTrack('Hips.position', times, positions),
      ]);
    });
  } finally {
    mixer.stopAllAction();
    mixer.uncacheRoot(scene);
  }
}

/**
 * 標準の動き。Node は fs、Electron の画面は fetch で読む。
 * options.readFile(URL) または options.fetch(URL) を渡して読み方を選べる。
 * options.fps は retargetClips と共通。
 */
export async function loadDefaultMotions(joints, options = {}) {
  const url = new URL('../assets/motions/lignium_mannequin.glb', import.meta.url);
  let data;
  try {
    if (options.readFile) {
      data = await options.readFile(url);
    } else if (!options.fetch && typeof window === 'undefined' && url.protocol === 'file:') {
      const { readFile } = await import('node:fs/promises');
      data = await readFile(url);
    } else {
      const fetchMotion = options.fetch ?? globalThis.fetch;
      if (typeof fetchMotion !== 'function') throw new Error('動きの読み込み方法を指定してください');
      const response = await fetchMotion(url);
      if (!response.ok) throw new Error(`動きのファイルを取得できませんでした: ${response.status}`);
      data = await response.arrayBuffer();
    }
  } catch (cause) {
    throw new Error('標準の動きのファイルを読み込めませんでした', { cause });
  }
  return retargetClips(await loadMotionSource(data), joints, options);
}
