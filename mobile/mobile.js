import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MANNEQUIN_INFO, MANNEQUIN_PRESETS, normalizeParams, buildMannequinBody } from '../src/mannequin.mjs';
import { loadDefaultMotions, retargetClips } from '../src/motions.mjs';
import { loadScriptedMotions, SCRIPT_LABELS, SCRIPT_GROUPS } from '../src/motion_scripts.mjs';
import { loadQuaterniusSources, createQuaterniusRetargeter, QUATERNIUS_LABELS, QUATERNIUS_GROUPS } from '../src/motion_library.mjs';
import { CLEARANCE_SETTINGS, KEEP_SHAPE_GROUPS, GROUND_SETTINGS, OFFSET_JOINTS, OFFSET_AXES,
  defaultTuning, normalizeTuning, retargetOptions } from '../src/motion_tuning.mjs';
import { mannequinVolumes } from '../src/body_volumes.mjs';
import { clearArms } from '../src/arm_clearance.mjs';
import { updateHelpers, setPose } from '../src/skin.mjs';
import { exportGlb } from '../src/export_glb.mjs';
import { writeSettingsFile, readSettingsFile } from '../src/settings_file.mjs';
import { buildCustomClip } from '../src/custom_motion.mjs';
import { createMobileMake } from './mobile_make.js';
import { STANDARD_NAMES, defaultState, normalizeState, serializeState, parseState, applySettingsFile, motionGroups, exportNames } from './mobile_state.mjs';

const STORAGE_KEY = 'moju.mobile.v1';
const SPEEDS = [0.25, 0.5, 1, 2];
const $ = selector => document.querySelector(selector);
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const pauseForPaint = () => new Promise(resolve => setTimeout(resolve, 0));

export async function start() {
  let state;
  try { state = parseState(localStorage.getItem(STORAGE_KEY)); }
  catch { state = defaultState(); }
  let catalog, allRows, allNames;
  const labels = new Map();
  function refreshCatalog() {
    catalog = motionGroups({ standardNames: STANDARD_NAMES, custom: state.custom, scriptGroups: SCRIPT_GROUPS,
      scriptLabels: SCRIPT_LABELS, quaterniusGroups: QUATERNIUS_GROUPS, quaterniusLabels: QUATERNIUS_LABELS });
    allRows = catalog.flatMap(group => group.rows ?? group.groups.flatMap(child => child.rows));
    allNames = allRows.map(row => row.name);
    labels.clear();
    for (const row of allRows) labels.set(row.name, row.label);
  }
  refreshCatalog();
  function cleanState(value) {
    const clean = normalizeState(value);
    clean.params = normalizeParams(clean.params, clean.preset);
    clean.tuning = normalizeTuning(clean.tuning);
    clean.speed = SPEEDS.reduce((nearest, speed) => Math.abs(speed - clean.speed) < Math.abs(nearest - clean.speed) ? speed : nearest, 1);
    const available = new Set([...allNames.filter(name => !name.startsWith('u/')),
      ...clean.custom.map(motion => `u/${motion.name}`)]);
    clean.included = clean.included.filter(name => available.has(name));
    if (!available.has(clean.selectedMotion)) clean.selectedMotion = 'Idle';
    return clean;
  }
  state = cleanState(state);
  window.__mobile.state = state;
  window.__mobile.clipNames = () => [...allNames];

  const status = message => { $('#status').textContent = message; $('#status').hidden = !message; };
  function showError(error) {
    const reasons = [];
    for (let cause = error; cause && reasons.length < 3; cause = cause.cause) {
      reasons.push(cause.message ?? String(cause));
    }
    $('#error').textContent = `処理に失敗しました: ${reasons.join(' / ') || '原因を確認できませんでした'}`;
    $('#error').hidden = false;
    status('');
    $('#panels').scrollTop = 0;
  }
  const clearError = () => { $('#error').hidden = true; $('#error').textContent = ''; };
  const guard = task => { Promise.resolve().then(task).catch(showError); };
  function updateExportCount() {
    $('#export-count').textContent = `入る動き: ${exportNames(state, allNames).length} 個`;
  }
  function remember(invalidate = true) {
    if (invalidate) $('#export-size').textContent = 'ファイルの大きさ: 設定変更後の作成時に表示します';
    updateExportCount();
    updateMotionCounts();
    try { localStorage.setItem(STORAGE_KEY, serializeState(state)); }
    catch { status('このブラウザには設定を記憶できません。「設定をファイルに保存」を使ってください。'); }
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e2e7e4');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x707c70, 2.4));
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(3, 5, 4);
  scene.add(light);
  scene.add(new THREE.GridHelper(10, 40, 0x81958c, 0xbdc9c0));
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.setAttribute('aria-label', '回して見られる素体');
  $('#viewer').append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.3;
  controls.maxDistance = 15;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  $('#viewer').addEventListener('pointerdown', () => { $('.gesture-hint').hidden = true; }, { once: true });
  let framedSize = '', framingBounds = null;
  function fitCamera(reset = false) {
    if (!context) return;
    const body = context.body, height = state.params.height;
    // 立ち姿の幅・奥行きと、腕を頭上へ伸ばしたときの高さを囲む。
    const bounds = framingBounds.clone();
    const joint = name => new THREE.Vector3(...body.joints.find(item => item.name === name).position);
    const shoulder = joint('LeftUpperArm'), elbow = joint('LeftLowerArm'), hand = joint('LeftHand');
    bounds.max.y = Math.max(height, shoulder.y + shoulder.distanceTo(elbow) + elbow.distanceTo(hand) + height * 0.06);
    bounds.min.y = Math.min(0, bounds.min.y);
    const center = bounds.getCenter(new THREE.Vector3());
    const direction = reset ? new THREE.Vector3(1, 0.06, 2).normalize()
      : camera.position.clone().sub(controls.target).normalize();
    if (direction.lengthSq() < 1e-8) direction.set(1, 0.06, 2).normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.85;
    let distance = 0;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const offset = new THREE.Vector3(x, y, z).sub(center);
        distance = Math.max(distance, offset.dot(direction) + Math.max(
          Math.abs(offset.dot(up)) / tangent, Math.abs(offset.dot(right)) / (tangent * camera.aspect)));
      }
    }
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.update();
  }
  function resize() {
    const width = Math.max(1, $('#viewer').clientWidth);
    const height = Math.max(1, $('#viewer').clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (framedSize !== `${width}/${height}`) {
      framedSize = `${width}/${height}`;
      fitCamera();
    }
    renderer.render(scene, camera);
  }
  new ResizeObserver(resize).observe($('#viewer'));
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  let context, mixer, activeClip, makeEditor;
  let playing = true, time = 0, selectionRequest = 0, editingMotion = null;
  let quaterniusPromise = null, quaterniusRetargeter = null, quaterniusDetails, quaterniusContent;
  let quaterniusRowsShown = false;
  const rowButtons = new Map();
  const rowChecks = new Map();
  const motionSections = [];
  const searchOpenStates = new Map();
  let controlId = 0;

  // 同じ標準素材を再取得せず、体型や調整を変えるたびに既存ローダーで付け替える。
  let standardData = null;
  async function fetchStandard(url) {
    if (!standardData) {
      standardData = fetch(url).then(response => {
        if (!response.ok) throw new Error(`標準の動きを取得できませんでした (${response.status})`);
        return response.arrayBuffer();
      }).catch(error => { standardData = null; throw error; });
    }
    const data = await standardData;
    return { ok: true, arrayBuffer: async () => data.slice(0) };
  }

  function makeContext(body, snapshot) {
    const params = normalizeParams(snapshot.params, snapshot.preset);
    const options = retargetOptions(snapshot.tuning);
    return { body, params, options, custom: structuredClone(snapshot.custom),
      standard: null, scripts: null, volumes: null, clips: new Map() };
  }
  function disposeBody(body) {
    const materials = new Set();
    body.group.traverse(object => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach(material => materials.add(material));
      else if (object.material) materials.add(object.material);
    });
    materials.forEach(material => material.dispose());
    body.skeleton.dispose();
  }
  async function ensureQuaternius() {
    if (quaterniusRetargeter) return;
    if (quaterniusPromise) return quaterniusPromise;
    $('#quaternius-status').textContent = '重い動きの素材を読み込み中です…';
    $('#quaternius-retry').hidden = true;
    quaterniusPromise = (async () => {
      try {
        const sources = await loadQuaterniusSources({ fetch: globalThis.fetch });
        quaterniusRetargeter = createQuaterniusRetargeter(sources);
        if (!quaterniusRowsShown) {
          const group = catalog.at(-1);
          for (const child of group.groups) renderMotionGroup(child, quaterniusContent, false);
          quaterniusRowsShown = true;
          updateMotionCounts();
          filterMotions();
        }
        $('#quaternius-status').textContent = '読み込みました。動きの名前を押すと再生します。';
      } catch (cause) {
        quaterniusPromise = null;
        $('#quaternius-status').textContent = '素材を読み込めませんでした。通信を確認して、もう一度お試しください。';
        $('#quaternius-retry').hidden = false;
        throw new Error('Quaternius の読み込みに失敗しました', { cause });
      }
    })();
    return quaterniusPromise;
  }
  async function getClip(target, name) {
    if (target.clips.has(name)) return target.clips.get(name);
    const pending = (async () => {
      await pauseForPaint();
      let clip;
      if (name.startsWith('q')) {
        // 読込済みの設定から再生・書き出す場合も、先に見出しを開く。
        quaterniusDetails.open = true;
        await ensureQuaternius();
        clip = quaterniusRetargeter(name, target.body.joints, target.options);
      } else if (name.startsWith('u/')) {
        const motion = target.custom.find(item => `u/${item.name}` === name);
        if (motion) {
          // 同じ素体の立ち姿を元に、既存の関節調整・接地処理へ渡す。
          const sourceBody = buildMannequinBody(target.params);
          try {
            clip = retargetClips({ scene: sourceBody.group, clips: [buildCustomClip(motion, sourceBody.joints)] },
              target.body.joints, target.options)[0];
          } finally { disposeBody(sourceBody); }
        }
      } else if (name.startsWith('s/')) {
        target.scripts ??= loadScriptedMotions(target.body.joints, target.options);
        clip = target.scripts.find(item => item.name === name);
      } else {
        target.standard ??= loadDefaultMotions(target.body.joints, { ...target.options, fetch: fetchStandard })
          .catch(error => { target.standard = null; throw error; });
        clip = (await target.standard).find(item => item.name === name);
      }
      if (!clip) throw new Error(`動き「${labels.get(name) ?? name}」を見つけられませんでした`);
      target.volumes ??= mannequinVolumes(target.params, target.body.joints);
      return clearArms(clip, target.body.joints, target.volumes, target.options.clearance);
    })();
    target.clips.set(name, pending);
    try { return await pending; }
    catch (error) { target.clips.delete(name); throw error; }
  }

  function updatePlayButton() {
    $('#play').textContent = playing ? '止める' : '再生';
    $('#play').setAttribute('aria-pressed', String(playing));
  }
  function updateTime() {
    const duration = editingMotion?.duration ?? activeClip?.duration ?? 0;
    $('#timeline').max = String(duration || 1);
    $('#timeline').value = String(time);
    $('#time-value').textContent = `${time.toFixed(2)} / ${duration.toFixed(2)} 秒`;
  }
  function applyTime() {
    if (!mixer || !activeClip) return;
    mixer.setTime(time);
    updateHelpers(context.body);
    context.body.group.updateMatrixWorld(true);
  }
  async function selectMotion(name, restart = true) {
    editingMotion = null;
    const request = ++selectionRequest;
    const target = context;
    state.selectedMotion = name;
    if (restart) playing = true;
    remember(false);
    clearError();
    renderOffsets();
    for (const [rowName, button] of rowButtons) button.setAttribute('aria-pressed', String(rowName === name));
    $('#current-motion').textContent = `${labels.get(name)} を準備中…`;
    $('#play').disabled = true;
    $('#timeline').disabled = true;
    status('体型と調整に合わせて動きを準備しています…');
    let clip;
    try { clip = await getClip(target, name); }
    catch (error) {
      if (request !== selectionRequest || target !== context) return;
      $('#current-motion').textContent = `「${labels.get(name)}」を読み込めませんでした`;
      status('動きの一覧から選び直すと、もう一度読み込みます。');
      throw error;
    }
    if (request !== selectionRequest || target !== context) return;
    if (mixer) {
      mixer.stopAllAction();
      mixer.uncacheRoot(target.body.group);
    }
    mixer = new THREE.AnimationMixer(target.body.group);
    activeClip = clip;
    mixer.clipAction(clip).play();
    time = restart ? 0 : Math.min(time, clip.duration);
    applyTime();
    updateTime();
    updatePlayButton();
    $('#play').disabled = false;
    $('#timeline').disabled = false;
    $('#current-motion').textContent = labels.get(name);
    status('');
  }
  async function rebuildBody() {
    const nextBody = buildMannequinBody(normalizeParams(state.params, state.preset), { colors: state.colors });
    const previous = context?.body;
    if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(previous.group); mixer = null; }
    activeClip = null;
    context = makeContext(nextBody, state);
    scene.add(nextBody.group);
    framingBounds = new THREE.Box3().setFromObject(nextBody.group);
    if (previous) { scene.remove(previous.group); disposeBody(previous); }
    resize();
    fitCamera(true);
    if ($('#tab-make').getAttribute('aria-selected') === 'true') makeEditor.refresh();
    else await selectMotion(state.selectedMotion);
  }
  async function rebuildMotion() {
    context = makeContext(context.body, state);
    await selectMotion(state.selectedMotion, false);
  }

  function accordion(label, parent, open = false) {
    const details = element('details');
    details.open = open;
    details.append(element('summary', label));
    const content = element('div', undefined, 'detail-content');
    details.append(content);
    parent.append(details);
    return { details, content };
  }
  function slider(parent, info, getValue, setValue, initial, commit) {
    const box = element('div', undefined, 'setting');
    const id = `setting-${++controlId}`;
    const label = element('label', info.label);
    label.htmlFor = id;
    const output = element('output');
    output.htmlFor = id;
    const heading = element('div', undefined, 'setting-heading');
    const description = element('p', info.description);
    description.id = `${id}-description`;
    const input = element('input');
    Object.assign(input, { id, type: 'range', min: String(info.min), max: String(info.max), step: String(info.step) });
    input.setAttribute('aria-describedby', description.id);
    const refresh = () => { input.value = String(getValue()); output.value = String(getValue()); };
    input.addEventListener('input', () => { output.value = String(Number(input.value)); });
    input.addEventListener('change', () => {
      setValue(Number(input.value)); remember(); guard(commit);
    });
    const reset = element('button', '初期値に戻す');
    reset.type = 'button';
    reset.setAttribute('aria-label', `${info.label}を初期値に戻す`);
    reset.addEventListener('click', () => { setValue(initial()); refresh(); remember(); guard(commit); });
    heading.append(label, output, reset);
    box.append(heading, input, description);
    parent.append(box);
    refresh();
  }
  function renderBodySettings() {
    $('#preset').value = state.preset;
    $('#body-settings').replaceChildren();
    const groups = new Map();
    for (const [key, info] of Object.entries(MANNEQUIN_INFO)) {
      if (!groups.has(info.group)) groups.set(info.group, accordion(info.group, $('#body-settings')).content);
      slider(groups.get(info.group), info, () => state.params[key], value => { state.params[key] = value; },
        () => MANNEQUIN_PRESETS[state.preset][key], rebuildBody);
    }
  }
  function renderTuning() {
    $('#tuning-settings').replaceChildren();
    const defaults = defaultTuning();
    for (const [group, label, items] of [
      ['clearance', '腕を体から離す', CLEARANCE_SETTINGS],
      ['keepShape', '素体の形を保つ', KEEP_SHAPE_GROUPS.map(info => ({ ...info, min: 0, max: 1, step: 0.05 }))],
      ['ground', '床への接地', GROUND_SETTINGS],
    ]) {
      const { content } = accordion(label, $('#tuning-settings'));
      for (const info of items) slider(content, info, () => state.tuning[group][info.key],
        value => { state.tuning[group][info.key] = value; }, () => defaults[group][info.key], rebuildMotion);
    }
    renderOffsets();
  }
  function renderOffsets() {
    const joint = $('#offset-joint').value;
    const name = state.selectedMotion;
    $('#offset-motion').textContent = `対象の動き: ${labels.get(name)}`;
    $('#offset-settings').replaceChildren();
    OFFSET_AXES.forEach((info, axis) => {
      const read = () => state.tuning.offsets[name]?.[joint]?.[axis] ?? 0;
      const write = value => {
        const angles = [...(state.tuning.offsets[name]?.[joint] ?? [0, 0, 0])];
        angles[axis] = value;
        state.tuning.offsets[name] = { ...state.tuning.offsets[name], [joint]: angles };
        state.tuning = normalizeTuning(state.tuning);
      };
      slider($('#offset-settings'), info, read, write, () => 0, rebuildMotion);
    });
  }
  function motionAccordion(group, parent, open = false) {
    const section = accordion(group.label, parent, open);
    const count = element('span', undefined, 'group-count');
    section.details.querySelector('summary').append(count);
    const rows = group.rows ?? group.groups.flatMap(child => child.rows);
    motionSections.push({ ...section, rows, count, lazy: Boolean(group.groups) });
    return section;
  }
  function updateMotionCounts() {
    const included = new Set(state.included);
    for (const { rows, count } of motionSections) {
      const selected = rows.filter(row => included.has(row.name)).length;
      count.textContent = `${selected} / ${rows.length}`;
      count.setAttribute('aria-label', `書き出しに入っている数 ${selected} / 全部の数 ${rows.length}`);
    }
  }
  function filterMotions() {
    const normalize = text => text.normalize('NFKC').toLocaleLowerCase('ja');
    const query = normalize($('#motion-search').value.trim());
    const matches = row => normalize(row.label).includes(query);
    for (const [name, button] of rowButtons) {
      button.parentElement.hidden = !matches({ label: labels.get(name) });
    }
    for (const { details, rows, lazy } of motionSections) {
      details.hidden = !rows.some(matches);
      if (query) {
        if (!searchOpenStates.has(details)) searchOpenStates.set(details, details.open);
        // 重い Quaternius は検索だけでは開かず、利用者が開いたときに読み込む。
        if (!lazy && !details.hidden) details.open = true;
      } else if (searchOpenStates.has(details)) {
        details.open = searchOpenStates.get(details);
        searchOpenStates.delete(details);
      }
    }
    $('#motion-empty').hidden = allRows.some(matches);
  }
  function renderMotionGroup(group, parent, open) {
    const { content } = motionAccordion(group, parent, open);
    for (const row of group.rows) {
      const wrapper = element('div', undefined, 'motion-row');
      const button = element('button', row.label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(row.name === state.selectedMotion));
      button.addEventListener('click', () => guard(() => selectMotion(row.name)));
      rowButtons.set(row.name, button);
      const include = element('label', undefined, 'include-label');
      const check = element('input');
      check.type = 'checkbox';
      check.checked = state.included.includes(row.name);
      check.setAttribute('aria-label', `${row.label}を書き出しに入れる`);
      check.addEventListener('change', () => {
        state.included = check.checked ? [...new Set([...state.included, row.name])]
          : state.included.filter(name => name !== row.name);
        remember();
      });
      rowChecks.set(row.name, check);
      include.append(check);
      wrapper.append(button, include);
      content.append(wrapper);
    }
  }
  function renderMotions() {
    $('#motion-list').replaceChildren();
    rowButtons.clear(); rowChecks.clear(); motionSections.length = 0; searchOpenStates.clear();
    quaterniusRowsShown = false;
    for (const group of catalog.slice(0, -1)) renderMotionGroup(group, $('#motion-list'), true);
    const section = motionAccordion(catalog.at(-1), $('#motion-list'));
    quaterniusDetails = section.details;
    quaterniusContent = section.content;
    const note = element('p', '初めて開くと動きの素材を読み込みます。');
    note.id = 'quaternius-status';
    note.setAttribute('role', 'status');
    const retry = element('button', 'もう一度読み込む');
    retry.id = 'quaternius-retry'; retry.type = 'button'; retry.hidden = true;
    retry.addEventListener('click', () => guard(async () => {
      clearError(); await ensureQuaternius();
      if (state.selectedMotion.startsWith('q')) await selectMotion(state.selectedMotion);
    }));
    quaterniusContent.append(note, retry);
    if (quaterniusRetargeter) {
      for (const child of catalog.at(-1).groups) renderMotionGroup(child, quaterniusContent, false);
      quaterniusRowsShown = true;
      note.textContent = '読み込みました。動きの名前を押すと再生します。';
    }
    quaterniusDetails.addEventListener('toggle', () => {
      if (quaterniusDetails.open) guard(ensureQuaternius);
    });
    updateMotionCounts();
    filterMotions();
  }
  $('#motion-search').addEventListener('input', filterMotions);

  const tabNames = ['body', 'motion', 'make', 'tuning', 'export'];
  function showTab(name) {
    $('main').dataset.tab = name;
    for (const tab of tabNames) {
      $(`#panel-${tab}`).hidden = tab !== name;
      $(`#tab-${tab}`).setAttribute('aria-selected', String(tab === name));
      $(`#tab-${tab}`).tabIndex = tab === name ? 0 : -1;
    }
    makeEditor?.setActive(name === 'make');
    if (name !== 'make' && editingMotion) guard(() => selectMotion(state.selectedMotion, false));
    $('#panels').scrollTop = 0;
  }
  tabNames.forEach((name, index) => {
    $(`#tab-${name}`).addEventListener('click', () => showTab(name));
    $(`#tab-${name}`).addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % tabNames.length
        : event.key === 'ArrowLeft' ? (index + tabNames.length - 1) % tabNames.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabNames.length - 1 : null;
      if (next === null) return;
      event.preventDefault(); showTab(tabNames[next]); $(`#tab-${tabNames[next]}`).focus();
    });
  });
  $('#preset').addEventListener('change', () => {
    state.preset = $('#preset').value;
    state.params = normalizeParams({}, state.preset);
    renderBodySettings(); remember(); guard(rebuildBody);
  });
  $('#reset-body').addEventListener('click', () => {
    state.params = normalizeParams({}, state.preset);
    renderBodySettings(); remember(); guard(rebuildBody);
  });
  $('#offset-joint').append(...OFFSET_JOINTS.map(joint => {
    const option = element('option', joint.label); option.value = joint.name; return option;
  }));
  $('#offset-joint').addEventListener('change', renderOffsets);
  $('#play').addEventListener('click', () => {
    if (!activeClip && state.custom.some(motion => `u/${motion.name}` === state.selectedMotion)) {
      guard(() => selectMotion(state.selectedMotion));
    } else { playing = !playing; updatePlayButton(); }
  });
  $('#timeline').addEventListener('input', () => {
    if (editingMotion) { makeEditor.seek(Number($('#timeline').value)); return; }
    time = Math.min(activeClip?.duration ?? 0, Number($('#timeline').value));
    applyTime(); updateTime();
  });
  function updateSpeed() {
    $('#speed-value').textContent = `${state.speed} 倍`;
    $('#speed').setAttribute('aria-label', `速さ ${state.speed} 倍。押すと切り替え`);
  }
  $('#speed').addEventListener('click', () => {
    state.speed = SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length];
    updateSpeed(); remember(false);
  });
  $('#export-name').addEventListener('input', () => {
    state.name = normalizeState({ name: $('#export-name').value }).name; remember();
  });

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url; link.download = filename; link.hidden = true;
    document.body.append(link);
    try { link.click(); }
    finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  }
  $('#save-settings').addEventListener('click', () => guard(() => {
    clearError();
    download(new Blob([writeSettingsFile(state)], { type: 'application/json' }), `${state.name}.mojumannequin`);
    status('設定ファイルのダウンロードを開始しました。');
  }));
  $('#load-settings').addEventListener('click', () => $('#settings-file').click());
  $('#settings-file').addEventListener('change', () => guard(async () => {
    const file = $('#settings-file').files[0];
    if (!file) return;
    clearError();
    try {
      const settings = readSettingsFile(await file.text());
      Object.assign(state, cleanState(applySettingsFile(state, settings)));
      refreshCatalog(); renderMotions();
      makeEditor.refresh({ clearHistory: true });
      renderBodySettings(); renderTuning();
      for (const [name, check] of rowChecks) check.checked = state.included.includes(name);
      refreshFields(); remember();
      await rebuildBody();
      status('設定ファイルを読み込みました。');
    } catch (cause) { throw new Error('設定を読み込めませんでした。Moju の .mojumannequin または .json を選んでください', { cause }); }
    finally { $('#settings-file').value = ''; }
  }));
  $('#export-glb').addEventListener('click', () => guard(async () => {
    clearError();
    const button = $('#export-glb');
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    const snapshot = cleanState(state);
    const names = exportNames(snapshot, allNames);
    const fingerprint = serializeState(snapshot);
    let exportBody;
    try {
      status('ゲーム用の素体を準備しています…');
      await pauseForPaint();
      exportBody = buildMannequinBody(snapshot.params, { colors: snapshot.colors });
      const target = makeContext(exportBody, snapshot);
      const clips = [];
      for (const name of names) {
        status(`書き出しを準備中: ${clips.length + 1} / ${names.length} 個 (${labels.get(name)})`);
        clips.push(await getClip(target, name));
      }
      status('動きをまとめて .glb を作っています…');
      await pauseForPaint();
      const bytes = await exportGlb(exportBody, clips, { name: snapshot.name });
      const blob = new Blob([bytes], { type: 'model/gltf-binary' });
      download(blob, `${snapshot.name}.glb`);
      const size = new Intl.NumberFormat('ja-JP').format(blob.size);
      $('#export-size').textContent = `ファイルの大きさ: ${size} バイト (動き ${clips.length} 個)${fingerprint === serializeState(state) ? '' : '・書き出し開始時の設定'}`;
      status('ゲーム用 .glb のダウンロードを開始しました。');
    } catch (cause) { throw new Error('ゲーム用の書き出しに失敗しました', { cause }); }
    finally {
      if (exportBody) disposeBody(exportBody);
      button.disabled = false; button.setAttribute('aria-busy', 'false');
    }
  }));

  function refreshFields() {
    updateSpeed();
    $('#export-name').value = state.name;
    updateExportCount();
  }
  makeEditor = createMobileMake({
    panel: $('#panel-make'), viewer: $('#viewer'), camera,
    getState: () => state, getBody: () => context?.body,
    guard, preview: name => selectMotion(name),
    onChange(catalogChanged) {
      if (context) {
        context.custom = structuredClone(state.custom);
        context.clips.clear();
      }
      if (catalogChanged) { refreshCatalog(); renderMotions(); }
      renderOffsets(); remember();
    },
    onPose(sourceBody, motion, poseTime = 0) {
      ++selectionRequest;
      playing = false;
      if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(context.body.group); mixer = null; }
      activeClip = null; editingMotion = motion; time = poseTime;
      $('#timeline').disabled = !motion;
      $('#play').disabled = !motion;
      if (sourceBody && context) {
        for (const [name, bone] of Object.entries(sourceBody.bones)) {
          context.body.bones[name].position.copy(bone.position);
          context.body.bones[name].quaternion.copy(bone.quaternion);
        }
        updateHelpers(context.body); context.body.group.updateMatrixWorld(true);
        const selectedName = `u/${motion.name}`;
        const changed = state.selectedMotion !== selectedName;
        state.selectedMotion = selectedName;
        $('#current-motion').textContent = `${motion.label}・コマを編集中`;
        for (const [name, button] of rowButtons) button.setAttribute('aria-pressed', String(name === state.selectedMotion));
        if (changed) { renderOffsets(); remember(false); }
      } else if (context) {
        setPose(context.body.bones, {}, context.body.helpers);
        const hips = context.body.joints.find(joint => joint.name === 'Hips').position;
        const root = context.body.joints.find(joint => joint.name === 'Root').position;
        context.body.bones.Hips.position.fromArray(hips).sub(new THREE.Vector3(...root));
        context.body.group.updateMatrixWorld(true);
        $('#current-motion').textContent = '立ち姿・新しく動きを作れます';
      }
      clearError(); status(''); updatePlayButton(); updateTime();
    },
  });
  window.__mobile.make = { select: makeEditor.select, state: makeEditor.state };
  makeEditor.refresh();
  renderBodySettings(); renderTuning(); renderMotions(); refreshFields();
  // 読めない場合も初期表示の「手元の開発版」を残し、編集を続ける。
  fetch(new URL('../version.json', import.meta.url), { cache: 'no-store' })
    .then(response => { if (!response.ok) throw new Error('版を読めません'); return response.json(); })
    .then(version => {
      if (typeof version.builtAt !== 'string' || !Number.isFinite(Date.parse(version.builtAt)) ||
          typeof version.commit !== 'string') return;
      $('#site-version').textContent = `版: ${version.builtAt.slice(0, 10)} (${version.commit})`;
    }).catch(() => {});
  if (state.selectedMotion.startsWith('q')) { showTab('motion'); quaterniusDetails.open = true; }
  resize();
  let previousFrame = null;
  renderer.setAnimationLoop(timestamp => {
    const delta = previousFrame === null ? 0 : Math.min((timestamp - previousFrame) / 1000, 0.1);
    previousFrame = timestamp;
    if (playing && activeClip && !$('#timeline').disabled) {
      time = (time + delta * state.speed) % Math.max(activeClip.duration, 0.001);
      applyTime(); updateTime();
    }
    controls.update();
    makeEditor.updateOverlay();
    renderer.render(scene, camera);
  });
  await rebuildBody();
}
