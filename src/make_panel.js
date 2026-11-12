import { Vector3 } from 'three';
import { POSE_JOINTS, POSE_AXES, createPoseSession, positionRange, angleRange,
  moveJoint, rotateJoint, upperJoint, mirrorState, jointPosition } from './pose_editor.mjs';
import { defaultCustomMotion, normalizeCustomMotion, addMiddleKey, removeKey,
  moveKey, setKeyState, stateAt } from './custom_motion.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const standing = () => ({ pose: {}, hips: [0, 0, 0] });
const jointLabels = new Map(POSE_JOINTS.map(joint => [joint.name, joint.label]));
const node = (tag, text, className) => {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
};

/** 操作と表示だけを担当し、姿勢・可動範囲・補間は共通の計算部品に任せる。 */
export function createMakePanel({ panel, viewer, camera, getState, getBody, onPose, onChange, preview, guard }) {
  panel.classList.add('make-panel');
  const hasOverlay = !!viewer && !!camera;
  let active = false, selectedName = null, keyIndex = 0, joint = 'Hips';
  let mode = 'position', axis = 'x', chain = 2, pinFeet = true, upper = 0;
  let session = null, paramsKey = '', formMode = null;
  let rangeInput, rangeOutput, rangeLimits, rangeHint, undoButton;
  let gesture = null, pendingValue = null, frame = null;
  let menuOpen = false, settingsOpen = false, viewingTime = null;
  let showJoints = true;
  try { showJoints = localStorage.getItem('moju.mobile.showJoints') !== 'false'; } catch {}
  const histories = new Map();
  const motion = () => getState().custom.find(item => item.name === selectedName);
  const history = () => {
    if (!histories.has(selectedName)) histories.set(selectedName, []);
    return histories.get(selectedName);
  };
  const keyState = () => motion()?.keys[keyIndex];
  const targetJoint = () => mode === 'angle' ? upperJoint(joint, upper) ?? joint : joint;
  const options = () => ({ joint: targetJoint(), axis, chain, pinFeet });
  function ensureSession() {
    const params = getState().params;
    const nextKey = JSON.stringify(params);
    if (!session || paramsKey !== nextKey) {
      session?.dispose();
      session = createPoseSession(params);
      paramsKey = nextKey;
    }
    return session;
  }
  function showPose() {
    if (!active) return;
    viewingTime = null;
    if (!motion()) { onPose(null, null); return; }
    ensureSession().apply(keyState());
    onPose(session.body, motion(), keyState().t, keyState());
  }
  function seek(value) {
    if (!active || !motion()) return;
    if (gesture || pendingValue !== null) finishGesture();
    viewingTime = Math.max(0, Math.min(motion().duration, value));
    const state = stateAt(motion(), viewingTime);
    ensureSession().apply(state);
    onPose(session.body, motion(), viewingTime, state);
  }
  function restoreKey() {
    if (viewingTime !== null) { showPose(); refreshRange(); }
  }
  function notify(catalog = false) { onChange(catalog); }
  function pushUndo(snapshot = { motion: copy(motion()), keyIndex }) {
    const entries = history();
    entries.push(snapshot);
    if (entries.length > 20) entries.shift();
    if (undoButton) undoButton.disabled = false;
  }
  function replaceMotion(next) {
    const state = getState();
    state.custom = state.custom.map(item => item.name === selectedName ? next : item);
    keyIndex = Math.min(keyIndex, next.keys.length - 1);
  }
  function edit(next, index = keyIndex) {
    finishGesture();
    pushUndo();
    replaceMotion(next);
    keyIndex = Math.min(index, motion().keys.length - 1);
    notify(); showPose(); render();
  }
  function refreshRange() {
    if (!rangeInput || !motion() || !active) return;
    const range = (mode === 'position' ? positionRange : angleRange)(ensureSession(), keyState(), options());
    const factor = mode === 'position' ? 100 : 1;
    const unit = mode === 'position' ? 'cm' : '度';
    const display = value => `${(value * factor).toFixed(1)} ${unit}`;
    rangeInput.min = String(range.min);
    rangeInput.max = String(range.max);
    rangeInput.value = String(range.value);
    rangeInput.disabled = Math.abs(range.max - range.min) < 1e-8;
    rangeInput.setAttribute('aria-valuetext', display(range.value));
    rangeOutput.value = display(range.value);
    rangeLimits.replaceChildren(node('span', display(range.min)), node('span', display(range.max)));
    rangeHint.hidden = !rangeInput.disabled;
  }
  function applyPending() {
    frame = null;
    if (pendingValue === null || !motion()) return;
    const value = pendingValue;
    pendingValue = null;
    if (!gesture) gesture = { motion: copy(motion()), keyIndex, options: options() };
    const base = gesture.motion.keys[gesture.keyIndex];
    const result = (mode === 'position' ? moveJoint : rotateJoint)(ensureSession(), base,
      { ...gesture.options, value });
    replaceMotion(setKeyState(motion(), keyIndex, result));
    showPose();
    const actual = mode === 'position' ? jointPosition(session, result, joint)[['x', 'y', 'z'].indexOf(axis)]
      : result.pose[targetJoint()]?.[['x', 'y', 'z'].indexOf(axis)] ?? 0;
    rangeOutput.value = `${(actual * (mode === 'position' ? 100 : 1)).toFixed(1)} ${mode === 'position' ? 'cm' : '度'}`;
    rangeInput.setAttribute('aria-valuetext', rangeOutput.value);
  }
  function finishGesture() {
    if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
    applyPending();
    if (!gesture) return;
    if (JSON.stringify(gesture.motion) !== JSON.stringify(motion())) {
      pushUndo({ motion: gesture.motion, keyIndex: gesture.keyIndex });
      notify();
    }
    gesture = null;
    refreshRange();
  }
  function button(parent, text, action, pressed) {
    const result = node('button', text);
    result.type = 'button';
    if (pressed !== undefined) result.setAttribute('aria-pressed', String(pressed));
    result.addEventListener('click', () => guard(action));
    parent.append(result);
    return result;
  }
  function select(parent, label, values, value, change, id) {
    const title = node('label', label);
    const input = node('select');
    input.id = id; title.htmlFor = id;
    for (const [key, text] of values) {
      const option = node('option', text); option.value = String(key); input.append(option);
    }
    input.value = String(value);
    input.addEventListener('change', () => guard(() => { finishGesture(); change(input.value); }));
    parent.append(title, input);
    return input;
  }
  function check(parent, label, checked, change) {
    const title = node('label', undefined, 'make-check');
    const input = node('input'); input.type = 'checkbox'; input.checked = checked;
    input.addEventListener('change', () => guard(() => { finishGesture(); change(input.checked); }));
    title.append(input, node('span', label)); parent.append(title);
  }
  function section(title) {
    const result = node('section', undefined, 'make-section');
    result.append(node('h3', title)); panel.append(result); return result;
  }
  function controlsChanged() { showPose(); render(); }
  function selectKey(index) {
    finishGesture(); keyIndex = index; showPose(); render();
    panel.parentElement.scrollTop = 0;
  }
  function selectJoint(name) {
    if (!jointLabels.has(name)) return;
    finishGesture(); joint = name; upper = 0; controlsChanged();
  }
  function renderNameForm(parent) {
    if (!formMode) return;
    const form = node('form');
    const label = node('label', '動きの名前'); label.htmlFor = 'make-name';
    const input = node('input');
    Object.assign(input, { id: 'make-name', type: 'text', required: true, maxLength: 80,
      value: formMode === 'rename' ? motion().label : '', placeholder: '例：手を振る' });
    const actions = node('div', undefined, 'make-actions');
    const submit = node('button', 'この名前にする'); submit.type = 'submit'; actions.append(submit);
    button(actions, 'やめる', () => { formMode = null; render(); });
    form.append(label, input, actions); parent.append(form);
    form.addEventListener('submit', event => {
      event.preventDefault();
      guard(() => {
        const labelText = input.value.trim();
        if (!labelText) { input.setCustomValidity('動きの名前を入れてください'); input.reportValidity(); return; }
        finishGesture();
        if (formMode === 'new') {
          const state = getState();
          if (state.custom.length >= 50) return;
          let number = 1;
          while (state.custom.some(item => item.name === `motion${number}`)) number++;
          selectedName = `motion${number}`; keyIndex = 0;
          const created = defaultCustomMotion(selectedName); created.label = labelText;
          state.custom.push(created);
          state.included.push(`u/${selectedName}`);
        } else {
          pushUndo(); replaceMotion({ ...motion(), label: labelText });
        }
        formMode = null; notify(true); showPose(); render();
      });
    });
    input.addEventListener('input', () => input.setCustomValidity(''));
    input.focus();
  }
  function render() {
    panel.replaceChildren(node('h2', '作る', 'make-visually-hidden'));
    rangeInput = null;
    const current = motion();
    const main = panel.closest('main');
    if (hasOverlay && main) main.dataset.makeMiddle = String(!!current && keyIndex > 0 && keyIndex < current.keys.length - 1);
    const first = node('section', undefined, 'make-section make-motion'); panel.append(first);
    const motionRow = node('div', undefined, 'make-motion-row'); first.append(motionRow);
    if (getState().custom.length) {
      select(motionRow, '自分で作った動き', getState().custom.map(item => [item.name, item.label]), selectedName,
        name => { selectedName = name; keyIndex = 0; formMode = null; menuOpen = false; controlsChanged(); }, 'make-motion');
      const more = button(motionRow, '…', () => { menuOpen = !menuOpen; render(); });
      more.setAttribute('aria-label', '動きの操作'); more.setAttribute('aria-expanded', String(menuOpen));
      more.setAttribute('aria-controls', 'make-motion-menu');
    }
    const menu = node('div', undefined, 'make-actions make-motion-menu'); menu.id = 'make-motion-menu';
    menu.hidden = !!current && !menuOpen; first.append(menu);
    const create = button(menu, '新しく作る', () => { formMode = 'new'; menuOpen = false; render(); });
    create.className = 'make-new make-primary'; create.disabled = getState().custom.length >= 50;
    if (create.disabled) first.append(node('p', '作れる動きは50個までです。'));
    if (!current) first.append(node('p', '最初と最後のポーズを作ると、その間を自動でつないで動きにします。中間のポーズも足せます'));
    if (current) {
      button(menu, '名前を変える', () => { formMode = 'rename'; menuOpen = false; render(); });
      button(menu, 'この動きを消す', () => {
        if (!window.confirm(`「${motion().label}」を消しますか？`)) return;
        finishGesture();
        const state = getState(), removed = `u/${selectedName}`;
        state.custom = state.custom.filter(item => item.name !== selectedName);
        state.included = state.included.filter(name => name !== removed);
        delete state.tuning.offsets[removed]; histories.delete(selectedName);
        selectedName = state.custom[0]?.name ?? null; keyIndex = 0; formMode = null;
        if (state.selectedMotion === removed) state.selectedMotion = selectedName ? `u/${selectedName}` : 'Idle';
        notify(true); showPose(); render();
      });
    }
    renderNameForm(first);
    if (!current) return;

    const keys = node('section', undefined, 'make-section make-key-section'); panel.append(keys);
    const keyToolbar = node('div', undefined, 'make-key-toolbar'); keys.append(keyToolbar);
    const keyRow = node('div', undefined, 'make-keys'); keyToolbar.append(keyRow);
    const previewButton = button(keyToolbar, '再生する', () => { finishGesture(); return preview(`u/${selectedName}`); });
    previewButton.className = 'make-preview';
    current.keys.forEach((key, index) => button(keyRow,
      index === 0 ? '最初' : index === current.keys.length - 1 ? '最後' : `中間 ${key.t.toFixed(2)}秒`,
      () => selectKey(index), index === keyIndex));
    const neighbor = keyIndex === current.keys.length - 1 ? keyIndex - 1 : keyIndex + 1;
    const middleTime = (current.keys[keyIndex].t + current.keys[neighbor].t) / 2;
    const add = button(keyRow, '中間を足す', () => {
      const next = addMiddleKey(motion(), middleTime);
      edit(next, next.keys.findIndex(key => Math.abs(key.t - middleTime) < 1e-8));
    });
    add.disabled = middleTime <= 0.02 || middleTime >= current.duration - 0.02
      || current.keys.some(key => Math.abs(key.t - middleTime) < 0.01 - 1e-9);
    if (keyIndex > 0 && keyIndex < current.keys.length - 1) {
      const timeRow = node('div', undefined, 'make-key-time'); keys.append(timeRow);
      const label = node('label', 'このコマの時刻'); label.htmlFor = 'make-key-time';
      const input = node('input');
      Object.assign(input, { id: 'make-key-time', type: 'range', min: current.keys[keyIndex - 1].t + 0.01,
        max: current.keys[keyIndex + 1].t - 0.01, step: '0.001', value: current.keys[keyIndex].t });
      const output = node('output', `${current.keys[keyIndex].t.toFixed(2)} 秒`); output.htmlFor = input.id;
      input.addEventListener('input', () => { output.value = `${Number(input.value).toFixed(2)} 秒`; });
      input.addEventListener('change', () => guard(() => edit(moveKey(motion(), keyIndex, Number(input.value)))));
      timeRow.append(label, output, input);
      button(timeRow, 'この中間を消す', () => edit(removeKey(motion(), keyIndex), keyIndex - 1));
    }

    const pose = section('ポーズを直す');
    const heading = node('div', undefined, 'make-pose-heading');
    heading.append(pose.firstChild); pose.append(heading);
    if (hasOverlay) check(heading, '関節の丸を出す', showJoints, value => {
      showJoints = value;
      try { localStorage.setItem('moju.mobile.showJoints', String(value)); } catch {}
      updateOverlay();
    });
    pose.addEventListener('pointerdown', restoreKey, true);
    pose.addEventListener('focusin', restoreKey);
    const row1 = node('div', undefined, 'make-pose-row'); pose.append(row1);
    const joints = node('div', undefined, 'make-field'); row1.append(joints);
    select(joints, '関節', POSE_JOINTS.map(item => [item.name, item.label]), joint, selectJoint, 'make-joint');
    const modes = node('div', undefined, 'make-modes'); row1.append(modes);
    modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', '動かし方');
    modes.append(node('span', '動かし方'));
    for (const [value, label] of [['position', '位置'], ['angle', '角度']]) {
      button(modes, label, () => { finishGesture(); mode = value; upper = 0; controlsChanged(); }, mode === value);
    }
    const row2 = node('div', undefined, 'make-pose-row'); pose.append(row2);
    const direction = node('div', undefined, 'make-field'); row2.append(direction);
    select(direction, '向き', POSE_AXES[mode].map(item => [item.key, item.label]), axis,
      value => { axis = value; controlsChanged(); }, 'make-axis');
    const followers = node('div', undefined, 'make-field'); row2.append(followers);
    if (mode === 'angle') {
      const targets = [0, 1, 2].flatMap(steps => {
        const name = upperJoint(joint, steps);
        return name ? [[steps, steps === 0 ? '選んだ関節' : `${steps} 個上（${jointLabels.get(name)}）`]] : [];
      });
      select(followers, '回す関節', targets, upper, value => { upper = Number(value); controlsChanged(); }, 'make-upper');
    }
    if (mode === 'position') {
      if (joint === 'Hips') check(followers, '足を床に付けたまま', pinFeet, value => { pinFeet = value; controlsChanged(); });
      else select(followers, '付いてくる関節', [1, 2, 3].map(value => [value, `${value} 個上まで`]), chain,
        value => { chain = Number(value); controlsChanged(); }, 'make-chain');
    }
    const sliderLabel = node('label', 'いまの数字', 'make-visually-hidden'); sliderLabel.htmlFor = 'make-pose-value';
    rangeOutput = node('output'); rangeOutput.htmlFor = 'make-pose-value';
    rangeLimits = node('div', undefined, 'make-limits');
    rangeInput = node('input');
    Object.assign(rangeInput, { id: 'make-pose-value', type: 'range', step: 'any' });
    rangeInput.addEventListener('input', () => {
      pendingValue = Number(rangeInput.value);
      if (frame === null) frame = requestAnimationFrame(() => guard(applyPending));
    });
    rangeInput.addEventListener('change', () => guard(finishGesture));
    rangeInput.addEventListener('pointerup', () => guard(finishGesture));
    rangeInput.addEventListener('pointercancel', () => guard(finishGesture));
    rangeInput.addEventListener('blur', () => guard(finishGesture));
    rangeHint = node('p', 'この向きには、いまは動かせません'); rangeHint.setAttribute('role', 'status');
    const slider = node('div', undefined, 'make-slider');
    slider.append(sliderLabel, rangeOutput, rangeLimits, rangeInput);
    const explanation = node('small', '体や関節の限界で止まります。他の関節を動かすと範囲が変わります。', 'make-explanation');
    explanation.title = '体に当たる所と、これ以上曲がらない所で止まります。ほかの関節を動かすと、動かせる範囲は変わります。';
    pose.append(slider, rangeHint, explanation);
    const actions = node('div', undefined, 'make-actions'); pose.append(actions);
    undoButton = button(actions, '元に戻す', () => {
      finishGesture();
      const previous = history().pop(); if (!previous) return;
      const renamed = previous.motion.label !== motion().label;
      replaceMotion(previous.motion); keyIndex = previous.keyIndex;
      notify(renamed); showPose(); render();
    });
    undoButton.disabled = !history().length;
    button(actions, 'この関節を立ち姿に戻す', () => {
      const state = copy(keyState()); delete state.pose[joint];
      if (joint === 'Hips') state.hips = [0, 0, 0];
      edit(setKeyState(motion(), keyIndex, state));
    });
    button(actions, 'このコマを立ち姿に戻す', () => edit(setKeyState(motion(), keyIndex, standing())));
    button(actions, '左右を入れ替える', () => edit(setKeyState(motion(), keyIndex, mirrorState(keyState()))));
    if (keyIndex > 0) button(actions, '前のコマから写す', () => edit(setKeyState(motion(), keyIndex, motion().keys[keyIndex - 1])));

    const settingsBox = node('details', undefined, 'make-settings'); settingsBox.open = settingsOpen;
    settingsBox.append(node('summary', '動きの設定')); panel.append(settingsBox);
    const settings = node('div', undefined, 'make-section'); settingsBox.append(settings);
    settingsBox.addEventListener('toggle', () => { settingsOpen = settingsBox.open; });
    const durationLabel = node('label', '長さ(秒)'); durationLabel.htmlFor = 'make-duration';
    const duration = node('input');
    Object.assign(duration, { id: 'make-duration', type: 'number', min: '0.2', max: '10', step: '0.1', value: current.duration });
    function setDuration(value) {
      const length = Math.round(Math.max(0.2, Math.min(10, Number.isFinite(value) ? value : 1)) * 10) / 10;
      edit(normalizeCustomMotion({ ...motion(), duration: length,
        keys: motion().keys.map(key => ({ ...key, t: key.t * length / motion().duration })) }));
    }
    duration.addEventListener('change', () => guard(() => setDuration(duration.valueAsNumber)));
    settings.append(durationLabel, duration);
    button(settings, '初期値に戻す', () => setDuration(1));
    check(settings, '繰り返す動きにする', current.loop, loop => edit({ ...motion(), loop }));
    settings.append(node('small', '最後のポーズを最初と同じにして、つなぎ目をなくします'));
    select(settings, '速さの付き方', [['ease', 'ゆっくり始まりゆっくり止まる'], ['linear', '一定']], current.ease,
      ease => edit({ ...motion(), ease }), 'make-ease');
    refreshRange();
    const selectedKey = keyRow.querySelector('[aria-pressed="true"]');
    if (selectedKey) keyRow.scrollLeft = selectedKey.offsetLeft - keyRow.offsetLeft;
  }

  const overlay = hasOverlay ? node('div', undefined, 'make-joint-overlay') : null;
  if (overlay) { viewer.append(overlay); overlay.hidden = true; }
  const dots = (hasOverlay ? POSE_JOINTS : []).map(item => {
    const dot = button(overlay, '', () => selectJoint(item.name)); dot.className = 'make-joint-dot';
    dot.setAttribute('aria-label', `${item.label}を選ぶ`);
    return { joint: item.name, dot };
  });
  const projected = new Vector3();
  function updateOverlay() {
    if (!overlay) return;
    overlay.hidden = !active || !motion() || !showJoints;
    if (overlay.hidden) return;
    const body = getBody(); if (!body) return;
    body.group.updateMatrixWorld(true);
    for (const { joint: name, dot } of dots) {
      body.bones[name].getWorldPosition(projected).project(camera);
      dot.hidden = projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      dot.style.left = `${(projected.x + 1) * viewer.clientWidth / 2}px`;
      dot.style.top = `${(1 - projected.y) * viewer.clientHeight / 2}px`;
      dot.setAttribute('aria-pressed', String(joint === name));
      dot.style.zIndex = String(name === joint ? 101 : Math.round((1 - projected.z) * 50));
    }
  }
  function refresh({ clearHistory = false } = {}) {
    finishGesture();
    if (clearHistory) histories.clear();
    const state = getState();
    const selected = state.selectedMotion.startsWith('u/') ? state.selectedMotion.slice(2) : selectedName;
    selectedName = state.custom.some(item => item.name === selected) ? selected : state.custom[0]?.name ?? null;
    keyIndex = Math.min(keyIndex, (motion()?.keys.length ?? 1) - 1);
    formMode = null;
    showPose(); render(); updateOverlay();
  }
  return {
    setActive(value) { finishGesture(); active = value; if (active) refresh(); updateOverlay(); },
    refresh,
    updateOverlay,
    select: selectJoint,
    seek,
    dispose() {
      active = false;
      finishGesture();
      session?.dispose();
      session = null;
      overlay?.remove();
      panel.replaceChildren();
      panel.classList.remove('make-panel');
    },
    state: () => copy({ active, motion: motion() ?? null, keyIndex, joint, mode, axis, chain, pinFeet,
      rotationJoint: targetJoint(), pose: keyState() ?? null, undoCount: history().length, showJoints, viewingTime }),
  };
}
