// 文字推理游戏引擎：剧情播放、调查（地点 / 人物 / 出示线索）、推理问答、存档。
import { START, CLUES, PROFILES, SCENES, HUBS, DEDUCTIONS, WRONG_LINES } from './story.js';
import { Rain } from './rain.js';

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
const freshState = () => ({ version: 2, mode: 'scene', scene: START, hub: null, ded: null, q: 0, clues: [], done: [], mistakes: 0, hubTab: 'loc', hubSel: null, history: [], logStart: 0, playback: null, chapter: '', when: '' });
const save = () => store.set(SAVE_KEY, state);
const has = (id) => state.clues.includes(id);
const hasAll = (ids = []) => ids.every(has);

// ---------------- 文本输出 ----------------
const log = $('log');
const controls = $('controls');
const nextHint = $('next-hint');
let typing = null;   // 正在打字的行：{ finish }
let waiting = null;  // 等待玩家点击继续的 resolve
let playbackRun = 0;
let activeModal = null;
let modalFocus = null;
const savedSettings = store.get(SETTINGS_KEY, {});
const settings = {
  typeMs: [0, 16, 32, 60].includes(savedSettings.typeMs) ? savedSettings.typeMs : 32,
  fontSize: [0, 16, 18, 20, 22].includes(savedSettings.fontSize) ? savedSettings.fontSize : 0,
};

function advance() {
  if (activeModal || ['title-screen', 'card', 'ending'].some((id) => $(id).classList.contains('show'))) return;
  if (typing) typing.finish();
  else if (waiting) { const w = waiting; waiting = null; w(); }
}
log.addEventListener('click', advance);
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
}
applySettings();
for (const [id, key] of [['setting-speed', 'typeMs'], ['setting-size', 'fontSize']]) {
  $(id).addEventListener('change', (e) => { settings[key] = Number(e.target.value); store.set(SETTINGS_KEY, settings); applySettings(); });
}
for (const id of ['btn-settings', 'btn-title-settings']) $(id).addEventListener('click', () => openModal('settings'));
$('settings-close').addEventListener('click', closeModal);
for (const id of ['history', 'settings']) $(id).addEventListener('click', (e) => { if (e.target.id === id) closeModal(); });

function dimOld() {
  log.querySelectorAll('.line:not(.old)').forEach((n) => n.classList.add('old'));
}

function scrollDown() { log.scrollTop = log.scrollHeight; }
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
    if (!typeMs) { node.textContent = text; resolve(); return; }
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
  if (after.type === 'answer') {
    if (after.correct) { state.q = after.q + 1; save(); return askQuestion(); }
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
  addLine('sys', `◆ 获得线索：${CLUES[id].name}`);
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

function renderClues(list, selecting) {
  const search = $('nb-search').value.trim().toLocaleLowerCase();
  const category = $('nb-type').value;
  const ids = state.clues.filter((id) => {
    const clue = CLUES[id];
    return (!category || clue.type === category) && (!search || `${clue.name} ${clue.type} ${clue.text}`.toLocaleLowerCase().includes(search));
  });
  $('nb-count').textContent = `显示 ${ids.length} / ${state.clues.length} 条已获得的线索`;
  if (!ids.length) list.appendChild(el('p', 'empty', state.clues.length ? '没有匹配的线索，试试其他关键词或类别。' : '还没有任何线索。'));
  for (const id of ids) {
    const c = CLUES[id];
    const item = el('div', 'clue');
    const head = el('div', 'clue-head');
    head.append(el('span', 'clue-type', c.type), el('span', 'clue-name', c.name));
    if (selecting) {
      const b = el('button', 'present', '出示');
      b.dataset.clue = id;
      b.addEventListener('click', () => closeNotebook(id));
      head.appendChild(b);
    }
    item.append(head, el('p', 'clue-text', c.text));
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

function openNotebook(selectHint) {
  if (!state || !openModal('notebook')) return Promise.resolve(null);
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
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.nbtab === notebookTab));
    if (selectHint || notebookTab === 'clues') renderClues(list, Boolean(selectHint));
    else renderProfiles(list);
    list.scrollTop = 0;
  };
  $('nb-search').oninput = draw;
  $('nb-type').onchange = draw;
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
  const id = await openNotebook(`向${person.name}出示哪条线索？`);
  if (!id) return;
  dimOld();
  addLine('sys', `▷ 向${person.name}出示：${CLUES[id].name}`);
  const reaction = person.present?.[id] ?? [`【${person.name}】……这个，和我有什么关系吗？`];
  return play(reaction);
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
      grid.appendChild(actionButton('出示线索…', null, false, () => present(sel), { present: sel.id }));
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
  Object.assign(state, { mode: 'deduction', ded: id, q: 0 });
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
  if (q.order) renderOrder(q);
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

// 排序题：q.order 按正确顺序书写，显示时打乱
function renderOrder(q) {
  const picked = [];
  const hint = el('p', 'goal', '按发生的先后顺序，依次点选。');
  const seq = el('ol', 'order-seq');
  const grid = el('div', 'grid');
  const shuffled = q.order.map((text, i) => ({ text, i }));
  do {
    for (let k = shuffled.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]];
    }
  } while (shuffled.every((x, k) => x.i === k)); // 别恰好是正确顺序
  for (const { text, i } of shuffled) {
    const b = el('button', 'btn', text);
    b.dataset.orderItem = i;
    b.addEventListener('click', () => {
      picked.push(i);
      b.disabled = true;
      seq.appendChild(el('li', null, text));
      confirm.disabled = picked.length !== q.order.length;
      settle();
    });
    grid.appendChild(b);
  }
  const reset = el('button', 'btn', '重新排列');
  reset.addEventListener('click', () => renderAnswers(q));
  const confirm = el('button', 'btn primary', '确定');
  confirm.dataset.confirm = '1';
  confirm.disabled = true;
  confirm.addEventListener('click', () => {
    const correct = picked.every((v, k) => v === k);
    answer(q, correct, confirm, `排列：${picked.map((k) => k + 1).join(' → ')}`);
  });
  controls.append(hint, seq, grid, reset, confirm);
}

// 多选题：q.answer 为全部正确选项的序号
function renderMulti(q) {
  const picked = new Set();
  controls.appendChild(el('p', 'goal', '选出所有符合的选项，然后点「确定」。'));
  q.multi.forEach((text, i) => {
    const b = el('button', 'btn check', text);
    b.dataset.option = i;
    b.addEventListener('click', () => {
      if (picked.has(i)) picked.delete(i); else picked.add(i);
      b.classList.toggle('picked', picked.has(i));
    });
    controls.appendChild(b);
  });
  const confirm = el('button', 'btn primary', '确定');
  confirm.dataset.confirm = '1';
  confirm.addEventListener('click', () => {
    const correct = picked.size === q.answer.length && q.answer.every((i) => picked.has(i));
    answer(q, correct, confirm, `选择：${[...picked].sort().map((i) => q.multi[i]).join('、') || '（无）'}`);
  });
  controls.appendChild(confirm);
}

function answer(q, correct, button, label, reply) {
  addLine('sys', `▷ ${label}`);
  if (correct) {
    return play([...(reply ?? []), ...(q.right ?? [])], { type: 'answer', correct: true, q: state.q });
  } else {
    state.mistakes += 1;
    save();
    button.classList.add('shake');
    return play(q.wrong ?? [WRONG_LINES[state.mistakes % WRONG_LINES.length]], { type: 'answer', correct: false, q: state.q });
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
  for (const [k, v] of [['收集线索', `${state.clues.length} / ${total}`], ['推理失误', `${state.mistakes} 次`], ['评价', rating(state.mistakes)]]) {
    const row = el('div');
    row.append(`${k}：`, el('b', null, v));
    stats.appendChild(row);
  }
  store.set(SAVE_KEY, null);
  $('ending').classList.add('show');
}

// ---------------- 标题 / 启动 ----------------
function showTitle() {
  if (state) { if (!state.completed) save(); cancelPlayback(); }
  const saved = store.get(SAVE_KEY, null);
  $('btn-continue').classList.toggle('hidden', !saved);
  const endings = store.get(ENDINGS_KEY, []);
  $('endings-got').textContent = endings.length ? `已达成结局：${endings.join('、')}（共 2 个）` : '';
  $('title-screen').classList.add('show');
}

function resetView() {
  cancelPlayback();
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

// 雨：画面一直有，声音默认关闭，由玩家开启
const rain = new Rain($('rain'));
rain.start();
const soundBtn = $('btn-sound');
function setSound(on) {
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.textContent = on ? '关闭雨声' : '开启雨声';
  if (on) rain.soundOn(); else rain.soundOff();
}
soundBtn.addEventListener('click', () => setSound(soundBtn.getAttribute('aria-pressed') !== 'true'));

showTitle();
