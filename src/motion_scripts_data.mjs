export const MOTION_SCRIPTS = [
  {
    name: 'Kick', label: '前に蹴る', group: 'fight', duration: 0.8, loop: false, ease: 'ease',
    poses: {
      stand: {},
      chamber: {
        Spine: [-5, 0, 0], RightUpperLeg: [-70, 0, 0], RightLowerLeg: [100, 0, 0],
        LeftUpperLeg: [-5, 0, 0], LeftLowerLeg: [10, 0, 0],
        LeftUpperArm: [-30, 0, 10], LeftLowerArm: [-90, 0, 0],
        RightUpperArm: [20, 0, -15], RightLowerArm: [-60, 0, 0],
      },
      extend: {
        Spine: [-12, 0, 0], RightUpperLeg: [-85, 0, 0], RightLowerLeg: [5, 0, 0],
        RightFoot: [-10, 0, 0], LeftUpperLeg: [-5, 0, 0], LeftLowerLeg: [10, 0, 0],
        LeftUpperArm: [-30, 0, 10], LeftLowerArm: [-90, 0, 0],
        RightUpperArm: [30, 0, -20], RightLowerArm: [-40, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.2, pose: 'chamber' }, { t: 0.35, pose: 'extend' },
      { t: 0.5, pose: 'chamber' }, { t: 0.8, pose: 'stand' },
    ],
  },
  {
    name: 'Wave', label: '手を振る', group: 'emote', duration: 1.6, loop: false, ease: 'ease',
    poses: {
      stand: {},
      upOut: { RightUpperArm: [0, 0, -125], RightLowerArm: [0, 0, -15], Head: [0, 0, -4] },
      upIn: { RightUpperArm: [0, 0, -125], RightLowerArm: [0, 0, -65], Head: [0, 0, -4] },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.3, pose: 'upOut' }, { t: 0.5, pose: 'upIn' },
      { t: 0.7, pose: 'upOut' }, { t: 0.9, pose: 'upIn' }, { t: 1.1, pose: 'upOut' },
      { t: 1.3, pose: 'upIn' }, { t: 1.6, pose: 'stand' },
    ],
  },
  {
    name: 'Bow', label: 'お辞儀', group: 'emote', duration: 1.6, loop: false, ease: 'ease',
    poses: {
      stand: {},
      bow: {
        Hips: [30, 0, 0], LeftUpperLeg: [-30, 0, 0], RightUpperLeg: [-30, 0, 0],
        Spine: [12, 0, 0], Chest: [6, 0, 0], Neck: [10, 0, 0],
        LeftUpperArm: [-25, 0, 0], RightUpperArm: [-25, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.5, pose: 'bow', hips: [0, 0, -0.05] },
      { t: 1.0, pose: 'bow', hips: [0, 0, -0.05] }, { t: 1.6, pose: 'stand' },
    ],
  },
  {
    name: 'WalkBack', label: '後ろへ歩く', group: 'move', duration: 1.0, loop: true, ease: 'linear',
    poses: {
      contact: {
        Spine: [-2, 0, 0], LeftUpperLeg: [-18, 0, 0], LeftLowerLeg: [5, 0, 0],
        LeftFoot: [-8, 0, 0], RightUpperLeg: [15, 0, 0], RightLowerLeg: [8, 0, 0],
        RightFoot: [-6, 0, 0], LeftUpperArm: [12, 0, 4], LeftLowerArm: [-12, 0, 0],
        RightUpperArm: [-12, 0, -4], RightLowerArm: [-15, 0, 0],
      },
      passing: {
        Spine: [-2, 0, 0], LeftUpperLeg: [0, 0, 0], LeftLowerLeg: [5, 0, 0],
        RightUpperLeg: [-12, 0, 0], RightLowerLeg: [45, 0, 0], RightFoot: [-15, 0, 0],
        LeftUpperArm: [0, 0, 4], LeftLowerArm: [-12, 0, 0],
        RightUpperArm: [0, 0, -4], RightLowerArm: [-15, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'contact' },
      { t: 0.25, pose: 'passing', mirror: true, hips: [0, 0.02, 0] },
      { t: 0.5, pose: 'contact', mirror: true },
      { t: 0.75, pose: 'passing', hips: [0, 0.02, 0] },
      { t: 1.0, pose: 'contact' },
    ],
  },
  {
    name: 'DodgeLeft', label: '左へよける', group: 'fight', duration: 0.6, loop: false, ease: 'ease',
    poses: {
      stand: {},
      dodge: {
        Spine: [10, 0, -10], Chest: [0, 0, -6], Head: [-5, 0, 6],
        LeftUpperLeg: [-30, 0, 16], LeftLowerLeg: [45, 0, 0],
        RightUpperLeg: [-8, 0, -14], RightLowerLeg: [22, 0, 0],
        LeftUpperArm: [-20, 0, 25], LeftLowerArm: [-70, 0, 0],
        RightUpperArm: [-20, 0, -20], RightLowerArm: [-80, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.2, pose: 'dodge', hips: [0.20, -0.10, 0] },
      { t: 0.35, pose: 'dodge', hips: [0.20, -0.10, 0] }, { t: 0.6, pose: 'stand' },
    ],
  },
  {
    name: 'DodgeRight', label: '右へよける', group: 'fight', duration: 0.6, loop: false, ease: 'ease',
    poses: {
      stand: {},
      dodge: {
        Spine: [10, 0, -10], Chest: [0, 0, -6], Head: [-5, 0, 6],
        LeftUpperLeg: [-30, 0, 16], LeftLowerLeg: [45, 0, 0],
        RightUpperLeg: [-8, 0, -14], RightLowerLeg: [22, 0, 0],
        LeftUpperArm: [-20, 0, 25], LeftLowerArm: [-70, 0, 0],
        RightUpperArm: [-20, 0, -20], RightLowerArm: [-80, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand', mirror: true },
      { t: 0.2, pose: 'dodge', hips: [0.20, -0.10, 0], mirror: true },
      { t: 0.35, pose: 'dodge', hips: [0.20, -0.10, 0], mirror: true },
      { t: 0.6, pose: 'stand', mirror: true },
    ],
  },
  {
    name: 'BackStep', label: '後ろへ跳ぶ', group: 'fight', duration: 0.6, loop: false, ease: 'ease',
    poses: {
      stand: {},
      crouch: {
        Spine: [14, 0, 0], LeftUpperLeg: [-40, 0, 0], RightUpperLeg: [-40, 0, 0],
        LeftLowerLeg: [75, 0, 0], RightLowerLeg: [75, 0, 0],
        LeftFoot: [-30, 0, 0], RightFoot: [-30, 0, 0],
        LeftUpperArm: [15, 0, 8], RightUpperArm: [15, 0, -8],
        LeftLowerArm: [-40, 0, 0], RightLowerArm: [-40, 0, 0],
      },
      air: {
        Spine: [-6, 0, 0], LeftUpperLeg: [-25, 0, 0], RightUpperLeg: [-10, 0, 0],
        LeftLowerLeg: [40, 0, 0], RightLowerLeg: [30, 0, 0],
        LeftUpperArm: [-35, 0, 15], RightUpperArm: [-35, 0, -15],
        LeftLowerArm: [-50, 0, 0], RightLowerArm: [-50, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.12, pose: 'crouch', hips: [0, -0.12, 0] },
      { t: 0.3, pose: 'air', hips: [0, 0.10, 0] },
      { t: 0.45, pose: 'crouch', hips: [0, -0.12, 0] }, { t: 0.6, pose: 'stand' },
    ],
  },
  {
    name: 'Stagger', label: 'ふらつく', group: 'fight', duration: 1.2, loop: false, ease: 'ease',
    poses: {
      stand: {},
      back: {
        Spine: [-12, 0, -6], Neck: [-10, 0, 0],
        LeftUpperArm: [-20, 0, 30], RightUpperArm: [10, 0, -35],
        LeftLowerArm: [-30, 0, 0], RightLowerArm: [-30, 0, 0],
        RightUpperLeg: [15, 0, -5], RightLowerLeg: [20, 0, 0],
        LeftUpperLeg: [-10, 0, 0], LeftLowerLeg: [15, 0, 0],
      },
      fwd: {
        Spine: [15, 0, 5], Neck: [12, 0, 0],
        LeftUpperArm: [15, 0, 15], RightUpperArm: [-25, 0, -20],
        LeftLowerArm: [-30, 0, 0], RightLowerArm: [-30, 0, 0],
        LeftUpperLeg: [-20, 0, 5], LeftLowerLeg: [30, 0, 0],
        RightUpperLeg: [5, 0, 0], RightLowerLeg: [15, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.25, pose: 'back' }, { t: 0.6, pose: 'fwd' },
      { t: 0.9, pose: 'back' }, { t: 1.2, pose: 'stand' },
    ],
  },
  {
    name: 'Guard', label: '素手で守る', group: 'fight', duration: 1.0, loop: true, ease: 'ease',
    poses: {
      guard: {
        Spine: [8, 0, 0], Neck: [-5, 0, 0],
        LeftUpperArm: [-55, 0, 5], RightUpperArm: [-55, 0, -5],
        LeftLowerArm: [-115, 0, 0], RightLowerArm: [-115, 0, 0],
        LeftUpperLeg: [-15, 0, 6], LeftLowerLeg: [25, 0, 0],
        RightUpperLeg: [5, 0, -6], RightLowerLeg: [20, 0, 0],
      },
      guard2: {
        Spine: [11, 0, 0], Neck: [-5, 0, 0],
        LeftUpperArm: [-55, 0, 5], RightUpperArm: [-55, 0, -5],
        LeftLowerArm: [-115, 0, 0], RightLowerArm: [-115, 0, 0],
        LeftUpperLeg: [-15, 0, 6], LeftLowerLeg: [25, 0, 0],
        RightUpperLeg: [5, 0, -6], RightLowerLeg: [20, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'guard', hips: [0, -0.04, 0] },
      { t: 0.5, pose: 'guard2', hips: [0, -0.055, 0] },
      { t: 1.0, pose: 'guard', hips: [0, -0.04, 0] },
    ],
  },
  {
    name: 'StrafeLeft', label: '左へ横歩き', group: 'move', duration: 0.8, loop: true, ease: 'linear',
    poses: {
      open: {
        LeftUpperLeg: [0, 0, 18], RightUpperLeg: [0, 0, -8],
        LeftLowerLeg: [5, 0, 0], RightLowerLeg: [5, 0, 0],
        LeftUpperArm: [0, 0, 8], RightUpperArm: [0, 0, -8],
        LeftLowerArm: [-20, 0, 0], RightLowerArm: [-20, 0, 0],
      },
      pull: {
        LeftUpperLeg: [0, 0, 4], RightUpperLeg: [-15, 0, 0],
        RightLowerLeg: [35, 0, 0], LeftLowerLeg: [5, 0, 0],
        LeftUpperArm: [0, 0, 8], RightUpperArm: [0, 0, -8],
        LeftLowerArm: [-20, 0, 0], RightLowerArm: [-20, 0, 0],
      },
      together: {
        LeftLowerLeg: [5, 0, 0], RightLowerLeg: [5, 0, 0],
        LeftUpperArm: [0, 0, 8], RightUpperArm: [0, 0, -8],
        LeftLowerArm: [-20, 0, 0], RightLowerArm: [-20, 0, 0],
      },
      lift: {
        LeftUpperLeg: [-15, 0, 8], LeftLowerLeg: [35, 0, 0], RightLowerLeg: [5, 0, 0],
        LeftUpperArm: [0, 0, 8], RightUpperArm: [0, 0, -8],
        LeftLowerArm: [-20, 0, 0], RightLowerArm: [-20, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'open' }, { t: 0.2, pose: 'pull', hips: [0, 0.015, 0] },
      { t: 0.4, pose: 'together' }, { t: 0.6, pose: 'lift', hips: [0, 0.015, 0] },
      { t: 0.8, pose: 'open' },
    ],
  },
  {
    name: 'StrafeRight', label: '右へ横歩き', group: 'move', duration: 0.8, loop: true, ease: 'linear',
    poses: {
      open: {
        LeftUpperLeg: [0, 0, 18], RightUpperLeg: [0, 0, -8],
        LeftLowerLeg: [5, 0, 0], RightLowerLeg: [5, 0, 0],
        LeftUpperArm: [0, 0, 8], RightUpperArm: [0, 0, -8],
        LeftLowerArm: [-20, 0, 0], RightLowerArm: [-20, 0, 0],
      },
      pull: {
        LeftUpperLeg: [0, 0, 4], RightUpperLeg: [-15, 0, 0],
        RightLowerLeg: [35, 0, 0], LeftLowerLeg: [5, 0, 0],
        LeftUpperArm: [0, 0, 8], RightUpperArm: [0, 0, -8],
        LeftLowerArm: [-20, 0, 0], RightLowerArm: [-20, 0, 0],
      },
      together: {
        LeftLowerLeg: [5, 0, 0], RightLowerLeg: [5, 0, 0],
        LeftUpperArm: [0, 0, 8], RightUpperArm: [0, 0, -8],
        LeftLowerArm: [-20, 0, 0], RightLowerArm: [-20, 0, 0],
      },
      lift: {
        LeftUpperLeg: [-15, 0, 8], LeftLowerLeg: [35, 0, 0], RightLowerLeg: [5, 0, 0],
        LeftUpperArm: [0, 0, 8], RightUpperArm: [0, 0, -8],
        LeftLowerArm: [-20, 0, 0], RightLowerArm: [-20, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'open', mirror: true },
      { t: 0.2, pose: 'pull', hips: [0, 0.015, 0], mirror: true },
      { t: 0.4, pose: 'together', mirror: true },
      { t: 0.6, pose: 'lift', hips: [0, 0.015, 0], mirror: true },
      { t: 0.8, pose: 'open', mirror: true },
    ],
  },
  {
    name: 'Cheer', label: 'ばんざい', group: 'emote', duration: 1.2, loop: false, ease: 'ease',
    poses: {
      stand: {},
      crouch: {
        Spine: [8, 0, 0], LeftUpperLeg: [-25, 0, 0], RightUpperLeg: [-25, 0, 0],
        LeftLowerLeg: [45, 0, 0], RightLowerLeg: [45, 0, 0],
        LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0],
        LeftUpperArm: [20, 0, 5], RightUpperArm: [20, 0, -5],
      },
      up: {
        Spine: [-6, 0, 0], Neck: [-10, 0, 0],
        LeftUpperArm: [0, 0, 160], RightUpperArm: [0, 0, -160],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.2, pose: 'crouch', hips: [0, -0.07, 0] },
      { t: 0.45, pose: 'up', hips: [0, 0.10, 0] }, { t: 0.65, pose: 'up' },
      { t: 0.9, pose: 'up' }, { t: 1.2, pose: 'stand' },
    ],
  },
  {
    name: 'Clap', label: '拍手', group: 'emote', duration: 1.2, loop: true, ease: 'ease',
    poses: {
      apart: {
        LeftUpperArm: [-45, -15, 8], RightUpperArm: [-45, 15, -8],
        LeftLowerArm: [-80, 0, 0], RightLowerArm: [-80, 0, 0],
      },
      together: {
        LeftUpperArm: [-45, -40, 0], RightUpperArm: [-45, 40, 0],
        LeftLowerArm: [-85, 0, 0], RightLowerArm: [-85, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'apart' }, { t: 0.15, pose: 'together' }, { t: 0.3, pose: 'apart' },
      { t: 0.45, pose: 'together' }, { t: 0.6, pose: 'apart' }, { t: 0.75, pose: 'together' },
      { t: 0.9, pose: 'apart' }, { t: 1.05, pose: 'together' }, { t: 1.2, pose: 'apart' },
    ],
  },
  {
    name: 'Disappointed', label: 'がっかりする', group: 'emote', duration: 1.6, loop: false, ease: 'ease',
    poses: {
      stand: {},
      slump: {
        Spine: [18, 0, 0], Chest: [10, 0, 0], Neck: [25, 0, 0], Head: [10, 0, 0],
        LeftUpperArm: [-10, 0, 0], RightUpperArm: [-10, 0, 0],
        LeftUpperLeg: [-8, 0, 0], RightUpperLeg: [-8, 0, 0],
        LeftLowerLeg: [15, 0, 0], RightLowerLeg: [15, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.5, pose: 'slump', hips: [0, -0.03, 0] },
      { t: 1.1, pose: 'slump', hips: [0, -0.03, 0] }, { t: 1.6, pose: 'stand' },
    ],
  },
  {
    name: 'Point', label: '前を指さす', group: 'emote', duration: 1.2, loop: false, ease: 'ease',
    poses: {
      stand: {},
      point: { RightUpperArm: [-85, 0, 0], RightLowerArm: [-5, 0, 0], Spine: [0, 6, 0] },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.3, pose: 'point' },
      { t: 0.9, pose: 'point' }, { t: 1.2, pose: 'stand' },
    ],
  },
  {
    name: 'LookAround', label: '見回す', group: 'emote', duration: 2.4, loop: false, ease: 'ease',
    poses: {
      stand: {},
      left: { Spine: [0, 10, 0], Neck: [0, 30, 0], Head: [0, 25, 0] },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.5, pose: 'left' }, { t: 0.9, pose: 'left' },
      { t: 1.5, pose: 'left', mirror: true }, { t: 1.9, pose: 'left', mirror: true },
      { t: 2.4, pose: 'stand' },
    ],
  },
  {
    name: 'RoundKick', label: '回し蹴り', group: 'fight', duration: 0.9, loop: false, ease: 'ease',
    poses: {
      stand: {},
      wind: {
        Spine: [0, -20, 0], LeftUpperLeg: [-5, 0, 0], LeftLowerLeg: [10, 0, 0],
        RightUpperLeg: [-40, 0, -40], RightLowerLeg: [100, 0, 0],
        LeftUpperArm: [-40, 0, 15], LeftLowerArm: [-90, 0, 0],
        RightUpperArm: [10, 0, -30], RightLowerArm: [-60, 0, 0],
      },
      hit: {
        Hips: [0, 35, 0], Spine: [-5, 0, 8], LeftLowerLeg: [10, 0, 0],
        RightUpperLeg: [-75, 0, -25], RightLowerLeg: [5, 0, 0],
        LeftUpperArm: [-40, 0, 15], LeftLowerArm: [-90, 0, 0],
        RightUpperArm: [20, 0, -40], RightLowerArm: [-30, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.25, pose: 'wind' }, { t: 0.4, pose: 'hit' },
      { t: 0.55, pose: 'wind' }, { t: 0.9, pose: 'stand' },
    ],
  },
  {
    name: 'Uppercut', label: 'アッパー', group: 'fight', duration: 0.7, loop: false, ease: 'ease',
    poses: {
      stand: {},
      load: {
        Spine: [12, -15, 0], RightUpperArm: [15, 0, -10], RightLowerArm: [-100, 0, 0],
        LeftUpperArm: [-45, 0, 8], LeftLowerArm: [-110, 0, 0],
        LeftUpperLeg: [-20, 0, 0], RightUpperLeg: [-20, 0, 0],
        LeftLowerLeg: [40, 0, 0], RightLowerLeg: [40, 0, 0],
        LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0],
      },
      hit: {
        Spine: [-8, 20, 0], RightUpperArm: [-110, 0, -5], RightLowerArm: [-95, 0, 0],
        LeftUpperArm: [-30, 0, 8], LeftLowerArm: [-110, 0, 0],
        LeftLowerLeg: [5, 0, 0], RightLowerLeg: [5, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.2, pose: 'load', hips: [0, -0.07, 0] },
      { t: 0.33, pose: 'hit', hips: [0, 0.02, 0] },
      { t: 0.45, pose: 'hit', hips: [0, 0.02, 0] }, { t: 0.7, pose: 'stand' },
    ],
  },
  {
    name: 'Stomp', label: '踏みつける', group: 'fight', duration: 0.8, loop: false, ease: 'ease',
    poses: {
      stand: {},
      lift: {
        Spine: [-4, 0, 0], RightUpperLeg: [-75, 0, 0], RightLowerLeg: [95, 0, 0],
        LeftUpperArm: [-20, 0, 20], RightUpperArm: [-20, 0, -20],
        LeftLowerArm: [-40, 0, 0], RightLowerArm: [-40, 0, 0],
      },
      down: {
        Spine: [14, 0, 0], RightUpperLeg: [-20, 0, 0], RightLowerLeg: [25, 0, 0],
        LeftUpperLeg: [-12, 0, 0], LeftLowerLeg: [25, 0, 0],
        LeftUpperArm: [15, 0, 12], RightUpperArm: [15, 0, -12],
        LeftLowerArm: [-30, 0, 0], RightLowerArm: [-30, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.25, pose: 'lift' },
      { t: 0.38, pose: 'down', hips: [0, -0.04, 0] },
      { t: 0.5, pose: 'down', hips: [0, -0.04, 0] }, { t: 0.8, pose: 'stand' },
    ],
  },
  {
    name: 'Duck', label: 'しゃがんでよける', group: 'fight', duration: 0.7, loop: false, ease: 'ease',
    poses: {
      stand: {},
      duck: {
        Spine: [25, 0, 0], Neck: [-15, 0, 0],
        LeftUpperLeg: [-70, 0, 0], RightUpperLeg: [-70, 0, 0],
        LeftLowerLeg: [120, 0, 0], RightLowerLeg: [120, 0, 0],
        LeftFoot: [-45, 0, 0], RightFoot: [-45, 0, 0],
        LeftUpperArm: [-50, 0, 10], RightUpperArm: [-50, 0, -10],
        LeftLowerArm: [-110, 0, 0], RightLowerArm: [-110, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.18, pose: 'duck', hips: [0, -0.40, 0] },
      { t: 0.45, pose: 'duck', hips: [0, -0.40, 0] }, { t: 0.7, pose: 'stand' },
    ],
  },
  {
    name: 'Taunt', label: 'かかってこい', group: 'fight', duration: 1.4, loop: false, ease: 'ease',
    poses: {
      stand: {},
      ready: {
        Spine: [0, -8, 0], Head: [-5, 0, 0], RightUpperArm: [-80, 0, -5],
        RightLowerArm: [-30, 0, 0], LeftUpperArm: [0, 0, 10],
      },
      curl: {
        Spine: [0, -8, 0], Head: [-5, 0, 0], RightUpperArm: [-80, 0, -5],
        RightLowerArm: [-110, 0, 0], LeftUpperArm: [0, 0, 10],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.3, pose: 'ready' }, { t: 0.5, pose: 'curl' },
      { t: 0.7, pose: 'ready' }, { t: 0.9, pose: 'curl' },
      { t: 1.1, pose: 'ready' }, { t: 1.4, pose: 'stand' },
    ],
  },
  {
    name: 'Ladder', label: 'はしごを登る', group: 'move', duration: 1.0, loop: true, ease: 'ease',
    poses: {
      a: {
        Neck: [-10, 0, 0], LeftUpperArm: [-150, 0, 5], LeftLowerArm: [-30, 0, 0],
        RightUpperArm: [-100, 0, -5], RightLowerArm: [-80, 0, 0],
        LeftUpperLeg: [-20, 0, 0], LeftLowerLeg: [30, 0, 0],
        RightUpperLeg: [-70, 0, 0], RightLowerLeg: [90, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'a' }, { t: 0.5, pose: 'a', mirror: true }, { t: 1.0, pose: 'a' },
    ],
  },
  {
    name: 'Sneak', label: '忍び足', group: 'move', duration: 1.4, loop: true, ease: 'ease',
    poses: {
      contact: {
        Spine: [18, 0, 0], Neck: [-12, 0, 0], LeftUpperLeg: [-50, 0, 0],
        LeftLowerLeg: [45, 0, 0], LeftFoot: [10, 0, 0], RightUpperLeg: [-5, 0, 0],
        RightLowerLeg: [45, 0, 0], RightFoot: [-25, 0, 0],
        LeftUpperArm: [-30, 0, 10], LeftLowerArm: [-100, 0, 0],
        RightUpperArm: [-45, 0, -10], RightLowerArm: [-100, 0, 0],
      },
      passing: {
        Spine: [18, 0, 0], Neck: [-12, 0, 0], LeftUpperLeg: [-25, 0, 0],
        LeftLowerLeg: [40, 0, 0], RightUpperLeg: [-60, 0, 0],
        RightLowerLeg: [100, 0, 0], RightFoot: [-20, 0, 0],
        LeftUpperArm: [-38, 0, 10], RightUpperArm: [-38, 0, -10],
        LeftLowerArm: [-100, 0, 0], RightLowerArm: [-100, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'contact', hips: [0, -0.10, 0] },
      { t: 0.35, pose: 'passing', hips: [0, -0.10, 0] },
      { t: 0.7, pose: 'contact', mirror: true, hips: [0, -0.10, 0] },
      { t: 1.05, pose: 'passing', mirror: true, hips: [0, -0.10, 0] },
      { t: 1.4, pose: 'contact', hips: [0, -0.10, 0] },
    ],
  },
  {
    name: 'Hop', label: 'その場で跳ねる', group: 'move', duration: 0.6, loop: true, ease: 'ease',
    poses: {
      down: {
        Spine: [5, 0, 0], LeftUpperLeg: [-20, 0, 0], RightUpperLeg: [-20, 0, 0],
        LeftLowerLeg: [40, 0, 0], RightLowerLeg: [40, 0, 0],
        LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0],
        LeftUpperArm: [10, 0, 6], RightUpperArm: [10, 0, -6],
        LeftLowerArm: [-30, 0, 0], RightLowerArm: [-30, 0, 0],
      },
      up: {
        LeftFoot: [25, 0, 0], RightFoot: [25, 0, 0],
        LeftUpperArm: [-15, 0, 15], RightUpperArm: [-15, 0, -15],
        LeftLowerArm: [-40, 0, 0], RightLowerArm: [-40, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'down', hips: [0, -0.06, 0] },
      { t: 0.3, pose: 'up', hips: [0, 0.10, 0] },
      { t: 0.6, pose: 'down', hips: [0, -0.06, 0] },
    ],
  },
  {
    name: 'TiltHead', label: '首をかしげる', group: 'emote', duration: 1.4, loop: false, ease: 'ease',
    poses: {
      stand: {},
      tilt: { Spine: [0, 0, 3], Neck: [0, 0, 10], Head: [5, 0, 14] },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.35, pose: 'tilt' },
      { t: 1.0, pose: 'tilt' }, { t: 1.4, pose: 'stand' },
    ],
  },
  {
    name: 'Shrug', label: '肩をすくめる', group: 'emote', duration: 1.2, loop: false, ease: 'ease',
    poses: {
      stand: {},
      shrug: {
        LeftShoulder: [0, 0, 15], RightShoulder: [0, 0, -15],
        LeftUpperArm: [-15, 0, 20], RightUpperArm: [-15, 0, -20],
        LeftLowerArm: [-70, 0, 0], RightLowerArm: [-70, 0, 0],
        Neck: [5, 0, 0], Head: [0, 0, 6],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.3, pose: 'shrug' },
      { t: 0.8, pose: 'shrug' }, { t: 1.2, pose: 'stand' },
    ],
  },
  {
    name: 'Think', label: '考える', group: 'emote', duration: 2.0, loop: false, ease: 'ease',
    poses: {
      stand: {},
      think: {
        Spine: [4, 0, 0], Head: [10, 0, -6], RightUpperArm: [-55, 25, -5],
        RightLowerArm: [-135, 0, 0], LeftUpperArm: [-25, -35, 0], LeftLowerArm: [-85, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.5, pose: 'think' },
      { t: 1.5, pose: 'think' }, { t: 2.0, pose: 'stand' },
    ],
  },
  {
    name: 'Salute', label: '敬礼', group: 'emote', duration: 1.4, loop: false, ease: 'ease',
    poses: {
      stand: {},
      salute: { Spine: [-3, 0, 0], RightUpperArm: [-15, 0, -80], RightLowerArm: [0, 0, -125] },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.3, pose: 'salute' },
      { t: 1.0, pose: 'salute' }, { t: 1.4, pose: 'stand' },
    ],
  },
  {
    name: 'Laugh', label: '笑う', group: 'emote', duration: 1.2, loop: true, ease: 'ease',
    poses: {
      a: {
        Spine: [-10, 0, 0], Neck: [-12, 0, 0],
        LeftUpperArm: [-25, -30, 5], RightUpperArm: [-25, 30, -5],
        LeftLowerArm: [-95, 0, 0], RightLowerArm: [-95, 0, 0],
      },
      b: {
        Spine: [6, 0, 0], Neck: [-4, 0, 0],
        LeftUpperArm: [-25, -30, 5], RightUpperArm: [-25, 30, -5],
        LeftLowerArm: [-95, 0, 0], RightLowerArm: [-95, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'a' }, { t: 0.15, pose: 'b', hips: [0, -0.015, 0] },
      { t: 0.3, pose: 'a' }, { t: 0.45, pose: 'b', hips: [0, -0.015, 0] },
      { t: 0.6, pose: 'a' }, { t: 0.75, pose: 'b', hips: [0, -0.015, 0] },
      { t: 0.9, pose: 'a' }, { t: 1.05, pose: 'b', hips: [0, -0.015, 0] }, { t: 1.2, pose: 'a' },
    ],
  },
  {
    name: 'Surprised', label: 'おどろく', group: 'emote', duration: 1.0, loop: false, ease: 'ease',
    poses: {
      stand: {},
      jump: {
        Spine: [-12, 0, 0], Neck: [-8, 0, 0],
        LeftUpperArm: [-30, 0, 55], RightUpperArm: [-30, 0, -55],
        LeftLowerArm: [-80, 0, 0], RightLowerArm: [-80, 0, 0],
        LeftUpperLeg: [0, 0, 8], RightUpperLeg: [0, 0, -8],
        LeftLowerLeg: [10, 0, 0], RightLowerLeg: [10, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.12, pose: 'jump', hips: [0, 0.04, 0] },
      { t: 0.5, pose: 'jump' }, { t: 1.0, pose: 'stand' },
    ],
  },
  {
    name: 'Sleep', label: '立ったまま居眠り', group: 'emote', duration: 2.4, loop: true, ease: 'ease',
    poses: {
      doze: { Spine: [10, 0, 0], Neck: [30, 0, 0], Head: [15, 0, 8] },
      doze2: { Spine: [13, 0, 0], Neck: [35, 0, 0], Head: [15, 0, 8] },
    },
    keys: [
      { t: 0, pose: 'doze' }, { t: 1.2, pose: 'doze2' }, { t: 2.4, pose: 'doze' },
    ],
  },
  {
    name: 'Headbutt', label: '頭突き', group: 'fight', duration: 0.7, loop: false, ease: 'ease',
    poses: {
      stand: {},
      windup: {
        Spine: [-15, 0, 0], Chest: [-8, 0, 0], Neck: [-15, 0, 0],
        LeftUpperArm: [20, 0, 10], RightUpperArm: [20, 0, -10],
        LeftLowerArm: [-40, 0, 0], RightLowerArm: [-40, 0, 0],
      },
      hit: {
        Spine: [25, 0, 0], Chest: [12, 0, 0], Neck: [20, 0, 0],
        LeftUpperLeg: [-25, 0, 0], LeftLowerLeg: [30, 0, 0],
        RightUpperLeg: [10, 0, 0], RightLowerLeg: [10, 0, 0],
        LeftUpperArm: [30, 0, 15], RightUpperArm: [30, 0, -15],
        LeftLowerArm: [-30, 0, 0], RightLowerArm: [-30, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.2, pose: 'windup', hips: [0, 0, -0.03] },
      { t: 0.32, pose: 'hit', hips: [0, -0.04, 0.12] }, { t: 0.45, pose: 'hit', hips: [0, -0.04, 0.12] },
      { t: 0.7, pose: 'stand' },
    ],
  },
  {
    name: 'Shove', label: '両手で押す', group: 'fight', duration: 0.8, loop: false, ease: 'ease',
    poses: {
      stand: {},
      ready: {
        Spine: [-5, 0, 0], LeftUpperArm: [-40, 0, 10], RightUpperArm: [-40, 0, -10],
        LeftLowerArm: [-120, 0, 0], RightLowerArm: [-120, 0, 0],
      },
      push: {
        Spine: [15, 0, 0], LeftUpperArm: [-80, 0, 5], RightUpperArm: [-80, 0, -5],
        LeftLowerArm: [-15, 0, 0], RightLowerArm: [-15, 0, 0],
        LeftUpperLeg: [-25, 0, 0], LeftLowerLeg: [30, 0, 0],
        RightUpperLeg: [15, 0, 0], RightLowerLeg: [10, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.25, pose: 'ready' },
      { t: 0.38, pose: 'push', hips: [0, -0.04, 0.10] }, { t: 0.5, pose: 'push', hips: [0, -0.04, 0.10] },
      { t: 0.8, pose: 'stand' },
    ],
  },
  {
    name: 'ElbowStrike', label: 'ひじ打ち', group: 'fight', duration: 0.7, loop: false, ease: 'ease',
    poses: {
      stand: {},
      windup: {
        Spine: [0, -25, 0], RightUpperArm: [-20, 0, -70], RightLowerArm: [-130, 0, 0],
        LeftUpperArm: [-40, 0, 10], LeftLowerArm: [-100, 0, 0],
      },
      hit: {
        Spine: [5, 35, 0], Chest: [0, 15, 0],
        RightUpperArm: [-60, 0, -60], RightLowerArm: [-140, 0, 0],
        LeftUpperArm: [10, 0, 10], LeftLowerArm: [-110, 0, 0],
        LeftUpperLeg: [-15, 0, 0], LeftLowerLeg: [20, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.2, pose: 'windup' },
      { t: 0.32, pose: 'hit', hips: [0, -0.03, 0.05] }, { t: 0.45, pose: 'hit', hips: [0, -0.03, 0.05] },
      { t: 0.7, pose: 'stand' },
    ],
  },
  {
    name: 'LowKick', label: '下段蹴り', group: 'fight', duration: 0.7, loop: false, ease: 'ease',
    poses: {
      stand: {},
      chamber: {
        Spine: [0, -10, 0], RightUpperLeg: [15, 0, -15], RightLowerLeg: [50, 0, 0],
        LeftUpperLeg: [-8, 0, 0], LeftLowerLeg: [15, 0, 0],
        LeftUpperArm: [-35, 0, 10], LeftLowerArm: [-110, 0, 0],
        RightUpperArm: [-25, 0, -10], RightLowerArm: [-100, 0, 0],
      },
      hit: {
        Spine: [-5, 20, 0], RightUpperLeg: [-40, 0, 15], RightLowerLeg: [10, 0, 0],
        LeftUpperLeg: [-8, 0, 0], LeftLowerLeg: [15, 0, 0],
        LeftUpperArm: [-35, 0, 10], LeftLowerArm: [-110, 0, 0],
        RightUpperArm: [25, 0, -25], RightLowerArm: [-50, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.18, pose: 'chamber', hips: [0, -0.02, 0] },
      { t: 0.3, pose: 'hit', hips: [0, -0.02, 0] }, { t: 0.42, pose: 'chamber', hips: [0, -0.02, 0] },
      { t: 0.7, pose: 'stand' },
    ],
  },
  {
    name: 'March', label: '行進(足踏み)', group: 'move', duration: 1.0, loop: true, ease: 'ease',
    poses: {
      mid: { Spine: [-3, 0, 0] },
      up: {
        Spine: [-3, 0, 0], LeftUpperLeg: [-80, 0, 0], LeftLowerLeg: [85, 0, 0],
        RightUpperArm: [-60, 0, 0], RightLowerArm: [-20, 0, 0],
        LeftUpperArm: [35, 0, 0], LeftLowerArm: [-10, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'mid' }, { t: 0.25, pose: 'up' }, { t: 0.5, pose: 'mid' },
      { t: 0.75, pose: 'up', mirror: true }, { t: 1.0, pose: 'mid' },
    ],
  },
  {
    name: 'Balance', label: 'バランスを取って歩く', group: 'move', duration: 1.6, loop: true, ease: 'ease',
    poses: {
      contact: {
        Spine: [0, 0, 6], LeftUpperArm: [0, 0, 80], RightUpperArm: [0, 0, -95],
        LeftUpperLeg: [-25, 0, -4], LeftLowerLeg: [20, 0, 0],
        RightUpperLeg: [12, 0, 4], RightLowerLeg: [15, 0, 0], RightFoot: [-10, 0, 0],
      },
      passing: {
        Spine: [0, 0, -4], LeftUpperArm: [0, 0, 92], RightUpperArm: [0, 0, -80],
        LeftUpperLeg: [-5, 0, 0], LeftLowerLeg: [8, 0, 0],
        RightUpperLeg: [-35, 0, 0], RightLowerLeg: [60, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'contact', hips: [0, -0.02, 0] },
      { t: 0.4, pose: 'passing', hips: [0, -0.02, 0] },
      { t: 0.8, pose: 'contact', mirror: true, hips: [0, -0.02, 0] },
      { t: 1.2, pose: 'passing', mirror: true, hips: [0, -0.02, 0] },
      { t: 1.6, pose: 'contact', hips: [0, -0.02, 0] },
    ],
  },
  {
    name: 'Squat', label: 'スクワット', group: 'move', duration: 1.6, loop: true, ease: 'ease',
    poses: {
      up: {},
      down: {
        Spine: [25, 0, 0], Neck: [-15, 0, 0],
        LeftUpperLeg: [-70, 0, 8], RightUpperLeg: [-70, 0, -8],
        LeftLowerLeg: [100, 0, 0], RightLowerLeg: [100, 0, 0],
        LeftFoot: [-30, 0, 0], RightFoot: [-30, 0, 0],
        LeftUpperArm: [-80, 0, 0], RightUpperArm: [-80, 0, 0],
        LeftLowerArm: [-10, 0, 0], RightLowerArm: [-10, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'up' }, { t: 0.7, pose: 'down', hips: [0, -0.33, -0.18] },
      { t: 0.9, pose: 'down', hips: [0, -0.33, -0.18] }, { t: 1.6, pose: 'up' },
    ],
  },
  {
    name: 'Nod', label: 'うなずく', group: 'emote', duration: 1.0, loop: false, ease: 'ease',
    poses: {
      stand: {},
      down: { Neck: [8, 0, 0], Head: [14, 0, 0] },
      up: { Head: [-3, 0, 0] },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.2, pose: 'down' }, { t: 0.4, pose: 'up' },
      { t: 0.6, pose: 'down' }, { t: 0.8, pose: 'up' }, { t: 1.0, pose: 'stand' },
    ],
  },
  {
    name: 'ShakeHead', label: '首を横に振る', group: 'emote', duration: 1.2, loop: false, ease: 'ease',
    poses: {
      stand: {},
      side: { Neck: [0, 15, 0], Head: [0, 20, 0] },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.2, pose: 'side' }, { t: 0.45, pose: 'side', mirror: true },
      { t: 0.7, pose: 'side' }, { t: 0.95, pose: 'side', mirror: true }, { t: 1.2, pose: 'stand' },
    ],
  },
  {
    name: 'Stretch', label: 'のびをする', group: 'emote', duration: 2.4, loop: false, ease: 'ease',
    poses: {
      stand: {},
      up: {
        Spine: [-10, 0, 0], Chest: [-6, 0, 0], Neck: [-10, 0, 0],
        LeftUpperArm: [0, 0, 160], RightUpperArm: [0, 0, -160],
      },
      up2: {
        Spine: [-16, 0, 0], Chest: [-10, 0, 0], Neck: [-14, 0, 0],
        LeftUpperArm: [0, 0, 168], RightUpperArm: [0, 0, -168],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.8, pose: 'up' },
      { t: 1.6, pose: 'up2' }, { t: 2.4, pose: 'stand' },
    ],
  },
  {
    name: 'Angry', label: '怒って足を踏み鳴らす', group: 'emote', duration: 0.8, loop: true, ease: 'ease',
    poses: {
      down: {
        Spine: [8, 0, 0], Neck: [5, 0, 0],
        LeftUpperArm: [-5, 0, 12], RightUpperArm: [-5, 0, -12],
        LeftLowerArm: [-25, 0, 0], RightLowerArm: [-25, 0, 0],
      },
      lift: {
        Spine: [8, 0, 0], Neck: [5, 0, 0],
        LeftUpperArm: [10, 0, 12], RightUpperArm: [10, 0, -12],
        LeftLowerArm: [-25, 0, 0], RightLowerArm: [-25, 0, 0],
        LeftUpperLeg: [-45, 0, 0], LeftLowerLeg: [70, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'down' }, { t: 0.2, pose: 'lift' }, { t: 0.4, pose: 'down' },
      { t: 0.6, pose: 'lift', mirror: true }, { t: 0.8, pose: 'down' },
    ],
  },
  {
    name: 'Cry', label: '泣く', group: 'emote', duration: 1.6, loop: true, ease: 'ease',
    poses: {
      a: {
        Spine: [15, 0, 0], Neck: [15, 0, 0], Head: [10, 0, 0],
        LeftUpperArm: [-50, -25, 5], RightUpperArm: [-50, 25, -5],
        LeftLowerArm: [-140, 0, 0], RightLowerArm: [-140, 0, 0],
      },
      b: {
        Spine: [20, 0, 0], Neck: [18, 0, 0], Head: [10, 0, 0],
        LeftUpperArm: [-50, -25, 5], RightUpperArm: [-50, 25, -5],
        LeftLowerArm: [-140, 0, 0], RightLowerArm: [-140, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'a' }, { t: 0.2, pose: 'b', hips: [0, -0.015, 0] }, { t: 0.4, pose: 'a' },
      { t: 0.6, pose: 'b', hips: [0, -0.015, 0] }, { t: 0.8, pose: 'a' },
      { t: 1.2, pose: 'b', hips: [0, -0.015, 0] }, { t: 1.6, pose: 'a' },
    ],
  },
  {
    name: 'HandsOnHips', label: '腰に手を当てる', group: 'emote', duration: 2.0, loop: false, ease: 'ease',
    poses: {
      stand: {},
      pose: {
        Chest: [-5, 0, 0], Head: [-3, 0, 0],
        LeftUpperArm: [50, -45, 50], RightUpperArm: [50, 45, -50],
        LeftLowerArm: [-80, 0, 0], RightLowerArm: [-80, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.4, pose: 'pose' },
      { t: 1.6, pose: 'pose' }, { t: 2.0, pose: 'stand' },
    ],
  },
  {
    name: 'Beckon', label: '手招き', group: 'emote', duration: 1.6, loop: false, ease: 'ease',
    poses: {
      stand: {},
      out: { RightUpperArm: [-60, 0, -10], RightLowerArm: [-50, 0, 0] },
      pull: { RightUpperArm: [-60, 0, -10], RightLowerArm: [-120, 0, 0] },
    },
    keys: [
      { t: 0, pose: 'stand' }, { t: 0.3, pose: 'out' }, { t: 0.5, pose: 'pull' },
      { t: 0.7, pose: 'out' }, { t: 0.9, pose: 'pull' }, { t: 1.1, pose: 'out' },
      { t: 1.3, pose: 'pull' }, { t: 1.6, pose: 'stand' },
    ],
  },
  {
    name: 'Tired', label: 'ひざに手をついて息切れ', group: 'emote', duration: 1.6, loop: true, ease: 'ease',
    poses: {
      a: {
        Hips: [40, 0, 0], Spine: [15, 0, 0], Neck: [-10, 0, 0],
        LeftUpperLeg: [-55, 0, 0], RightUpperLeg: [-55, 0, 0],
        LeftLowerLeg: [30, 0, 0], RightLowerLeg: [30, 0, 0],
        LeftFoot: [-15, 0, 0], RightFoot: [-15, 0, 0],
        LeftUpperArm: [-35, 0, 8], RightUpperArm: [-35, 0, -8],
        LeftLowerArm: [-10, 0, 0], RightLowerArm: [-10, 0, 0],
      },
      b: {
        Hips: [40, 0, 0], Spine: [9, 0, 0], Chest: [-4, 0, 0], Neck: [-10, 0, 0],
        LeftUpperLeg: [-55, 0, 0], RightUpperLeg: [-55, 0, 0],
        LeftLowerLeg: [30, 0, 0], RightLowerLeg: [30, 0, 0],
        LeftFoot: [-15, 0, 0], RightFoot: [-15, 0, 0],
        LeftUpperArm: [-35, 0, 8], RightUpperArm: [-35, 0, -8],
        LeftLowerArm: [-10, 0, 0], RightLowerArm: [-10, 0, 0],
      },
    },
    keys: [
      { t: 0, pose: 'a', hips: [0, -0.03, -0.08] }, { t: 0.8, pose: 'b', hips: [0, -0.02, -0.08] },
      { t: 1.6, pose: 'a', hips: [0, -0.03, -0.08] },
    ],
  },
];
