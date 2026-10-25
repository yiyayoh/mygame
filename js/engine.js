// 文字推理游戏引擎：剧情播放、调查（地点 / 人物 / 出示线索）、推理问答、存档。
import { START, CLUES, PROFILES, SCENES, HUBS, DEDUCTIONS, WRONG_LINES } from './story.js';
import { Rain } from './rain.js';
import { MusicDirector, musicCueFor } from './music.js';

const FAST = new URLSearchParams(location.search).has('fast'); // 自动化测试用：跳过打字和动画
const SAVE_KEY = 'seventh-classroom/save';
const ENDINGS_KEY = 'seventh-classroom/endings';
const SETTINGS_KEY = 'seventh-classroom/settings';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, FAST ? 0 : ms));

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 隐私模式等情况下忽略 */ }
  },
};

// ---------------- 状态 ----------------
let state;
const freshState = () => ({ version: 2, mode: 'scene', scene: START, hub: null, ded: null, q: 0, clues: [], done: [], mistakes: 0, hubTab: 'loc', hubSel: null, history: [], logStart: 0, playback: null, chapter: '', when: '', testimonyDraft: null, linkDraft: null, answerDraft: null, findings: [], pinnedClues: [], presented: [] });
const save = () => store.set(SAVE_KEY, state);
const has = (id) => state.clues.includes(id);
const hasAll = (ids = []) => ids.every(has);

// ---------------- 文本输出 ----------------
const log = $('log');
const controls = $('controls');
const nextHint = $('next-hint');
const latestButton = $('btn-latest');
let followLog = true;
let typing = null;   // 正在打字的行：{ finish }
let waiting = null;  // 等待玩家点击继续的 resolve
let playbackRun = 0;
let activeModal = null;
let modalFocus = null;
const savedSettings = store.get(SETTINGS_KEY, {});
const settings = {
  typeMs: [0, 16, 32, 60].includes(savedSettings.typeMs) ? savedSettings.typeMs : 32,
  fontSize: [0, 16, 18, 20, 22].includes(savedSettings.fontSize) ? savedSettings.fontSize : 0,
  musicEnabled: savedSettings.musicEnabled !== false,
  musicVolume: Number.isFinite(savedSettings.musicVolume) ? Math.max(0, Math.min(100, savedSettings.musicVolume)) : 35,
};

function advance() {
  if (activeModal || ['title-screen', 'card', 'ending'].some((id) => $(id).classList.contains('show'))) return;
  if (!typing && !waiting) return;
  window.getSelection()?.removeAllRanges();
  followLatest();
  if (typing) typing.finish();
  else if (waiting) { const w = waiting; waiting = null; w(); }
}
function hasLogSelection() {
  const selection = window.getSelection();
  return selection && !selection.isCollapsed && (log.contains(selection.anchorNode) || log.contains(selection.focusNode));
}
log.addEventListener('click', () => { if (!hasLogSelection()) advance(); });
nextHint.addEventListener('click', advance);
document.addEventListener('keydown', (e) => {
  if (activeModal) {
    if (e.key === 'Escape') { e.preventDefault(); activeModal === 'notebook' ? closeNotebook(null) : closeModal(); }
    else if (e.key === 'Tab') {
      const nodes = [...$(activeModal).querySelectorAll('button, input, select, [tabindex="0"]')].filter((n) => n.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    return;
  }
  if (e.target.closest('button, input, select, textarea, a')) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing || hasLogSelection()) return;
  if ((e.key === ' ' || e.key === 'Enter') && (typing || waiting)) { e.preventDefault(); advance(); }
});

function openModal(id) {
  if (activeModal) return false;
  typing?.finish();
  modalFocus = document.activeElement;
  activeModal = id;
  $(id).classList.add('show');
  $('app').inert = true;
  $('title-screen').inert = true;
  $(id).querySelector('button, input, select')?.focus();
  return true;
}

function closeModal() {
  if (!activeModal) return;
  $(activeModal).classList.remove('show');
  activeModal = null;
  $('app').inert = false;
  $('title-screen').inert = false;
  if (modalFocus?.isConnected) modalFocus.focus();
  modalFocus = null;
}

function applySettings() {
  if (settings.fontSize) document.documentElement.style.setProperty('--reading-size', `${settings.fontSize}px`);
  else document.documentElement.style.removeProperty('--reading-size');
  $('setting-speed').value = String(settings.typeMs);
  $('setting-size').value = String(settings.fontSize);
  $('music-volume').value = String(settings.musicVolume);
  $('music-volume-value').value = `${settings.musicVolume}%`;
}
applySettings();
for (const [id, key] of [['setting-speed', 'typeMs'], ['setting-size', 'fontSize']]) {
  $(id).addEventListener('change', (e) => { settings[key] = Number(e.target.value); store.set(SETTINGS_KEY, settings); applySettings(); settle(); });
}
for (const id of ['btn-settings', 'btn-title-settings']) $(id).addEventListener('click', () => openModal('settings'));
$('settings-close').addEventListener('click', closeModal);
for (const id of ['history', 'settings']) $(id).addEventListener('click', (e) => { if (e.target.id === id) closeModal(); });

function dimOld() {
  log.querySelectorAll('.line:not(.old)').forEach((n) => n.classList.add('old'));
}

function nearLatest() { return log.scrollHeight - log.clientHeight - log.scrollTop <= 40; }
function scrollDown() {
  if (followLog) log.scrollTop = log.scrollHeight;
  latestButton.classList.toggle('hidden', followLog || nearLatest());
}
function followLatest() {
  followLog = true;
  scrollDown();
}
log.addEventListener('scroll', () => {
  followLog = nearLatest();
  latestButton.classList.toggle('hidden', followLog);
}, { passive: true });
latestButton.addEventListener('click', () => { window.getSelection()?.removeAllRanges(); followLatest(); });
if (typeof ResizeObserver === 'function') new ResizeObserver(scrollDown).observe(log);
else window.addEventListener('resize', scrollDown);
const settle = () => requestAnimationFrame(scrollDown);

function addLine(cls, text) {
  const p = el('p', `line ${cls}`);
  if (text != null) p.textContent = text;
  log.appendChild(p);
  if (text != null && state) { state.history.push({ cls, text }); save(); }
  scrollDown();
  return p;
}

function typeInto(node, text) {
  return new Promise((resolve) => {
    const typeMs = FAST ? 0 : settings.typeMs;
    if (!typeMs) { node.textContent = text; scrollDown(); resolve(); return; }
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      node.textContent = text.slice(0, i);
      if (i % 8 === 0) scrollDown();
      if (i >= text.length) done();
    }, typeMs);
    const task = { finish: () => done(true), cancel: () => done(false) };
    function done(finish) { clearInterval(timer); if (finish) node.textContent = text; if (typing === task) typing = null; scrollDown(); resolve(); }
    typing = task;
  });
}

function waitClick() {
  nextHint.classList.remove('hidden');
  return new Promise((r) => { waiting = () => { nextHint.classList.add('hidden'); r(); }; });
}

function textLine(raw, container = log) {
  const m = raw.match(/^【(.+?)】([\s\S]*)$/);
  let node;
  if (m) {
    const [, who, text] = m;
    const cls = ['say', who === '我' ? 'me' : '', who.includes('录音') ? 'recorded' : ''].join(' ');
    const p = el('p', `line ${cls}`);
    p.appendChild(el('span', 'who', who === '我' ? '夏川' : who));
    node = el('span', 'text');
    p.appendChild(node);
    container.appendChild(p);
    return { node, text };
  } else {
    node = el('p', 'line');
    container.appendChild(node);
    return { node, text: raw };
  }
}

function renderEntry(entry, container) {
  if (entry.raw != null) {
    const { node, text } = textLine(entry.raw, container);
    node.textContent = text;
  } else {
    const p = el('p', `line ${entry.cls ?? ''}`);
    if (entry.label) p.appendChild(el('small', null, entry.label));
    p.appendChild(document.createTextNode(entry.text));
    container.appendChild(p);
  }
}

function restoreLog() {
  followLog = true;
  log.replaceChildren();
  for (const entry of state.history.slice(state.logStart)) renderEntry(entry, log);
  dimOld();
  log.lastElementChild?.classList.remove('old');
  settle();
}

$('btn-history').addEventListener('click', () => {
  if (!state || !openModal('history')) return;
  const list = $('history-list');
  list.replaceChildren();
  for (const entry of state.history) renderEntry(entry, list);
  if (!state.history.length) list.appendChild(el('p', 'empty', '还没有读过的正文。'));
  list.scrollTop = list.scrollHeight;
});
$('history-close').addEventListener('click', closeModal);

function cancelPlayback() {
  playbackRun += 1;
  typing?.cancel();
  waiting?.();
  waiting = null;
  nextHint.classList.add('hidden');
  $('card').classList.remove('show');
}

function play(lines = [], after = { type: 'hub' }) {
  state.playback = { lines, index: 0, shown: false, after };
  save();
  return continuePlayback();
}

async function continuePlayback() {
  const run = ++playbackRun;
  const playback = state.playback;
  controls.replaceChildren();
  while (playback.index < playback.lines.length) {
    if (run !== playbackRun) return;
    const line = playback.lines[playback.index];
    if (typeof line === 'string') {
      if (!playback.shown) {
        dimOld();
        const { node, text } = textLine(line);
        state.history.push({ raw: line });
        playback.shown = true;
        save();
        await typeInto(node, text);
        if (run !== playbackRun) return;
      }
      await waitClick();
    }
    else if (line.clue) gainClue(line.clue);
    else if (line.title) await chapterCard(line.title, line.sub, run);
    if (run !== playbackRun) return;
    playback.index += 1;
    playback.shown = false;
    save();
  }
  state.playback = null;
  finishPlayback(playback.after);
}

function finishPlayback(after) {
  if (after.type === 'scene') return finishScene(after.id);
  if (after.type === 'action' && !state.done.includes(after.key)) state.done.push(after.key);
  if (after.type === 'presentation' && !state.presented.includes(after.key)) state.presented.push(after.key);
  if (after.type === 'answer') {
    if (after.correct) { state.q = after.q + 1; state.testimonyDraft = null; state.linkDraft = null; state.answerDraft = null; save(); return askQuestion(); }
    save();
    return renderAnswers(DEDUCTIONS[state.ded].questions[state.q]);
  }
  save();
  renderHub();
}

// ---------------- 线索 ----------------
function gainClue(id) {
  if (has(id)) return;
  state.clues.push(id);
  const confirmed = state.findings.filter((f) => f.kind === 'link' && f.status === 'pending' && f.confirmWith === id);
  confirmed.forEach((f) => { f.status = 'confirmed'; });
  addLine('sys', `◆ 获得线索：${CLUES[id].name}`);
  for (const f of confirmed) addLine('breakthrough', `◆ 推测得到印证 · ${f.title}\n${f.confirmedText}\n推理记录已更新`);
  toast(`获得线索：${CLUES[id].name}`);
  updateTopbar();
  save();
}

let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

let notebookResolve = null;
let notebookTab = 'clues';

const presentationKey = (hub, person, clue) => `${hub}:${person}:${clue}`;

function renderClues(list, selecting, { onlyPinned = false, person = null, redraw } = {}) {
  const search = $('nb-search').value.trim().toLocaleLowerCase();
  const category = $('nb-type').value;
  const ids = state.clues.filter((id) => {
    const clue = CLUES[id];
    return (!onlyPinned || state.pinnedClues.includes(id)) && (!category || clue.type === category) && (!search || `${clue.name} ${clue.type} ${clue.text}`.toLocaleLowerCase().includes(search));
  });
  $('nb-count').textContent = `显示 ${ids.length} / ${state.clues.length} 条已获得的线索`;
  if (!ids.length) list.appendChild(el('p', 'empty', state.clues.length ? (onlyPinned ? '当前没有匹配的已标记线索。关闭「只看标记」可查看其他线索。' : '没有匹配的线索，试试其他关键词或类别。') : '还没有任何线索。'));
  for (const id of ids) {
    const c = CLUES[id];
    const item = el('div', 'clue');
    const head = el('div', 'clue-head');
    head.append(el('span', 'clue-type', c.type), el('span', 'clue-name', c.name));
    const actions = el('div', 'clue-actions');
    const pinned = state.pinnedClues.includes(id);
    const pin = el('button', 'tool clue-pin', pinned ? '★ 已标记' : '☆ 标记');
    pin.dataset.pin = id;
    pin.setAttribute('aria-pressed', String(pinned));
    pin.setAttribute('aria-label', `${pinned ? '取消标记' : '标记'}线索：${c.name}`);
    pin.addEventListener('click', () => {
      if (pinned) state.pinnedClues = state.pinnedClues.filter((c) => c !== id);
      else state.pinnedClues.push(id);
      save();
      const scroll = list.scrollTop;
      redraw();
      list.scrollTop = scroll;
      const target = [...list.querySelectorAll('[data-pin]')].find((b) => b.dataset.pin === id);
      (target ?? $('nb-marked')).focus({ preventScroll: true });
    });
    actions.appendChild(pin);
    const seen = person && state.presented.includes(presentationKey(state.hub, person.id, id));
    if (selecting) {
      const b = el('button', 'present', seen ? '再次出示' : '出示');
      b.dataset.clue = id;
      b.addEventListener('click', () => closeNotebook(id));
      actions.appendChild(b);
    }
    head.appendChild(actions);
    item.append(head, el('p', 'clue-text', c.text));
    if (seen) item.appendChild(el('p', 'clue-seen', `本轮调查已向${person.name}出示过，可再次核对。`));
    list.appendChild(item);
  }
}

// 人物档案：每条记录在拿到对应线索后解锁
function renderProfiles(list) {
  for (const p of Object.values(PROFILES)) {
    const entries = p.entries.filter((e) => hasAll(e.requires));
    if (!entries.length) continue;
    const item = el('div', 'clue');
    const head = el('div', 'clue-head');
    head.append(el('span', 'clue-name', p.name), el('span', 'profile-role', p.role));
    item.appendChild(head);
    for (const e of entries) item.appendChild(el('p', 'clue-text', e.text));
    list.appendChild(item);
  }
}

function renderFindings(list) {
  if (!state.findings.length) list.appendChild(el('p', 'empty', '还没有推理记录。成立的质疑、你联结的线索与推测会留在这里。'));
  for (const finding of state.findings) {
    const item = el('article', 'clue finding');
    item.dataset.finding = finding.id;
    item.appendChild(el('strong', 'clue-name', finding.title));
    if (finding.kind === 'link') {
      const confirmed = finding.status === 'confirmed';
      item.append(el('p', 'finding-evidence', `${confirmed ? '已印证的联结' : '待核实的推测'} · ${finding.clues.map((id) => CLUES[id].name).join(' ＋ ')}`), el('p', 'clue-text', confirmed ? finding.confirmedText : finding.text));
    } else {
      item.append(el('p', 'clue-text', `待核实的陈述：${finding.statement}`), el('p', 'finding-evidence', `对应证据：${CLUES[finding.clue].name}`), el('p', 'clue-text', finding.text));
    }
    list.appendChild(item);
  }
}

function openNotebook(selectHint, { person = null } = {}) {
  if (!state || !openModal('notebook')) return Promise.resolve(null);
  let onlyPinned = false;
  $('nb-search').value = '';
  $('nb-type').replaceChildren(el('option', null, '全部类别'));
  $('nb-type').firstElementChild.value = '';
  for (const type of new Set(state.clues.map((id) => CLUES[id].type))) {
    const option = el('option', null, type);
    option.value = type;
    $('nb-type').appendChild(option);
  }
  const draw = () => {
    const list = $('nb-list');
    list.replaceChildren();
    $('nb-hint').textContent = selectHint ?? '';
    const tabs = $('nb-tabs');
    tabs.classList.toggle('hidden', Boolean(selectHint));
    $('nb-filters').classList.toggle('hidden', !selectHint && notebookTab !== 'clues');
    $('nb-marked').setAttribute('aria-pressed', String(onlyPinned));
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.nbtab === notebookTab));
    if (selectHint || notebookTab === 'clues') renderClues(list, Boolean(selectHint), { onlyPinned, person, redraw: draw });
    else if (notebookTab === 'people') renderProfiles(list);
    else renderFindings(list);
    list.scrollTop = 0;
  };
  $('nb-search').oninput = draw;
  $('nb-type').onchange = draw;
  $('nb-marked').onclick = () => { onlyPinned = !onlyPinned; draw(); };
  $('nb-tabs').onclick = (e) => {
    const t = e.target.dataset?.nbtab;
    if (t) { notebookTab = t; draw(); }
  };
  draw();
  return new Promise((r) => { notebookResolve = r; });
}
function closeNotebook(result) {
  closeModal();
  if (notebookResolve) { const r = notebookResolve; notebookResolve = null; r(result); }
}
$('nb-close').addEventListener('click', () => closeNotebook(null));
$('notebook').addEventListener('click', (e) => { if (e.target.id === 'notebook') closeNotebook(null); });
$('btn-notebook').addEventListener('click', () => openNotebook());

// ---------------- 覆盖层 ----------------
async function chapterCard(title, sub, run) {
  state.chapter = `${title}　${sub ?? ''}`;
  state.when = '';
  updateTopbar();
  $('card-title').textContent = title;
  $('card-sub').textContent = sub ?? '';
  $('card').classList.add('show');
  await sleep(2200);
  if (run !== playbackRun) return;
  $('card').classList.remove('show');
  await sleep(500);
  if (run !== playbackRun) return;
  followLog = true;
  log.replaceChildren();
  state.logStart = state.history.length;
  addLine('divider', `${title}　${sub ?? ''}`);
}

function updateTopbar() {
  $('clue-count').textContent = state.clues.length;
  const hub = state.hub && HUBS[state.hub];
  $('chapter-label').textContent = state.chapter || hub?.chapter || '第七间教室';
  $('when-label').textContent = state.chapter ? state.when : (hub?.when ?? '');
}

// ---------------- 场景 ----------------
function runScene(id) {
  Object.assign(state, { mode: 'scene', scene: id, sceneComplete: false });
  soundtrack.setCue(musicCueFor(state));
  save();
  const s = SCENES[id];
  return play(s.lines, { type: 'scene', id });
}

function finishScene(id) {
  state.sceneComplete = true;
  save();
  const s = SCENES[id];
  if (s.next) return runScene(s.next);
  if (s.hub) return enterHub(s.hub);
  if (s.deduction) return enterDeduction(s.deduction);
  if (s.choices) return showChoices(s.choices);
  if (s.ending) return showEnding(s.ending);
}

function showChoices(choices) {
  controls.replaceChildren();
  choices.forEach((c, i) => {
    const b = el('button', 'btn', c.text);
    b.dataset.choice = i;
    b.addEventListener('click', () => runScene(c.to));
    controls.appendChild(b);
  });
  settle();
}

// ---------------- 调查 ----------------
function enterHub(id) {
  Object.assign(state, { mode: 'hub', hub: id, hubTab: 'loc', hubSel: null, chapter: HUBS[id].chapter, when: HUBS[id].when });
  soundtrack.setCue(musicCueFor(state));
  save();
  updateTopbar();
  dimOld();
  addLine('sys', HUBS[id].intro);
  renderHub();
}

function actionButton(label, note, done, onClick, data) {
  const b = el('button', `btn${done ? ' done' : ''}`, label);
  if (note) b.appendChild(el('span', 'note', note));
  Object.assign(b.dataset, data);
  b.addEventListener('click', onClick);
  return b;
}

function doAction(key, lines) {
  return play(lines, { type: 'action', key });
}

async function present(person) {
  const hub = state.hub;
  const id = await openNotebook(`向${person.name}出示哪条线索？`, { person });
  if (!id || state.mode !== 'hub' || state.hub !== hub) return;
  dimOld();
  addLine('sys', `▷ 向${person.name}出示：${CLUES[id].name}`);
  const reaction = person.present?.[id] ?? [`【${person.name}】……这个，和我有什么关系吗？`];
  return play(reaction, { type: 'presentation', key: presentationKey(hub, person.id, id) });
}

function renderHub() {
  const hub = HUBS[state.hub];
  controls.replaceChildren();

  const tabs = el('div', 'tabs');
  for (const [key, label] of [['loc', '地点'], ['people', '人物']]) {
    const t = el('button', state.hubTab === key ? 'on' : '', label);
    t.dataset.tab = key;
    t.addEventListener('click', () => { state.hubTab = key; state.hubSel = null; save(); renderHub(); });
    tabs.appendChild(t);
  }
  controls.appendChild(tabs);

  const group = state.hubTab === 'loc' ? hub.locations : hub.people;
  const sel = group.find((g) => g.id === state.hubSel);

  if (!sel) {
    const grid = el('div', 'grid');
    for (const g of group) {
      const entries = state.hubTab === 'loc' ? g.items : g.talks;
      const avail = entries.filter((x) => hasAll(x.requires));
      const allDone = avail.length > 0 && avail.every((x) => state.done.includes(`${state.hub}:${x.id}`));
      const status = allDone ? (state.hubTab === 'people' ? '话题已问完 · 仍可出示线索' : '当前可用项目已查看') : '';
      const note = avail.length ? [g.note ?? g.role, status].filter(Boolean).join(' · ') : '还没有头绪';
      const b = actionButton(g.name, note, allDone, () => { state.hubSel = g.id; save(); renderHub(); }, { target: g.id });
      b.disabled = !avail.length && !(state.hubTab === 'people' && state.clues.length);
      grid.appendChild(b);
    }
    controls.appendChild(grid);
  } else {
    const head = el('div', 'sub-head');
    head.appendChild(el('span', null, `${sel.name}　${sel.note ?? sel.role}`));
    const back = el('button', null, '← 返回');
    back.dataset.back = '1';
    back.addEventListener('click', () => { state.hubSel = null; save(); renderHub(); });
    head.appendChild(back);
    controls.appendChild(head);

    const entries = state.hubTab === 'loc' ? sel.items : sel.talks;
    const grid = el('div', 'grid');
    for (const x of entries) {
      if (!hasAll(x.requires)) continue;
      const key = `${state.hub}:${x.id}`;
      const label = state.hubTab === 'loc' ? `调查：${x.name}` : `询问：${x.name}`;
      grid.appendChild(actionButton(label, x.optional ? '补充了解 · 不影响进入推理' : null, state.done.includes(key), () => doAction(key, x.lines), { action: x.id }));
    }
    if (state.hubTab === 'people') {
      const count = state.presented.filter((key) => key.startsWith(`${state.hub}:${sel.id}:`)).length;
      grid.appendChild(actionButton('出示线索…', count ? `本轮已出示 ${count} 条 · 可在线索本里核对` : null, false, () => present(sel), { present: sel.id }));
    }
    controls.appendChild(grid);
    if (state.hubTab === 'people') controls.appendChild(el('p', 'goal', '询问之外，也可以向对方出示线索，核对证词或追问。'));
  }

  const need = hub.goal.requires;
  const got = need.filter(has).length;
  if (got === need.length) {
    // goal 可以通往推理，也可以直接通往下一段剧情
    const b = el('button', 'btn primary', hub.goal.label ?? '整理线索，开始推理');
    b.dataset.goal = '1';
    b.addEventListener('click', () => (hub.goal.deduction ? enterDeduction(hub.goal.deduction) : runScene(hub.goal.scene)));
    controls.appendChild(b);
  } else {
    controls.appendChild(el('p', 'goal', `${hub.goal.deduction ? '推理所需的' : '需要找到的'}关键线索：${got} / ${need.length}`));
    const help = el('div', 'investigation-help');
    const button = el('button', 'tool', '调查没有进展？');
    button.dataset.hint = '1';
    button.addEventListener('click', () => {
      const pending = [...hub.locations.flatMap((g) => g.items), ...hub.people.flatMap((g) => g.talks)].some((x) => hasAll(x.requires) && !state.done.includes(`${state.hub}:${x.id}`));
      const text = pending ? '【宋小满】先看看地点和人物里还有没有未读的项目。新拿到的线索，也可能让之前的话题有了新的进展。' : '【宋小满】话问完了，也能再拿证据去核对。进入人物页面，试试「出示线索」，对照已经听过的证词。';
      help.querySelector('p')?.remove();
      help.appendChild(el('p', null, text));
    });
    help.appendChild(button);
    controls.appendChild(help);
  }
  settle();
}

// ---------------- 推理 ----------------
async function enterDeduction(id) {
  Object.assign(state, { mode: 'deduction', ded: id, q: 0, testimonyDraft: null, linkDraft: null, answerDraft: null });
  soundtrack.setCue(musicCueFor(state));
  save();
  dimOld();
  addLine('divider', DEDUCTIONS[id].title);
  askQuestion();
}

function askQuestion() {
  const d = DEDUCTIONS[state.ded];
  const q = d.questions[state.q];
  if (!q) return runScene(d.done);
  dimOld();
  const p = addLine('question');
  p.appendChild(el('small', null, `问题 ${state.q + 1} / ${d.questions.length}`));
  p.appendChild(document.createTextNode(q.q));
  state.history.push({ cls: 'question', label: `问题 ${state.q + 1} / ${d.questions.length}`, text: q.q });
  save();
  renderAnswers(q);
}

function renderAnswers(q) {
  controls.replaceChildren();
  if (q.testimony) renderTestimony(q);
  else if (q.link) renderLink(q);
  else if (q.order) renderOrder(q);
  else if (q.multi) renderMulti(q);
  else if (q.options) {
    q.options.forEach((text, i) => {
      const b = el('button', 'btn', text);
      b.dataset.option = i;
      // answer: 'any' 表示没有对错，每个选项有自己的回应
      const correct = q.answer === 'any' || i === q.answer;
      b.addEventListener('click', () => answer(q, correct, b, text, q.replies?.[i]));
      controls.appendChild(b);
    });
  } else {
    const b = el('button', 'btn primary', '从线索本中出示证据');
    b.dataset.evidence = '1';
    b.addEventListener('click', async () => {
      const id = await openNotebook('出示能回答这个问题的证据。');
      if (id) answer(q, q.clue.includes(id), b, `出示：${CLUES[id].name}`);
    });
    controls.appendChild(b);
  }
  settle();
}

// 先选陈述，再提交证据；仅选中或切换陈述不判错，也不泄露哪句有问题。
function renderTestimony(q) {
  const t = q.testimony;
  let draft = state.testimonyDraft;
  if (!draft || draft.ded !== state.ded || draft.q !== state.q) {
    draft = state.testimonyDraft = { ded: state.ded, q: state.q, selected: null, hints: 0 };
    save();
  }
  const source = el('p', 'testimony-source', t.source);
  const group = el('div', 'testimony-statements');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', '选择需要质疑的一句');
  t.statements.forEach((text, i) => {
    const b = el('button', 'btn testimony-statement', `${i + 1}. ${text}`);
    b.dataset.statement = i;
    b.classList.toggle('picked', draft.selected === i);
    b.setAttribute('aria-pressed', String(draft.selected === i));
    b.addEventListener('click', () => {
      draft.selected = i;
      save();
      renderAnswers(q);
      controls.querySelector(`[data-statement="${i}"]`).focus({ preventScroll: true });
    });
    group.appendChild(b);
  });
  const status = el('p', 'testimony-status', draft.selected == null ? '先选一句，再用线索本里的证据质疑。选句可以随时更换。' : `已选中第 ${draft.selected + 1} 句。出示证据后才会提交质疑。`);
  status.setAttribute('aria-live', 'polite');
  const evidence = el('button', 'btn primary', '出示证据，质疑这句话');
  evidence.dataset.evidence = '1';
  evidence.disabled = draft.selected == null;
  evidence.addEventListener('click', async () => {
    const selected = draft.selected;
    const id = await openNotebook(`质疑第 ${selected + 1} 句：${t.statements[selected]}`);
    if (!id || state.mode !== 'deduction' || state.ded !== draft.ded || state.q !== draft.q || state.playback) return;
    const correctStatement = selected === t.answer;
    const correct = correctStatement && t.clue.includes(id);
    answer(q, correct, evidence, `质疑「${t.statements[selected]}」 · 出示：${CLUES[id].name}`, undefined, {
      findingClue: correct ? id : null,
      wrong: correctStatement ? t.wrongEvidence : t.wrongStatement,
    });
  });
  controls.append(source, group, status, evidence, reasoningHelp(q, draft, t.hints));
}

function reasoningHelp(q, draft, tips) {
  const help = el('div', 'testimony-help');
  const hint = el('button', 'tool', draft.hints ? '再提示一点（不扣评价）' : '思路提示（不扣评价）');
  hint.dataset.deductionHint = '1';
  hint.disabled = draft.hints >= tips.length;
  if (hint.disabled) hint.textContent = '思路提示已全部展开';
  hint.addEventListener('click', () => {
    draft.hints = Math.min(tips.length, draft.hints + 1);
    save();
    renderAnswers(q);
    const next = controls.querySelector('[data-deduction-hint]:not(:disabled), .testimony-hints');
    next.tabIndex = next.tagName === 'BUTTON' ? 0 : -1;
    next.focus({ preventScroll: true });
  });
  help.appendChild(hint);
  const hints = el('div', 'testimony-hints');
  hints.setAttribute('aria-live', 'polite');
  tips.slice(0, draft.hints).forEach((text) => hints.appendChild(el('p', null, text)));
  help.appendChild(hints);
  return help;
}

// 两条已获得线索的联结：顺序不限；选卡、取消和重选不计失误。
function renderLink(q) {
  let draft = state.linkDraft;
  if (!draft || draft.ded !== state.ded || draft.q !== state.q) {
    draft = state.linkDraft = { ded: state.ded, q: state.q, selected: [null, null], hints: 0 };
    save();
  }
  controls.appendChild(el('p', 'testimony-source', '线索联结 · 先提出推测'));
  const pair = el('div', 'link-pair');
  draft.selected.forEach((id, index) => {
    const clue = id && CLUES[id];
    const b = el('button', 'btn link-slot');
    b.dataset.linkSlot = index;
    b.append(el('small', 'note', `线索 ${index + 1}`), el('span', null, clue ? clue.name : '从线索本选择一条'), el('small', 'note', clue ? `${clue.type} · 点击可查看或更换` : '只使用你已经获得的线索'));
    b.addEventListener('click', async () => {
      const selected = await openNotebook(`选择第 ${index + 1} 条线索，与另一条一起核对。`);
      if (!selected || state.mode !== 'deduction' || state.ded !== draft.ded || state.q !== draft.q || state.playback) return;
      if (draft.selected.some((id, i) => i !== index && id === selected)) return toast('这条线索已经选入');
      draft.selected[index] = selected;
      save();
      renderAnswers(q);
      controls.querySelector(`[data-link-slot="${index}"]`).focus({ preventScroll: true });
    });
    pair.appendChild(b);
  });
  const reset = el('button', 'tool', '清空重选');
  reset.dataset.linkReset = '1';
  reset.addEventListener('click', () => {
    draft.selected = [null, null];
    save();
    renderAnswers(q);
    controls.querySelector('[data-link-slot]').focus({ preventScroll: true });
  });
  const confirm = el('button', 'btn primary', '联结这两条线索');
  confirm.dataset.confirm = '1';
  confirm.disabled = !draft.selected.every((id) => id && has(id)) || new Set(draft.selected).size !== 2;
  confirm.addEventListener('click', () => {
    const correct = q.link.clues.every((id) => draft.selected.includes(id));
    answer(q, correct, confirm, `联结：${draft.selected.map((id) => CLUES[id].name).join(' ＋ ')}`, undefined, { linkClues: correct ? [...draft.selected] : null });
  });
  controls.append(pair, el('p', 'testimony-status', '两条都选好后再提交。联结成立会先记为推测，等后续证据印证。'), reset, confirm, reasoningHelp(q, draft, q.link.hints));
}

function recordLink(q, clues) {
  const id = `${state.ded}:${state.q}`;
  if (state.findings.some((f) => f.id === id)) return;
  const finding = { id, kind: 'link', clues, ...q.link.finding, status: has(q.link.finding.confirmWith) ? 'confirmed' : 'pending' };
  state.findings.push(finding);
  addLine('breakthrough', `◆ 线索联结 · ${finding.title}\n${finding.status === 'pending' ? finding.text : finding.confirmedText}\n已记入线索本 · 推理记录`);
}

function recordFinding(q, clue) {
  const id = `${state.ded}:${state.q}`;
  if (state.findings.some((f) => f.id === id)) return;
  const t = q.testimony;
  state.findings.push({ id, ...t.finding, statement: t.statements[t.answer], clue });
  addLine('breakthrough', `◆ 发现矛盾 · ${t.finding.title}\n${t.finding.text}\n已记入线索本 · 推理记录`);
}

function getAnswerDraft(q, kind) {
  const count = (q.order ?? q.multi).length;
  const valid = (items) => Array.isArray(items) && new Set(items).size === items.length && items.every((i) => Number.isInteger(i) && i >= 0 && i < count);
  const current = state.answerDraft;
  if (current?.ded === state.ded && current.q === state.q && current.kind === kind && valid(current.selected) && (kind !== 'order' || (valid(current.displayOrder) && current.displayOrder.length === count))) return current;
  const draft = { ded: state.ded, q: state.q, kind, selected: [] };
  if (kind === 'order') {
    draft.displayOrder = Array.from({ length: count }, (_, i) => i);
    for (let k = count - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [draft.displayOrder[k], draft.displayOrder[j]] = [draft.displayOrder[j], draft.displayOrder[k]];
    }
    if (draft.displayOrder.every((v, k) => v === k)) draft.displayOrder.push(draft.displayOrder.shift());
  }
  state.answerDraft = draft;
  save();
  return draft;
}

// 排序题：候选顺序与已排部分一同保存，可以撤回最后一步。
function renderOrder(q) {
  const draft = getAnswerDraft(q, 'order');
  const picked = draft.selected;
  const hint = el('p', 'goal');
  hint.dataset.answerStatus = '1';
  hint.setAttribute('aria-live', 'polite');
  const seq = el('ol', 'order-seq');
  const grid = el('div', 'grid');
  for (const i of draft.displayOrder) {
    const b = el('button', 'btn', q.order[i]);
    b.dataset.orderItem = i;
    b.addEventListener('click', () => {
      picked.push(i);
      update();
    });
    grid.appendChild(b);
  }
  const undo = el('button', 'btn', '撤回最后一步');
  undo.dataset.orderUndo = '1';
  undo.addEventListener('click', () => { picked.pop(); update(); });
  const reset = el('button', 'btn', '重新排列');
  reset.dataset.orderReset = '1';
  reset.addEventListener('click', () => { picked.length = 0; update(); });
  const confirm = el('button', 'btn primary', '确定');
  confirm.dataset.confirm = '1';
  confirm.addEventListener('click', () => {
    const correct = picked.every((v, k) => v === k);
    answer(q, correct, confirm, `排列：${picked.map((k) => k + 1).join(' → ')}`);
  });
  function update() {
    seq.replaceChildren(...picked.map((i) => el('li', null, q.order[i])));
    for (const b of grid.children) b.disabled = picked.includes(Number(b.dataset.orderItem));
    hint.textContent = `已排列 ${picked.length} / ${q.order.length} 项。按先后顺序点选，可撤回或重排。`;
    undo.disabled = reset.disabled = picked.length === 0;
    confirm.disabled = picked.length !== q.order.length;
    save();
    settle();
  }
  const edits = el('div', 'answer-edit-tools');
  edits.append(undo, reset);
  controls.append(hint, seq, grid, edits, confirm);
  update();
}

// 多选题：q.answer 为全部正确选项的序号
function renderMulti(q) {
  const draft = getAnswerDraft(q, 'multi');
  const picked = new Set(draft.selected);
  const status = el('p', 'goal');
  status.dataset.answerStatus = '1';
  status.setAttribute('aria-live', 'polite');
  controls.appendChild(status);
  q.multi.forEach((text, i) => {
    const b = el('button', 'btn check', text);
    b.dataset.option = i;
    b.addEventListener('click', () => {
      if (picked.has(i)) picked.delete(i); else picked.add(i);
      update();
    });
    controls.appendChild(b);
  });
  const confirm = el('button', 'btn primary', '确定');
  confirm.dataset.confirm = '1';
  confirm.addEventListener('click', () => {
    const correct = picked.size === q.answer.length && q.answer.every((i) => picked.has(i));
    answer(q, correct, confirm, `选择：${[...picked].sort().map((i) => q.multi[i]).join('、') || '（无）'}`);
  });
  const reset = el('button', 'btn', '清空重选');
  reset.dataset.multiReset = '1';
  reset.addEventListener('click', () => { picked.clear(); update(); });
  function update() {
    draft.selected = [...picked].sort((a, b) => a - b);
    for (const b of controls.querySelectorAll('[data-option]')) {
      const selected = picked.has(Number(b.dataset.option));
      b.classList.toggle('picked', selected);
      b.setAttribute('aria-pressed', String(selected));
    }
    status.textContent = `已选 ${picked.size} 项。可以多选，确认前可随时改选。`;
    confirm.disabled = reset.disabled = picked.size === 0;
    save();
  }
  controls.append(reset, confirm);
  update();
}

function answer(q, correct, button, label, reply, context = {}) {
  addLine('sys', `▷ ${label}`);
  if (correct) {
    if (context.findingClue) recordFinding(q, context.findingClue);
    if (context.linkClues) recordLink(q, context.linkClues);
    return play([...(reply ?? []), ...(q.right ?? [])], { type: 'answer', correct: true, q: state.q });
  } else {
    state.mistakes += 1;
    save();
    button.classList.add('shake');
    return play(context.wrong ?? q.wrong ?? [WRONG_LINES[state.mistakes % WRONG_LINES.length]], { type: 'answer', correct: false, q: state.q });
  }
}

// ---------------- 结局 ----------------
function rating(m) {
  if (m === 0) return '名侦探';
  if (m <= 3) return '敏锐的刑警';
  if (m <= 8) return '刑警';
  return '新人刑警';
}

function showEnding(ending) {
  state.completed = true;
  const endings = store.get(ENDINGS_KEY, []);
  if (!endings.includes(ending.name)) store.set(ENDINGS_KEY, [...endings, ending.name]);
  $('ending-name').textContent = ending.name;
  $('ending-sub').textContent = ending.sub;
  const stats = $('ending-stats');
  stats.replaceChildren();
  const total = Object.keys(CLUES).length;
  const linked = state.findings.filter((f) => f.kind === 'link').length;
  for (const [k, v] of [['收集线索', `${state.clues.length} / ${total}`], ['发现矛盾', `${state.findings.length - linked} 处`], ['线索联结', `${linked} 组`], ['推理失误', `${state.mistakes} 次`], ['评价', rating(state.mistakes)]]) {
    const row = el('div');
    row.append(`${k}：`, el('b', null, v));
    stats.appendChild(row);
  }
  store.set(SAVE_KEY, null);
  $('ending').classList.add('show');
}

// ---------------- 标题 / 启动 ----------------
function showTitle() {
  soundtrack.setCue('title');
  if (state) { if (!state.completed) save(); cancelPlayback(); }
  const saved = store.get(SAVE_KEY, null);
  $('btn-continue').classList.toggle('hidden', !saved);
  const summary = $('resume-summary');
  summary.classList.toggle('hidden', !saved);
  summary.textContent = '';
  if (saved) {
    const chapter = saved.chapter || (saved.mode === 'hub' && HUBS[saved.hub]?.chapter) || '已有调查进度';
    const mode = { hub: '调查中', deduction: '推理中', scene: '阅读中' }[saved.mode] || '';
    const count = Array.isArray(saved.clues) ? new Set(saved.clues.filter((id) => CLUES[id])).size : 0;
    summary.textContent = `${chapter}${mode ? ` · ${mode}` : ''}\n已收集 ${count} 条线索 · 进度保存在当前浏览器`;
  }
  const endings = store.get(ENDINGS_KEY, []);
  $('endings-got').textContent = endings.length ? `已达成结局：${endings.join('、')}（共 2 个）` : '';
  $('title-screen').classList.add('show');
}

function resetView() {
  cancelPlayback();
  followLog = true;
  latestButton.classList.add('hidden');
  window.getSelection()?.removeAllRanges();
  if (activeModal === 'notebook') closeNotebook(null);
  else closeModal();
  log.replaceChildren();
  controls.replaceChildren();
}

function startNew() {
  state = freshState();
  resetView();
  updateTopbar();
  $('title-screen').classList.remove('show');
  $('log').focus();
  runScene(state.scene);
}

function resume() {
  state = { ...freshState(), ...store.get(SAVE_KEY, {}) };
  soundtrack.setCue(musicCueFor(state));
  resetView();
  updateTopbar();
  $('title-screen').classList.remove('show');
  $('log').focus();
  restoreLog();
  if (state.playback) continuePlayback();
  else if (state.mode === 'hub') {
    if (!state.history.length) addLine('sys', HUBS[state.hub].intro);
    renderHub();
  }
  else if (state.mode === 'deduction') {
    if (state.history.length && DEDUCTIONS[state.ded].questions[state.q]) renderAnswers(DEDUCTIONS[state.ded].questions[state.q]);
    else askQuestion();
  }
  else if (state.sceneComplete) finishScene(state.scene);
  else runScene(state.scene);
}

$('btn-new').addEventListener('click', () => {
  if (store.get(SAVE_KEY, null) && !FAST && !confirm('开始新的调查会覆盖当前进度，确定吗？')) return;
  startNew();
});
$('btn-continue').addEventListener('click', resume);
$('btn-menu').addEventListener('click', showTitle);
$('btn-title').addEventListener('click', () => { $('ending').classList.remove('show'); showTitle(); });

// 音乐和雨声共用一个音频上下文，分别控制音量；只在用户操作后启用声音。
const soundtrack = new MusicDirector({ enabled: settings.musicEnabled, volume: settings.musicVolume / 100, onChange: syncMusicUI });
const rain = new Rain($('rain'), () => soundtrack.getContext());
rain.start();
const soundBtn = $('btn-sound');
async function setSound(on) {
  if (on && !await soundtrack.unlock()) return;
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.textContent = on ? '关闭雨声' : '开启雨声';
  if (on) rain.soundOn(); else rain.soundOff();
}
soundBtn.addEventListener('click', () => setSound(soundBtn.getAttribute('aria-pressed') !== 'true'));

function syncMusicUI() {
  const s = soundtrack.status;
  const playing = s.enabled && s.unlocked && s.contextState === 'running' && !s.hidden;
  const text = s.error ? '音乐不可用' : playing ? '关闭音乐' : s.enabled ? '播放音乐' : '开启音乐';
  for (const id of ['btn-music', 'btn-title-music']) { $(id).textContent = text; $(id).setAttribute('aria-pressed', String(playing)); }
  $('music-status').textContent = s.error ? '当前浏览器暂时无法播放声音。你仍可继续阅读。' : !s.enabled ? '音乐已关闭，雨声可单独开启。' : !s.unlocked ? '点击开始调查或播放音乐后，配乐将随场景切换。' : s.hidden || s.contextState !== 'running' ? '音乐已暂停，回到游戏后继续。' : !s.volume ? '音乐音量为 0%，可拖动滑块调高。' : '音乐已开启，将随场景轻柔切换。';
  $('app').dataset.musicCue = s.cue;
  $('app').dataset.musicState = s.error ? 'unavailable' : !s.enabled || !s.volume ? 'muted' : playing ? 'playing' : 'paused';
}

async function toggleMusic() {
  if (settings.musicEnabled && (!soundtrack.unlocked || soundtrack.context?.state !== 'running')) { await soundtrack.unlock(); return; }
  settings.musicEnabled = !settings.musicEnabled;
  store.set(SETTINGS_KEY, settings);
  soundtrack.setEnabled(settings.musicEnabled);
  if (settings.musicEnabled) await soundtrack.unlock();
}
for (const id of ['btn-music', 'btn-title-music']) $(id).addEventListener('click', toggleMusic);
$('music-volume').addEventListener('input', (e) => {
  settings.musicVolume = Number(e.target.value);
  store.set(SETTINGS_KEY, settings);
  applySettings();
  soundtrack.setVolume(settings.musicVolume / 100);
});
const unlockAudio = (e) => {
  if (e?.target.closest('#btn-music, #btn-title-music')) return;
  if (settings.musicEnabled || soundBtn.getAttribute('aria-pressed') === 'true') void soundtrack.unlock();
};
document.addEventListener('pointerdown', unlockAudio, { capture: true });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') unlockAudio(e); }, { capture: true });
document.addEventListener('visibilitychange', () => soundtrack.setHidden(document.hidden));
syncMusicUI();
showTitle();
