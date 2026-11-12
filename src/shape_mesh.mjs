import * as THREE from 'three';

export const MARKER_COLORS = {
  赤: '#ff0000', 黄: '#ffff00', 緑: '#00ff00',
  水色: '#00ffff', 青: '#0000ff', 紫: '#ff00ff',
};

export function markerColor(name) {
  return Object.prototype.hasOwnProperty.call(MARKER_COLORS, name)
    ? MARKER_COLORS[name] : null;
}

export function partGeometry(shape, patterns, partIndex) {
  const part = shape?.parts?.[partIndex];
  if (!Array.isArray(part?.rows) || part.rows.length < 2) {
    throw new Error('面を作るには部品に高さの異なる行が2つ以上必要です');
  }
  const horizontal = part.orientation === 'horizontal';
  if (horizontal && (!['left', 'right'].includes(part.side) || !Number.isFinite(part.base_height))) {
    throw new Error('横向きの部品には左右の側と有限の高さの基準が必要です');
  }
  const sourceRows = horizontal ? part.rows.map(row => ({
    ...row, h: row.position, left: row.up, right: row.down,
  })) : part.rows;
  for (const row of sourceRows) {
    if (!['h', 'left', 'right', 'front', 'back'].every(key => Number.isFinite(row[key]))) {
      throw new Error('部品の高さと端位置は有限の数にしてください');
    }
  }
  const rows = [...sourceRows].sort((a, b) => a.h - b.h);
  if (rows.some((row, i) => i > 0 && row.h === rows[i - 1].h)) {
    throw new Error('面を作るには各行の高さを異なる値にしてください');
  }

  const exponent = name => {
    if (!patterns || !Object.prototype.hasOwnProperty.call(patterns, name)) {
      throw new Error(`知らない丸め方のパターン: ${name}`);
    }
    const n = patterns[name]?.n;
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`丸め方の指数は正の有限数にしてください: ${name}`);
    }
    return n;
  };

  const segments = 32;
  const positions = [];
  const indices = [];
  const rings = rows.map(row => {
    const { h, left, right, front, back } = row;
    const nf = exponent(row.round_front);
    const nb = exponent(row.round_back);
    const cx = Math.min(left, right) < 0 ? (right - left) / 2 : 0;
    const cy = Math.min(front, back) < 0 ? (back - front) / 2 : 0;
    const unique = new Map();
    const ring = [];
    for (let j = 0; j < segments; j++) {
      const angle = j * 2 * Math.PI / segments;
      // 軸上の微小な誤差は、高い指数で拡大される前に取り除く。
      const c = Math.abs(Math.cos(angle)) < 1e-12 ? 0 : Math.cos(angle);
      const s = Math.abs(Math.sin(angle)) < 1e-12 ? 0 : Math.sin(angle);
      const n = s < 0 ? nf : nb;
      const width = c >= 0 ? right - cx : left + cx;
      const depth = s >= 0 ? back - cy : front + cy;
      const x = cx + width * Math.sign(c) * Math.abs(c) ** (2 / n);
      const y = cy + depth * Math.sign(s) * Math.abs(s) ** (2 / n);
      const key = `${x},${y}`;
      if (!unique.has(key)) {
        unique.set(key, positions.length / 3);
        // 形の言語の (X, Y, Z) を three.js の (X, Z, -Y) へ。
        if (horizontal) {
          positions.push((part.side === 'left' ? 1 : -1) * h, part.base_height - x, -y);
        } else {
          positions.push(x, h, -y);
        }
      }
      ring.push(unique.get(key));
    }
    return ring;
  });

  const addFace = vertices => {
    const face = [...new Set(vertices)];
    // 右腕は横軸の反転で面の向きも反転する。
    if (horizontal && part.side === 'right') face.reverse();
    for (let i = 1; i + 1 < face.length; i++) {
      const a = face[0] * 3;
      const b = face[i] * 3;
      const c = face[i + 1] * 3;
      const ab = positions.slice(b, b + 3).map((v, axis) => v - positions[a + axis]);
      const ac = positions.slice(c, c + 3).map((v, axis) => v - positions[a + axis]);
      if (ab[1] * ac[2] !== ab[2] * ac[1]
          || ab[2] * ac[0] !== ab[0] * ac[2]
          || ab[0] * ac[1] !== ab[1] * ac[0]) {
        indices.push(face[0], face[i], face[i + 1]);
      }
    }
  };
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let j = 0; j < segments; j++) {
      const k = (j + 1) % segments;
      addFace([rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]]);
    }
  }
  addFace([...rings[0]].reverse());
  addFace(rings[rings.length - 1]);
  if (indices.length === 0) {
    throw new Error('部品の断面から面を作れません。高さと端位置を確認してください');
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
