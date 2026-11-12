import { loadMotionSource, retargetClips } from './motions.mjs';

// Quaternius Universal Animation Library (CC0) の Unreal 式の名前を、Moju の23関節へ合わせる。
export const QUATERNIUS_BONE_NAMES = new Map(Object.entries({
  root: 'Root', pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Chest', spine_03: 'UpperChest',
  neck_01: 'Neck', Head: 'Head', clavicle_l: 'LeftShoulder', upperarm_l: 'LeftUpperArm',
  lowerarm_l: 'LeftLowerArm', hand_l: 'LeftHand', clavicle_r: 'RightShoulder', upperarm_r: 'RightUpperArm',
  lowerarm_r: 'RightLowerArm', hand_r: 'RightHand', thigh_l: 'LeftUpperLeg', calf_l: 'LeftLowerLeg',
  foot_l: 'LeftFoot', ball_l: 'LeftToes', thigh_r: 'RightUpperLeg', calf_r: 'RightLowerLeg',
  foot_r: 'RightFoot', ball_r: 'RightToes',
}));

/** 骨(scene の Object の name)とトラック名の両方を、Moju の関節名へ置き換える。指の骨などはそのまま残す。 */
export function renameQuaterniusBones(source) {
  if (!source?.scene?.traverse || !Array.isArray(source.clips)) {
    throw new Error('動きの素を用意してください');
  }
  source.scene.traverse(object => {
    const renamed = QUATERNIUS_BONE_NAMES.get(object.name);
    if (renamed) object.name = renamed;
  });
  for (const clip of source.clips) {
    for (const track of clip.tracks) {
      const dot = track.name.indexOf('.');
      if (dot === -1) continue;
      const renamed = QUATERNIUS_BONE_NAMES.get(track.name.slice(0, dot));
      if (renamed) track.name = renamed + track.name.slice(dot);
    }
  }
  return source;
}

export const QUATERNIUS_SOURCES = [
  { prefix: 'q1', file: 'UAL1_Standard.glb' },
  { prefix: 'q2', file: 'UAL2_Standard.glb' },
];

/** 骨の名前を置き換え、A_TPose を除き、クリップ名に素材ごとの頭(q1/ q2/)を付ける。 */
export function prepareQuaterniusSource(source, prefix) {
  renameQuaterniusBones(source);
  return {
    scene: source.scene,
    clips: source.clips.filter(clip => clip.name !== 'A_TPose').map(clip => {
      clip.name = `${prefix}/${clip.name}`;
      return clip;
    }),
  };
}

async function readQuaterniusFile(file, options) {
  const url = new URL(`../assets/motions/quaternius/${file}`, import.meta.url);
  if (options.readFile) return options.readFile(url);
  if (!options.fetch && typeof window === 'undefined' && url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return readFile(url);
  }
  const fetchMotion = options.fetch ?? globalThis.fetch;
  if (typeof fetchMotion !== 'function') throw new Error('動きの読み込み方法を指定してください');
  const response = await fetchMotion(url);
  if (!response.ok) throw new Error(`動きのファイルを取得できませんでした: ${response.status}`);
  return response.arrayBuffer();
}

/** UAL1・UAL2 を読み込み、整えた素を { q1, q2 } で返す。options.readFile / options.fetch は motions.mjs と同じ。 */
export async function loadQuaterniusSources(options = {}) {
  const entries = await Promise.all(QUATERNIUS_SOURCES.map(async ({ prefix, file }) => {
    let data;
    try {
      data = await readQuaterniusFile(file, options);
    } catch (cause) {
      throw new Error(`Quaternius の動きの素材を読み込めませんでした(${file})`, { cause });
    }
    const source = await loadMotionSource(data);
    return [prefix, prepareQuaterniusSource(source, prefix)];
  }));
  return Object.fromEntries(entries);
}

/**
 * 選んだ動きだけをその場で付け替え、結果を取っておく。
 * 同じ joints・options で同じ名前を選ぶと、2回目以降は付け替えをせず取っておいた結果を返す。
 * joints や options が変わると、取っておいた結果をすべて捨てる。
 */
export function createQuaterniusRetargeter(sources) {
  let cache = new Map();
  let cacheKey = null;
  return function getQuaterniusClip(name, joints, options) {
    if (typeof name !== 'string') return undefined;
    const slash = name.indexOf('/');
    if (slash === -1) return undefined;
    const source = sources?.[name.slice(0, slash)];
    if (!source) return undefined;
    const key = JSON.stringify([joints, options]);
    if (key !== cacheKey) {
      cache = new Map();
      cacheKey = key;
    }
    if (cache.has(name)) return cache.get(name);
    const original = source.clips.find(clip => clip.name === name);
    if (!original) return undefined;
    const [clip] = retargetClips({ scene: source.scene, clips: [original] }, joints, options);
    cache.set(name, clip);
    return clip;
  };
}

// UAL1_Standard.glb (q1) の日本語名。A_TPose は一覧に出さない。
const Q1_LABELS = {
  Crouch_Fwd_Loop: 'しゃがんで進む',
  Crouch_Idle_Loop: 'しゃがんで待つ',
  Dance_Loop: '踊る',
  Death01: '死ぬ',
  Driving_Loop: '運転する',
  Fixing_Kneeling: 'ひざをついて直す',
  Hit_Chest: '胸に当たる',
  Hit_Head: '頭に当たる',
  Idle_Loop: '立って待つ',
  Idle_Talking_Loop: '立って話す',
  Idle_Torch_Loop: 'たいまつを持つ',
  Interact: '手を伸ばす',
  Jog_Fwd_Loop: '小走りする',
  Jump_Land: '着地する',
  Jump_Loop: '跳んでいる',
  Jump_Start: '跳び始める',
  PickUp_Table: '台から拾う',
  Pistol_Aim_Down: '銃を下に構える',
  Pistol_Aim_Neutral: '銃を構える',
  Pistol_Aim_Up: '銃を上に構える',
  Pistol_Idle_Loop: '銃を持って待つ',
  Pistol_Reload: '銃に弾を込める',
  Pistol_Shoot: '撃つ',
  Punch_Cross: '右ストレートを打つ',
  Punch_Jab: '左ジャブを打つ',
  Push_Loop: '押す',
  Roll: '転がる',
  Sitting_Enter: '座る',
  Sitting_Exit: '立ち上がる',
  Sitting_Idle_Loop: '座って待つ',
  Sitting_Talking_Loop: '座って話す',
  Spell_Simple_Enter: '魔法を構える',
  Spell_Simple_Exit: '魔法をしまう',
  Spell_Simple_Idle_Loop: '魔法を構えて待つ',
  Spell_Simple_Shoot: '魔法を放つ',
  Sprint_Loop: '全力で走る',
  Swim_Fwd_Loop: '泳いで進む',
  Swim_Idle_Loop: '浮いて待つ',
  Sword_Attack: '剣で斬る',
  Sword_Idle: '剣を構えて待つ',
  Walk_Formal_Loop: 'きちんと歩く',
  Walk_Loop: '歩く',
};

// UAL2_Standard.glb (q2) の日本語名。A_TPose は一覧に出さない。
const Q2_LABELS = {
  Chest_Open: '宝箱を開ける',
  ClimbUp_1m: 'よじ登る',
  Consume: '飲み食いする',
  Farm_Harvest: '収穫する',
  Farm_PlantSeed: '種をまく',
  Farm_Watering: '水をやる',
  Hit_Knockback: '吹き飛ばされる',
  Idle_FoldArms_Loop: '腕を組んで待つ',
  Idle_Lantern_Loop: 'ランタンを持って待つ',
  Idle_No_Loop: 'いやいやする',
  Idle_Rail_Call: '手すりで呼びかける',
  Idle_Rail_Loop: '手すりにつかまって待つ',
  Idle_Shield_Break: '盾が割れる',
  Idle_Shield_Loop: '盾を構えて待つ',
  Idle_TalkingPhone_Loop: '電話で話す',
  LayToIdle: '横になってから立つ',
  Melee_Hook: 'フックを打つ',
  Melee_Hook_Rec: 'フックの構え直し',
  NinjaJump_Idle_Loop: '忍者跳びで待つ',
  NinjaJump_Land: '忍者跳びで着地する',
  NinjaJump_Start: '忍者跳びで跳ぶ',
  OverhandThrow: '投げる',
  Shield_Dash: '盾で突進する',
  Shield_OneShot: '盾で一撃する',
  Slide_Exit: 'スライディングから戻る',
  Slide_Loop: 'スライディングする',
  Slide_Start: 'スライディングを始める',
  Sword_Block: '剣で防ぐ',
  Sword_Dash: '剣で突進する',
  Sword_Heavy_Combo: '剣の強い連続攻撃',
  Sword_Regular_A: '剣で斬る1',
  Sword_Regular_A_Rec: '斬った後の構え直し1',
  Sword_Regular_B: '剣で斬る2',
  Sword_Regular_B_Rec: '斬った後の構え直し2',
  Sword_Regular_C: '剣で斬る3',
  Sword_Regular_Combo: '剣の連続攻撃',
  TreeChopping_Loop: '木を切る',
  Walk_Carry_Loop: '荷物を持って歩く',
  Yes: 'うなずく',
  Zombie_Idle_Loop: 'ゾンビで待つ',
  Zombie_Scratch: 'ゾンビが引っかく',
  Zombie_Walk_Fwd_Loop: 'ゾンビ歩き',
};

// 付け替えたクリップ名(q1/… q2/…)ごとの日本語名。84個すべてを含む。
export const QUATERNIUS_LABELS = {
  ...Object.fromEntries(Object.entries(Q1_LABELS).map(([name, label]) => [`q1/${name}`, label])),
  ...Object.fromEntries(Object.entries(Q2_LABELS).map(([name, label]) => [`q2/${name}`, label])),
};

// リグニウムで実際に使っている動き(リグニウム data/game_data.gd の MOTIONS)。一覧の最初に、役目の名前で出す。
export const RIGNIUM_MOTIONS = [
  { name: 'q2/Sword_Regular_A', label: '近接で振る' },
  { name: 'q1/Sword_Idle', label: '近接を持って構える' },
  { name: 'q1/Pistol_Idle_Loop', label: '銃を持って構える' },
  { name: 'q1/Punch_Jab', label: '素手で殴る' },
  { name: 'q2/Sword_Block', label: '防御' },
  { name: 'q1/Pistol_Aim_Neutral', label: '銃を構える' },
  { name: 'q1/Pistol_Shoot', label: '撃つ' },
  { name: 'q2/OverhandThrow', label: '投げる' },
  { name: 'q1/Roll', label: '転がる' },
  { name: 'q1/Hit_Chest', label: '被弾' },
  { name: 'q1/Death01', label: '死ぬ' },
  { name: 'q1/Punch_Cross', label: '敵の近接' },
  { name: 'q1/Spell_Simple_Shoot', label: '敵の遠距離' },
];

const rigniumNames = new Set(RIGNIUM_MOTIONS.map(motion => motion.name));

// リグニウムで使っている動き以外を、素材ごとに「Quaternius の動き1」「Quaternius の動き2」へ分ける。
export const QUATERNIUS_GROUPS = [
  { key: 'q1', label: 'Quaternius の動き1' },
  { key: 'q2', label: 'Quaternius の動き2' },
].map(group => ({
  ...group,
  motions: Object.keys(QUATERNIUS_LABELS)
    .filter(name => name.startsWith(`${group.key}/`) && !rigniumNames.has(name))
    .map(name => ({ name, label: QUATERNIUS_LABELS[name] })),
}));
