import {
  Bone, MeshStandardMaterial, PropertyBinding, Quaternion, QuaternionKeyframeTrack,
  Scene, Skeleton, SkinnedMesh,
} from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const JOINT_NAMES = [
  'Root', 'Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head',
  ...['Left', 'Right'].flatMap(side => [
    'Shoulder', 'UpperArm', 'LowerArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot', 'Toes',
  ].map(name => side + name)),
];

// skin.mjs と同じ [中間関節, 親, 回転元] の定義。
const HELPER_DEFS = [
  ['LeftKneeMid', 'LeftUpperLeg', 'LeftLowerLeg'],
  ['RightKneeMid', 'RightUpperLeg', 'RightLowerLeg'],
  ['LeftElbowMid', 'LeftUpperArm', 'LeftLowerArm'],
  ['RightElbowMid', 'RightUpperArm', 'RightLowerArm'],
];

/** 元のクリップを変更せず、中間関節の半分の回転を各キーに焼き込む。 */
export function bakeHelperTracks(clip, helperDefs = HELPER_DEFS) {
  if (!clip || !Array.isArray(clip.tracks) || typeof clip.clone !== 'function') {
    throw new Error('書き出す動きのクリップを用意してください');
  }
  const baked = clip.clone();
  const sourceRotation = new Quaternion();
  const halfRotation = new Quaternion();
  for (const [name, , sourceName] of helperDefs) {
    const source = clip.tracks.find(track => track.name === `${sourceName}.quaternion`);
    if (!source) continue;
    if (source.getValueSize() !== 4) {
      throw new Error(`中間関節の回転元はクォータニオンにしてください: ${sourceName}`);
    }
    const values = new Float32Array(source.times.length * 4);
    for (let i = 0; i < source.times.length; i++) {
      sourceRotation.fromArray(source.values, i * 4).normalize();
      halfRotation.identity().slerp(sourceRotation, 0.5).toArray(values, i * 4);
    }
    // すでに焼き込んだクリップでも、中間関節のトラックを重複させない。
    baked.tracks = baked.tracks.filter(track => track.name !== `${name}.quaternion`);
    baked.tracks.push(new QuaternionKeyframeTrack(
      `${name}.quaternion`, source.times.slice(), values, source.getInterpolation(),
    ));
  }
  return baked;
}

function validate(body, clips) {
  if (!body?.bones || Object.keys(body.bones).length !== 23
      || JOINT_NAMES.some(name => !body.bones[name]?.isBone)) {
    throw new Error('書き出しには人型の23本の関節をすべて用意してください');
  }
  if (!Array.isArray(body.meshes) || body.meshes.length === 0
      || body.meshes.some(mesh => !mesh?.isSkinnedMesh
        || !mesh.geometry?.getAttribute('position')?.count)) {
    throw new Error('書き出す部品のメッシュがありません');
  }
  const skeleton = body.skeleton;
  if (!skeleton || skeleton.bones.length !== 27
      || skeleton.boneInverses.length !== 27
      || JOINT_NAMES.some(name => !skeleton.bones.includes(body.bones[name]))
      || HELPER_DEFS.some(([name]) => !body.helpers?.[name]?.isBone
        || !skeleton.bones.includes(body.helpers[name]))) {
    throw new Error('23本の関節と4本の中間関節を含む骨格を用意してください（deep: true）');
  }
  if (body.meshes.some(mesh => mesh.skeleton !== skeleton
      || !mesh.geometry.getAttribute('skinIndex') || !mesh.geometry.getAttribute('skinWeight'))) {
    throw new Error('全部品のメッシュを同じ骨格に結び付け、骨の重みを用意してください');
  }
  if (!Array.isArray(clips)) throw new Error('書き出す動きはクリップの配列にしてください');
  const known = new Set(skeleton.bones.map(bone => bone.name));
  for (const clip of clips) {
    if (!Array.isArray(clip?.tracks)) throw new Error('書き出す動きのトラックを用意してください');
    for (const track of clip.tracks) {
      let target;
      try {
        target = PropertyBinding.parseTrackName(track.name).nodeName;
      } catch (cause) {
        throw new Error(`動きのトラック名を確認してください: ${track.name}`, { cause });
      }
      if (!known.has(target)) {
        throw new Error(`動きのトラックが知らない骨を指しています: ${track.name}`);
      }
    }
  }
}

/** m・上+y・前+z の立ち姿。プレビューの姿勢や配置はコピーしない。 */
export function buildExportScene(body, clips, { name } = {}) {
  validate(body, clips);
  const scene = new Scene();
  scene.name = name ?? '素体';
  const sourceSkeleton = body.skeleton;
  const copies = new Map(sourceSkeleton.bones.map(source => {
    const bone = new Bone();
    bone.name = source.name;
    return [source, bone];
  }));
  for (const [source, bone] of copies) {
    if (source === body.bones.Root) scene.add(bone);
    else {
      const parent = copies.get(source.parent);
      if (!parent) throw new Error(`関節の親が骨格に見つかりません: ${source.name}`);
      parent.add(bone);
    }
  }
  // skinIndex が指す順番とバインド時の座標を保つ。Hips の移動も元に戻す。
  const skeleton = new Skeleton(
    sourceSkeleton.bones.map(bone => copies.get(bone)),
    sourceSkeleton.boneInverses.map(inverse => inverse.clone()),
  );
  skeleton.pose();
  for (const source of body.meshes) {
    const material = new MeshStandardMaterial();
    if (source.material?.color) material.color.copy(source.material.color);
    const mesh = new SkinnedMesh(source.geometry.clone(), material);
    mesh.name = source.name;
    scene.add(mesh);
    mesh.bind(skeleton, source.bindMatrix);
  }
  scene.animations = clips.map(clip => bakeHelperTracks(clip));
  scene.updateMatrixWorld(true);
  skeleton.update();
  return scene;
}

// binary 出力で GLTFExporter が使う機能だけを補う。ブラウザーでは使わない。
class ArrayBufferFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.({ target: this });
    }, error => {
      this.error = error;
      this.onerror?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
}

let readerUsers = 0;
let readerDescriptor;

function useFileReader() {
  if (readerUsers === 0) {
    if (typeof globalThis.FileReader === 'function') return () => {};
    readerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
    Object.defineProperty(globalThis, 'FileReader', {
      configurable: true, writable: true, value: ArrayBufferFileReader,
    });
  }
  // 同時の書き出しが終わるまで代用品を保ち、最後の呼び出しで元に戻す。
  readerUsers++;
  return () => {
    if (--readerUsers !== 0) return;
    if (readerDescriptor) Object.defineProperty(globalThis, 'FileReader', readerDescriptor);
    else delete globalThis.FileReader;
    readerDescriptor = undefined;
  };
}

/** 関節と焼き込んだ動きを含む、ゲーム向けの単一 GLB を返す。 */
export async function exportGlb(body, clips, { name } = {}) {
  const scene = buildExportScene(body, clips, { name });
  const restoreFileReader = useFileReader();
  try {
    const buffer = await new GLTFExporter().parseAsync(scene, {
      binary: true, animations: scene.animations, onlyVisible: false,
    });
    if (!(buffer instanceof ArrayBuffer)) throw new Error('GLB のバイナリを作れませんでした');
    return buffer;
  } catch (cause) {
    throw new Error('骨と動きを含む GLB を書き出せませんでした', { cause });
  } finally {
    restoreFileReader();
  }
}
