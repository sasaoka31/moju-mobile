import * as THREE from 'three';
import { clampPose, DEFAULT_LIMITS } from './joint_limits.mjs';

/** CCDで親から順に回す。入力の骨・poseは変更せず、変更分だけ返す。 */
export function solvePoseIK({ bones, pose = {}, joint, target, chain = 1, iterations = 10, limits = DEFAULT_LIMITS }) {
  const source = bones?.[joint];
  if (!source || joint === 'Hips' || joint === 'Root') return {};
  const coordinates = Array.isArray(target) ? target : [target?.x, target?.y, target?.z];
  if (coordinates.length !== 3 || !coordinates.every(Number.isFinite)) return {};
  const goal = new THREE.Vector3().fromArray(coordinates);
  const count = Number.isFinite(chain) ? Math.max(1, Math.min(6, Math.floor(chain))) : 1;
  const repeats = Number.isFinite(iterations) ? Math.max(1, Math.min(30, Math.floor(iterations))) : 10;

  // 先端までの経路だけを複製。previewなど骨の外側の移動・回転・倍率も保つ。
  const path = [];
  for (let node = source; node; node = node.parent) path.unshift(node);
  const copies = new Map();
  let parent = null;
  for (const node of path) {
    const copy = new THREE.Object3D();
    copy.name = node.name;
    copy.position.copy(node.position);
    copy.quaternion.copy(node.quaternion);
    copy.scale.copy(node.scale);
    if (bones[node.name] === node) {
      const angles = pose[node.name] ?? [0, 0, 0];
      if (!Array.isArray(angles) || angles.length !== 3 || !angles.every(Number.isFinite)) return {};
      copy.rotation.set(...angles.map(THREE.MathUtils.degToRad), 'XYZ');
    }
    if (parent) parent.add(copy);
    copies.set(node, copy);
    parent = copy;
  }
  const tip = copies.get(source);
  const pivots = [];
  for (let node = source.parent; node && pivots.length < count; node = node.parent) {
    if (node.name === 'Hips' || node.name === 'Root' || bones[node.name] !== node) break;
    pivots.push(copies.get(node));
  }
  const result = {};
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');
  for (let step = 0; step < repeats; step++) {
    for (const pivot of pivots) {
      const end = tip.getWorldPosition(new THREE.Vector3());
      const destination = goal.clone();
      // 親の座標系で差分を作り、局所回転へ左から足す。
      if (pivot.parent) {
        pivot.parent.worldToLocal(end);
        pivot.parent.worldToLocal(destination);
      }
      end.sub(pivot.position);
      destination.sub(pivot.position);
      if (end.lengthSq() < 1e-20 || destination.lengthSq() < 1e-20) continue;
      rotation.setFromUnitVectors(end.normalize(), destination.normalize());
      rotation.multiply(pivot.quaternion).normalize();
      euler.setFromQuaternion(rotation, 'XYZ');
      const angles = [euler.x, euler.y, euler.z].map(THREE.MathUtils.radToDeg);
      if (!angles.every(Number.isFinite)) continue;
      const clamped = clampPose({ [pivot.name]: angles }, limits)[pivot.name];
      if (!clamped.every(Number.isFinite)) continue;
      pivot.rotation.set(...clamped.map(THREE.MathUtils.degToRad), 'XYZ');
      pivot.updateWorldMatrix(true, true);
      const original = pose[pivot.name] ?? [0, 0, 0];
      if (clamped.some((angle, axis) => Math.abs(angle - original[axis]) > 1e-8)) {
        result[pivot.name] = clamped;
      } else delete result[pivot.name];
    }
    if (tip.getWorldPosition(new THREE.Vector3()).distanceToSquared(goal) < 1e-12) break;
  }
  return result;
}
