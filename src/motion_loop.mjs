import { MOTION_SCRIPTS } from './motion_scripts_data.mjs';

export const LOOP_MOTIONS = Object.freeze(['Idle', 'Walk', 'Run', 'Aim', 'CustomWalk', 'CustomRun',
  ...MOTION_SCRIPTS.filter(script => script.loop).map(script => `s/${script.name}`)]);

export function isLoopMotion(name) {
  return typeof name === 'string' && (LOOP_MOTIONS.includes(name) || name.startsWith('Custom'));
}

export function advanceMotionTime(time, delta, duration, loop) {
  if (!(duration > 0) || !Number.isFinite(duration)) return { time: 0, finished: true };
  const next = time + delta;
  if (loop) {
    return { time: ((next % duration) + duration) % duration, finished: false };
  }
  return { time: Math.min(duration, Math.max(0, next)), finished: next >= duration };
}
