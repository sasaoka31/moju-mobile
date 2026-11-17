import { BufferAttribute, Float32BufferAttribute, Vector3 } from 'three';

/** sweep の輪を背面で開き、中心線の長さに沿った UV を付ける。 */
export function addBodyUV(geometry, { around = 24, seam = 12 } = {}) {
  const position = geometry.getAttribute('position');
  const count = position.count;
  const rows = (count - 2) / around;
  if (!Number.isInteger(around) || around < 3 || !Number.isInteger(seam)
    || !Number.isInteger(rows) || rows < 1) {
    throw new RangeError('Expected sweep vertices: two tips and complete rings');
  }
  seam = ((seam % around) + around) % around;
  const pairs = Array.from({ length: rows }, (_, row) => [1 + row * around + seam, count + row]);
  const copies = new Map(pairs);

  const previous = new Vector3().fromBufferAttribute(position, 0);
  const center = new Vector3(), point = new Vector3();
  const distances = [0];
  for (let row = 0; row < rows; row++) {
    center.set(0, 0, 0);
    for (let k = 0; k < around; k++) {
      center.add(point.fromBufferAttribute(position, 1 + row * around + k));
    }
    center.divideScalar(around);
    distances.push(distances.at(-1) + previous.distanceTo(center));
    previous.copy(center);
  }
  point.fromBufferAttribute(position, count - 1);
  const length = distances.at(-1) + previous.distanceTo(point);
  const uv = new Float32Array((count + rows) * 2);
  uv[0] = uv[(count - 1) * 2] = 0.5;
  uv[(count - 1) * 2 + 1] = 1;
  for (let row = 0; row < rows; row++) {
    const v = length > 0 ? distances[row + 1] / length : 0;
    for (let k = 0; k < around; k++) {
      const i = 1 + row * around + k;
      uv[i * 2] = ((k - seam + around) % around) / around;
      uv[i * 2 + 1] = v;
    }
    uv[(count + row) * 2] = 1;
    uv[(count + row) * 2 + 1] = v;
  }

  // 生の値を写すことで、整数の skinIndex や正規化属性もそのまま保つ。
  for (const [name, source] of Object.entries(geometry.attributes)) {
    const stride = source.isInterleavedBufferAttribute ? source.data.stride : source.itemSize;
    const offset = source.isInterleavedBufferAttribute ? source.offset : 0;
    const array = new source.array.constructor((count + rows) * source.itemSize);
    for (let i = 0; i < count + rows; i++) {
      const original = i < count ? i : pairs[i - count][0];
      for (let component = 0; component < source.itemSize; component++) {
        array[i * source.itemSize + component] = source.array[original * stride + offset + component];
      }
    }
    const attribute = source.isInterleavedBufferAttribute
      ? new BufferAttribute(array, source.itemSize, source.normalized) : source.clone();
    attribute.array = array;
    attribute.count = count + rows;
    geometry.setAttribute(name, attribute);
  }

  const index = geometry.getIndex();
  const indices = Array.from(index.array);
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = indices.slice(i, i + 3);
    const us = triangle.map(vertex => uv[vertex * 2]);
    if (Math.max(...us) - Math.min(...us) > 0.5) {
      for (let j = 0; j < 3; j++) {
        if (copies.has(triangle[j])) indices[i + j] = copies.get(triangle[j]);
      }
    }
  }
  geometry.setIndex(indices);
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.userData.uvSeam = pairs;
  return geometry;
}
