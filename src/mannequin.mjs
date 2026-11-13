// 数値だけから作る、肌がつながった人形の素体。座標は three.js (横 x・左が +x, 高さ y, 前 +z)、単位は m。
// 形は目標の絵を測った断面表。身長・角度・胸のふくらみ以外は基準形への倍率。
import * as THREE from 'three';
import { MANNEQUIN_BASE as BASE } from './mannequin_base.mjs';

const info = (group, label, description, min, max, step) => Object.freeze({ group, label, description, min, max, step });

export const MANNEQUIN_INFO = Object.freeze({
  height: info('体', '身長', '床から頭頂までの高さ(m)', 0.5, 2.5, 0.01),
  headW: info('体', '頭の幅', '基準の頭の横幅の倍率', 0.5, 1.6, 0.01),
  headH: info('体', '頭の高さ', '基準の頭と首の高さの倍率。全体を身長に合わせます', 0.5, 1.6, 0.01),
  headD: info('体', '頭の奥行き', '基準の頭の前後の厚みの倍率', 0.5, 1.6, 0.01),
  shoulderW: info('体', '肩幅', '胴の上1/4の横幅と肩の関節のxの倍率', 0.5, 1.6, 0.01),
  chestW: info('体', '胸の幅', '基準の胴の上半分の横幅の倍率', 0.5, 1.6, 0.01),
  waist: info('体', 'くびれ', '基準の胴の中央の横幅の倍率', 0.5, 1.6, 0.01),
  hipW: info('体', '腰の幅', '胴の下半分の横幅と股の関節のxの倍率', 0.5, 1.6, 0.01),
  torsoD: info('体', '胴の厚み', '基準の胴の前後の厚みの倍率', 0.5, 1.6, 0.01),
  torsoLen: info('体', '胴の長さ', '基準の胴の高さの倍率。全体を身長に合わせます', 0.5, 1.6, 0.01),
  bust: info('体', '胸のふくらみ', '胸の前に加えるふくらみ(身長に対する割合)', 0, 0.08, 0.002),
  armLen: info('手足', '腕の長さ', '基準の肩から手首までの長さの倍率', 0.5, 1.6, 0.01),
  armR: info('手足', '腕の太さ', '基準の腕の断面半径の倍率', 0.5, 1.6, 0.01),
  handSize: info('手足', '手の大きさ', '基準の丸い手の大きさの倍率', 0.5, 1.6, 0.01),
  legLen: info('手足', '脚の長さ', '基準の脚の高さの倍率。全体を身長に合わせます', 0.5, 1.6, 0.01),
  legR: info('手足', '脚の太さ', '基準の脚の断面半径の倍率', 0.5, 1.6, 0.01),
  footSize: info('手足', '足の大きさ', '足首より下の前後の長さの倍率', 0.5, 1.6, 0.01),
  armAngle: info('手足', '腕を開く角度', '立った形で腕を体からどれだけ開くか(度)。0 で真下', 0, 90, 1),
  blend: info('関節', '関節のなじみ', '関節で2つの骨の重みを混ぜる帯の幅(身長に対する割合)', 0.01, 0.08, 0.001),
});

export const MANNEQUIN_PRESETS = Object.freeze({
  male: Object.freeze({
    height: 1.5, headW: 1, headH: 1, headD: 1, shoulderW: 1, chestW: 1, waist: 1, hipW: 1,
    torsoD: 1, torsoLen: 1, bust: 0, armLen: 1, armR: 1, handSize: 1, legLen: 1, legR: 1,
    footSize: 1, armAngle: 29, blend: 0.03,
  }),
  female: Object.freeze({
    height: 1.45, headW: 1, headH: 1, headD: 1, shoulderW: 0.9, chestW: 0.92, waist: 0.84, hipW: 1.04,
    torsoD: 0.94, torsoLen: 1, bust: 0.02, armLen: 1, armR: 0.86, handSize: 0.92, legLen: 1, legR: 0.92,
    footSize: 0.92, armAngle: 27, blend: 0.03,
  }),
});

export const MANNEQUIN_COLORS = Object.freeze({ part: '#e4d5ac' });

/** 足りない項目は初期値、範囲外は端の値、知らない項目は捨てる。 */
export function normalizeParams(input, preset = 'male') {
  const base = Object.hasOwn(MANNEQUIN_PRESETS, preset) ? MANNEQUIN_PRESETS[preset] : MANNEQUIN_PRESETS.male;
  const source = input && typeof input === 'object' ? input : {};
  const result = {};
  for (const [key, { min, max }] of Object.entries(MANNEQUIN_INFO)) {
    const value = source[key];
    result[key] = typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value)) : base[key];
  }
  return result;
}

// 背骨 下・中・上 を、胴の長さの何割の高さに置くか。下はくびれ(胴の玉)の位置。
const SPINE_AT = [0.42, 0.62, 0.8];

/** 高さの区間倍率を先に掛け、最後に全方向を同じ比で身長へ合わせる。 */
function levels(p) {
  const hip = BASE.joints.hip[1], neck = BASE.joints.neck[1];
  const rawY = y => y <= hip ? y * p.legLen : y <= neck
    ? hip * p.legLen + (y - hip) * p.torsoLen
    : hip * p.legLen + (neck - hip) * p.torsoLen + (y - neck) * p.headH;
  const scale = p.height / rawY(1);
  return { scale, y: value => rawY(value) * scale };
}

// 表の任意の位置を線形に読む(関節の中心用)。面は後段でC1補間する。
function tableAt(rows, t) {
  let i = 0;
  while (i < rows.length - 2 && rows[i + 1][0] < t) i++;
  const a = rows[i], b = rows[i + 1];
  const f = THREE.MathUtils.clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
  return a.map((v, k) => lerp(v, b[k], f));
}
const armAxis = p => V(Math.sin(p.armAngle * Math.PI / 180), -Math.cos(p.armAngle * Math.PI / 180), 0);
const wristAt = BASE.joints.armLength * BASE.joints.wristAt;
const armT = (p, t) => Math.min(t, wristAt) * p.armLen + Math.max(0, t - wristAt) * p.handSize;

/** Godot の人型 23 関節。名前・親子・並びは joints.mjs の placeJoints と同じ。 */
export function mannequinJoints(input) {
  const p = normalizeParams(input);
  const { scale: S, y } = levels(p), ref = BASE.joints;
  const joints = [];
  const add = (name, label, parent, position) => joints.push({ name, label, parent, position });
  add('Root', '足もと(床)', null, [0, 0, 0]);
  const hips = [0, y(ref.hips[1]), ref.hips[2] * S * p.torsoD];
  const neck = [0, y(ref.neck[1]), ref.neck[2] * S];
  add('Hips', '腰', 'Root', hips);
  for (const [i, name] of ['Spine', 'Chest', 'UpperChest'].entries()) {
    add(name, `背骨 ${['下', '中', '上'][i]}`, ['Hips', 'Spine', 'Chest'][i], hips.map((v, k) => lerp(v, neck[k], SPINE_AT[i])));
  }
  add('Neck', '首', 'UpperChest', neck);
  add('Head', '頭', 'Neck', [0, y(ref.head[1]), ref.head[2] * S * p.headD]);
  const upperChest = joints.find(joint => joint.name === 'UpperChest').position;
  const axis = armAxis(p);
  for (const [side, prefix, sign] of [['Left', '左', 1], ['Right', '右', -1]]) {
    const shoulder = [sign * ref.shoulder[0] * p.shoulderW * S, y(ref.shoulder[1]), ref.shoulder[2] * S];
    const along = fraction => {
      const t = ref.armLength * fraction, length = armT(p, t) * S;
      return [shoulder[0] + sign * axis.x * length, shoulder[1] + axis.y * length,
        shoulder[2] + tableAt(BASE.arm, t)[3] * S];
    };
    add(`${side}Shoulder`, `${prefix}鎖骨`, 'UpperChest', shoulder.map((v, k) => (v + upperChest[k]) / 2));
    add(`${side}UpperArm`, `${prefix}肩(腕の付け根)`, `${side}Shoulder`, shoulder);
    add(`${side}LowerArm`, `${prefix}ひじ`, `${side}UpperArm`, along(ref.elbowAt));
    add(`${side}Hand`, `${prefix}手首`, `${side}LowerArm`, along(ref.wristAt));
    const legX = atY => sign * tableAt(BASE.leg, atY)[1] * p.hipW * S;
    add(`${side}UpperLeg`, `${prefix}股(脚の付け根)`, 'Hips', [sign * ref.hip[0] * p.hipW * S, y(ref.hip[1]), ref.hip[2] * S]);
    add(`${side}LowerLeg`, `${prefix}ひざ`, `${side}UpperLeg`, [legX(ref.kneeY), y(ref.kneeY), 0]);
    add(`${side}Foot`, `${prefix}足首`, `${side}LowerLeg`, [legX(ref.ankleY), y(ref.ankleY), 0]);
    add(`${side}Toes`, `${prefix}つま先`, `${side}Foot`, [legX(ref.ankleY), y(ref.ankleY) / 2, ref.toeZ * p.footSize * S]);
  }
  return joints;
}

// ---- つながった6部品 ----

const entry = (name, chain) => Object.freeze({ name, chain: Object.freeze(chain) });

/** buildMannequinBody の meshes はこの順。 */
export const MANNEQUIN_PARTS = Object.freeze([
  entry('頭', ['Neck', 'Head']),
  entry('胴', ['Hips', 'Spine', 'Chest', 'UpperChest']),
  entry('左腕', ['LeftUpperArm', 'LeftLowerArm', 'LeftHand', 'UpperChest']),
  entry('右腕', ['RightUpperArm', 'RightLowerArm', 'RightHand', 'UpperChest']),
  entry('左脚', ['LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot', 'LeftToes']),
  entry('右脚', ['RightUpperLeg', 'RightLowerLeg', 'RightFoot', 'RightToes']),
]);

// export_glb.mjs・skin.mjs と同じ [中間関節, 親, 回転元]。人形の部品は使わないが、書き出しと動きが同じ骨格を前提にしている。
const HELPER_DEFS = [
  ['LeftKneeMid', 'LeftUpperLeg', 'LeftLowerLeg'],
  ['RightKneeMid', 'RightUpperLeg', 'RightLowerLeg'],
  ['LeftElbowMid', 'LeftUpperArm', 'LeftLowerArm'],
  ['RightElbowMid', 'RightUpperArm', 'RightLowerArm'],
];

const AROUND = 24;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;

/** 断面(超だ円)を軸に沿って積み、両端を 1 点で閉じる。section: { c, u, v, w, d, n }。 */
function sweep(tipStart, sections, tipEnd) {
  const positions = [...tipStart.toArray()];
  for (const { c, u, v, w, d, n = 2 } of sections) {
    const e = 2 / n;
    for (let k = 0; k < AROUND; k++) {
      const angle = 2 * Math.PI * k / AROUND;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const a = Math.sign(cos) * Math.abs(cos) ** e * w;
      const b = Math.sign(sin) * Math.abs(sin) ** e * d;
      positions.push(c.x + u.x * a + v.x * b, c.y + u.y * a + v.y * b, c.z + u.z * a + v.z * b);
    }
  }
  const last = positions.length / 3;
  positions.push(...tipEnd.toArray());
  const indices = [];
  const ring = i => 1 + i * AROUND;
  for (let k = 0; k < AROUND; k++) {
    const next = (k + 1) % AROUND;
    indices.push(0, ring(0) + next, ring(0) + k);
    for (let i = 0; i + 1 < sections.length; i++) {
      indices.push(ring(i) + k, ring(i) + next, ring(i + 1) + next, ring(i) + k, ring(i + 1) + next, ring(i + 1) + k);
    }
    indices.push(last, ring(sections.length - 1) + k, ring(sections.length - 1) + next);
  }
  return { positions, indices };
}

function frame(axis) {
  let v = V(0, 0, 1).addScaledVector(axis, -axis.z);
  if (v.lengthSq() < 1e-8) v = V(1, 0, 0).addScaledVector(axis, -axis.x);
  v.normalize();
  return { u: v.clone().cross(axis).normalize(), v };
}

/** 高さごとの断面を積む、左右対称の部品。rows: { y, w(横の半幅), d(前後の半幅), z, n }。 */
function column(yStart, rows, yEnd) {
  const u = V(0, 0, 1);
  const v = V(1, 0, 0);
  const sections = rows.map(row => ({ c: V(0, row.y, row.z ?? 0), u, v, w: row.d, d: row.w, n: row.n }));
  return sweep(V(0, yStart, rows[0].z ?? 0), sections, V(0, yEnd, rows[rows.length - 1].z ?? 0));
}

function toGeometry({ positions, indices }) {
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3];
    volume += positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1])
      - positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c])
      + positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
  }
  // 面が内向きなら裏返す(左右を反転して作った部品など)。
  if (volume < 0) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // 計測表の細かい折れや平らな足裏との境目は、輪同士で法線をならす。
  // 頂点を分裂させず、輪の継ぎ目も同じ法線を共有する。
  const normal = geometry.getAttribute('normal');
  const rowCount = (normal.count - 2) / AROUND;
  let previous = normal.array.slice();
  for (let pass = 0; pass < 6; pass++) {
    const next = previous.slice();
    for (let row = 0; row < rowCount; row++) for (let k = 0; k < AROUND; k++) {
      const i = 1 + row * AROUND + k;
      const before = row === 0 ? 0 : i - AROUND;
      const after = row === rowCount - 1 ? normal.count - 1 : i + AROUND;
      const vector = V(0, 0, 0);
      for (let axis = 0; axis < 3; axis++) vector.setComponent(axis,
        previous[i * 3 + axis] * 0.5 + (previous[before * 3 + axis] + previous[after * 3 + axis]) * 0.25);
      vector.normalize().toArray(next, i * 3);
    }
    previous = next;
  }
  normal.array.set(previous);
  return geometry;
}

const smoothstep = t => t * t * (3 - 2 * t);

// 骨の境界と帯の途中にも輪を置き、長い区間を細分する。
const bandStops = (cuts, band) => cuts.flatMap(c => [-0.5, -0.25, 0, 0.25, 0.5].map(k => c + k * band));
function sampleRows(controls, step, stops = []) {
  const ts = new Set(controls.map(row => row.t));
  for (let i = 1; i < controls.length; i++) {
    const a = controls[i - 1].t, b = controls[i].t;
    const count = Math.max(8, Math.ceil((b - a) / step));
    for (let j = 1; j < count; j++) ts.add(lerp(a, b, j / count));
  }
  for (const t of stops) if (t > controls[0].t && t < controls[controls.length - 1].t) ts.add(t);
  // Set は計算誤差のある同じ高さをまとめない。Float32 化で潰れる輪を先に除く。
  const samples = [];
  for (const t of [...ts].sort((a, b) => a - b)) {
    if (!samples.length || t - samples[samples.length - 1] > 1e-6) samples.push(t);
  }
  // 各区間を個別に smoothstep すると制御輪ごとに傾きが 0 に戻り、陰影が帯になる。
  // 単調な区間では調和平均の接線を共有し、半径が行き過ぎない C1 補間にする。
  const tangents = Object.fromEntries(['w', 'd', 'z', 'x'].map(key => {
    const slopes = controls.slice(1).map((b, i) => ((b[key] ?? 0) - (controls[i][key] ?? 0)) / (b.t - controls[i].t));
    return [key, controls.map((row, i) => {
      if (i === 0) return slopes[0];
      if (i === controls.length - 1) return slopes[i - 1];
      const before = slopes[i - 1], after = slopes[i];
      if (before * after <= 0) return 0;
      const h0 = row.t - controls[i - 1].t, h1 = controls[i + 1].t - row.t;
      const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
      return (w0 + w1) / (w0 / before + w1 / after);
    })];
  }));
  let segment = 0;
  return samples.map(t => {
    while (segment < controls.length - 2 && t > controls[segment + 1].t) segment++;
    const a = controls[segment], b = controls[segment + 1];
    const h = b.t - a.t, f = (t - a.t) / h;
    const blend = smoothstep(f), start = f * (1 - f) ** 2, end = f * f * (f - 1);
    const row = { t };
    for (const key of ['w', 'd', 'z', 'x']) {
      row[key] = lerp(a[key] ?? 0, b[key] ?? 0, blend)
        + h * (start * tangents[key][segment] + end * tangents[key][segment + 1]);
    }
    return row;
  });
}

/** chain 内の番号と重み。短い骨では帯を狭め、3本への重なりを防ぐ。 */
function chainWeights(t, cuts, band) {
  for (let i = 0; i < cuts.length; i++) {
    const half = Math.min(band / 2,
      i > 0 ? (cuts[i] - cuts[i - 1]) / 2 : Infinity,
      i + 1 < cuts.length ? (cuts[i + 1] - cuts[i]) / 2 : Infinity);
    if (t <= cuts[i] - half) return [[i, 1]];
    if (t < cuts[i] + half) {
      const weight = smoothstep((t - cuts[i] + half) / (2 * half));
      return [[i, 1 - weight], [i + 1, weight]];
    }
  }
  return [[cuts.length, 1]];
}

// 横幅の倍率は高さの区間をまたいで滑らかに混ぜる。
const ease = (a, b, t) => smoothstep(THREE.MathUtils.clamp((t - a) / (b - a), 0, 1));
function torsoWidth(p, y) {
  const t = (y - BASE.torso[0][0]) / (BASE.torso.at(-1)[0] - BASE.torso[0][0]);
  const lower = ease(0.25, 0.5, t), upper = ease(0.5, 0.75, t);
  const width = p.hipW * (1 - lower) + p.waist * (lower - upper) + p.chestW * upper;
  return lerp(width, p.shoulderW, ease(0.72, 0.88, t));
}

// 表の前後非対称な断面を、共有頂点の輪として積む。
function bodyColumn(p, table, cuts, band, head = false) {
  const { scale: S, y } = levels(p);
  const controls = table.map(([height, width, front, back]) => {
    const t = (height - table[0][0]) / (table.at(-1)[0] - table[0][0]);
    const bust = head ? 0 : p.bust * ease(0.45, 0.7, t) * (1 - ease(0.85, 1, t));
    const f = front * (head ? p.headD : p.torsoD) + bust;
    const b = back * (head ? p.headD : p.torsoD);
    return { t: y(height), w: width * (head ? p.headW : torsoWidth(p, height)) * S,
      d: (f + b) * S / 2, z: (f - b) * S / 2 };
  });
  const first = controls[0], last = controls.at(-1);
  // 表の外側だけを丸く閉じる。首の下端は胴の内部へ入れる。
  const bottom = head ? y(table[0][0] - 0.012) : y(table[0][0] - 0.004);
  const top = head ? p.height : y(table.at(-1)[0] + 0.008);
  // 閉じる点も同じ補間へ含め、端と計測断面の接線を共有する。
  const sections = sampleRows([{ ...first, t: bottom, w: 0, d: 0 }, ...controls,
    { ...last, t: top, w: 0, d: 0 }], S * 0.0015, bandStops(cuts, band)).slice(1, -1);
  return {
    shape: column(bottom, sections.map(row => ({ ...row, y: row.t, n: 2.3 })), top),
    weights: point => chainWeights(point.y, cuts, band),
  };
}
function headSurface(p, band) {
  return bodyColumn(p, BASE.head, [levels(p).y(BASE.joints.head[1])], band, true);
}
function torsoSurface(p, joints, band) {
  return bodyColumn(p, BASE.torso, ['Spine', 'Chest', 'UpperChest'].map(name => joints[name].y), band);
}

function armSurface(p, joints, band) {
  const { scale: S } = levels(p), origin = joints.LeftUpperArm, axis = armAxis(p), { u, v } = frame(axis);
  const radius = BASE.arm[0][1] * p.armR * S;
  const cuts = [BASE.joints.armLength * BASE.joints.elbowAt, wristAt].map(t => armT(p, t) * S);
  const controls = BASE.arm.map(([t, w, d, z]) => {
    const hand = ease(wristAt, 0.2413, t);
    const size = lerp(p.armR, p.handSize, hand);
    return { t: armT(p, t) * S, w: w * size * S, d: d * size * S, z: z * S };
  });
  // 胴に隠れる球冠だけで閉じる。球の外側の半球まで足すと、表にない肩のこぶになる。
  // 球冠の半径は最初の輪と同じ。球冠から輪までの接続も胴の内部に収める。
  const cap = [{ t: -radius, w: 0, d: 0, z: 0 }];
  for (let i = 1; i <= 12; i++) {
    const phi = i / 12 * 0.18;
    cap.push({ t: -radius * Math.cos(phi), w: radius * Math.sin(phi), d: radius * Math.sin(phi), z: 0 });
  }
  cap.push({ t: -radius * 0.55, w: radius * 0.16, d: radius * 0.16, z: 0 });
  const sections = [];
  const rows = sampleRows([...cap, ...controls], S * 0.0015, bandStops(cuts, band));
  const inward = joints.LeftShoulder.clone().sub(origin).normalize();
  // sweep は球冠の先端から肩へ進むので、輪の進行方向は -inward。
  const capRotation = new THREE.Quaternion().setFromUnitVectors(axis, inward.clone().negate());
  const capEnd = cap.at(-2).t, stemEnd = cap.at(-1).t;
  for (const row of rows.slice(1, -1)) {
    if (row.t >= 0) {
      sections.push({ c: origin.clone().addScaledVector(axis, row.t).add(V(0, 0, row.z)),
        u, v, w: row.w, d: row.d });
      continue;
    }
    // 球冠と軸は鎖骨側へ向け、接続区間で最初の輪の向きへ滑らかに戻す。
    const blend = ease(stemEnd, 0, row.t);
    const rotation = new THREE.Quaternion().slerp(capRotation, 1 - blend);
    const direction = axis.clone().applyQuaternion(rotation);
    const capRadius = Math.sqrt(Math.max(0, radius * radius - row.t * row.t));
    // 中心は胴内側に長く留め、肩の上へ膨らまずに元の軸へ接続する。
    const centerBlend = blend * blend;
    const center = origin.clone().addScaledVector(inward, -row.t * (1 - centerBlend))
      .addScaledVector(axis, row.t * centerBlend).add(V(0, 0, row.z));
    sections.push({ c: center, ...frame(direction),
      w: row.t <= capEnd ? capRadius : row.w, d: row.t <= capEnd ? capRadius : row.d });
  }
  const last = rows.at(-1);
  return {
    shape: sweep(origin.clone().addScaledVector(inward, radius), sections,
      origin.clone().addScaledVector(axis, last.t).add(V(0, 0, last.z))),
    weights: (point, i) => {
      const row = i === 0 ? rows[0] : rows[Math.min(Math.floor((i - 1) / AROUND) + 1, rows.length - 1)];
      if (row.t >= 0) return chainWeights(point.clone().sub(origin).dot(axis), cuts, band);
      // 胴内の球冠と軸は鎖骨から独立させ、肩の輪まで上腕へ滑らかに渡す。
      const armWeight = ease(stemEnd, 0, row.t);
      return [[3, 1 - armWeight], [0, armWeight]];
    },
  };
}

function legSurface(p, joints, band) {
  const { scale: S, y } = levels(p), origin = joints.LeftUpperLeg;
  const top = BASE.leg.at(-1), radius = top[2] * p.legR * S;
  const controls = BASE.leg.map(([height, x, width, front, back]) => {
    const foot = lerp(1, p.footSize, 1 - ease(BASE.joints.ankleY - 0.02, BASE.joints.ankleY, height));
    return { t: y(height), x: x * p.hipW * S, w: width * p.legR * S,
      d: (front + back) * p.legR * foot * S / 2, z: (front - back) * p.legR * foot * S / 2 };
  });
  controls.unshift({ ...controls[0], t: 0, w: controls[0].w * 0.9, d: controls[0].d * 0.9 });
  // 最上段から股の球の赤道まで補間し、その上は正確な半球で胴へ埋める。
  controls.push({ t: origin.y, x: origin.x, w: radius, d: radius, z: origin.z });
  const cuts = [-joints.LeftLowerLeg.y, -joints.LeftFoot.y];
  const rows = sampleRows(controls, S * 0.0015, bandStops(cuts, band).map(t => -t));
  const u = V(0, 0, 1), v = V(1, 0, 0);
  const sections = rows.map(row => ({ c: V(row.x, row.t, row.z), u, v, w: row.d, d: row.w }));
  const capStart = 1 + sections.length * AROUND;
  for (let i = 1; i < 24; i++) {
    const phi = i / 24 * Math.PI / 2;
    sections.push({ c: origin.clone().add(V(0, radius * Math.sin(phi), 0)), u, v,
      w: radius * Math.cos(phi), d: radius * Math.cos(phi) });
  }
  return {
    shape: sweep(V(rows[0].x, 0, rows[0].z), sections, origin.clone().add(V(0, radius, 0))),
    weights: (point, i) => {
      if (i >= capStart) return [[0, 1]];
      if (point.y < joints.LeftFoot.y - band / 2) {
        const toe = chainWeights(point.z, [joints.LeftToes.z], band).find(([index]) => index === 1)?.[1] ?? 0;
        const weight = toe * (1 - ease(joints.LeftFoot.y - band, joints.LeftFoot.y - band / 2, point.y));
        return weight === 0 ? [[2, 1]] : weight === 1 ? [[3, 1]] : [[2, 1 - weight], [3, weight]];
      }
      return chainWeights(-point.y, cuts, band);
    },
  };
}

function mirrorSurface(surface) {
  const positions = surface.shape.positions.map((value, i) => i % 3 === 0 ? -value : value);
  return {
    shape: { positions, indices: [...surface.shape.indices] },
    weights: (point, i) => surface.weights(V(-point.x, point.y, point.z), i),
  };
}

/** 6つの連続した部品を、23関節と4中間関節の共通骨格に結び付ける。 */
export function buildMannequinBody(input, { colors = MANNEQUIN_COLORS } = {}) {
  const p = normalizeParams(input);
  const joints = mannequinJoints(p);
  const byName = Object.fromEntries(joints.map(joint => [joint.name, joint]));
  const bones = Object.create(null);
  const group = new THREE.Group();
  group.name = '人形';
  for (const joint of joints) {
    const bone = new THREE.Bone();
    bone.name = joint.name;
    bone.position.fromArray(joint.position);
    bones[joint.name] = bone;
    if (joint.parent === null) group.add(bone);
    else {
      bone.position.sub(V(...byName[joint.parent].position));
      bones[joint.parent].add(bone);
    }
  }
  const helpers = Object.create(null);
  for (const [name, parentName, sourceName] of HELPER_DEFS) {
    const helper = new THREE.Bone();
    helper.name = name;
    helper.position.copy(bones[sourceName].position);
    bones[parentName].add(helper);
    helpers[name] = helper;
  }
  group.updateMatrixWorld(true);
  const boneList = [...joints.map(joint => bones[joint.name]), ...HELPER_DEFS.map(([name]) => helpers[name])];
  const skeleton = new THREE.Skeleton(boneList);
  const jointPoints = Object.fromEntries(joints.map(joint => [joint.name, V(...joint.position)]));
  const band = p.blend * p.height;
  const arm = armSurface(p, jointPoints, band), leg = legSurface(p, jointPoints, band);
  const surfaces = [headSurface(p, band), torsoSurface(p, jointPoints, band), arm, mirrorSurface(arm), leg, mirrorSurface(leg)];
  const material = new THREE.MeshStandardMaterial({ color: colors.part ?? MANNEQUIN_COLORS.part, roughness: 0.75 });
  const meshes = MANNEQUIN_PARTS.map(({ name, chain }, partIndex) => {
    const surface = surfaces[partIndex];
    const geometry = toGeometry(surface.shape);
    const position = geometry.getAttribute('position');
    const skinIndex = new Uint16Array(position.count * 4);
    const skinWeight = new Float32Array(position.count * 4);
    const indices = chain.map(name => boneList.indexOf(bones[name]));
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      for (const [slot, [index, weight]] of surface.weights(point, i).entries()) {
        skinIndex[i * 4 + slot] = indices[index];
        skinWeight[i * 4 + slot] = weight;
      }
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = name;
    mesh.userData.chain = [...chain];
    group.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
    return mesh;
  });
  group.updateMatrixWorld(true);
  return { group, skeleton, meshes, bones, helpers, joints };
}
