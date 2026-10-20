// 文字推理游戏引擎：剧情播放、调查（地点 / 人物 / 出示线索）、推理问答、存档。
import { START, CLUES, SCENES, HUBS, DEDUCTIONS, WRONG_LINES } from './story.js';
import { Rain } from './rain.js';

const FAST = new URLSearchParams(location.search).has('fast'); // 自动化测试用：跳过打字和动画
const TYPE_MS = FAST ? 0 : 32;
const SAVE_KEY = 'seventh-classroom/save';
const ENDINGS_KEY = 'seventh-classroom/endings';

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
const freshState = () => ({ mode: 'scene', scene: START, hub: null, ded: null, q: 0, clues: [], done: [], mistakes: 0, hubTab: 'loc', hubSel: null });
const save = () => store.set(SAVE_KEY, state);
const has = (id) => state.clues.includes(id);
const hasAll = (ids = []) => ids.every(has);

// ---------------- 文本输出 ----------------
const log = $('log');
const controls = $('controls');
const nextHint = $('next-hint');
let typing = null;   // 正在打字的行：{ finish }
let waiting = null;  // 等待玩家点击继续的 resolve

function advance() {
  if (typing) typing.finish();
  else if (waiting) { const w = waiting; waiting = null; w(); }
}
log.addEventListener('click', advance);
nextHint.addEventListener('click', advance);
document.addEventListener('keydown', (e) => {
  if ($('notebook').classList.contains('show')) { if (e.key === 'Escape') closeNotebook(null); return; }
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advance(); }
});

function dimOld() {
  log.querySelectorAll('.line:not(.old)').forEach((n) => n.classList.add('old'));
}

function scrollDown() { log.scrollTop = log.scrollHeight; }
const settle = () => requestAnimationFrame(scrollDown);

function addLine(cls, text) {
  const p = el('p', `line ${cls}`);
  if (text != null) p.textContent = text;
  log.appendChild(p);
  scrollDown();
  return p;
}

function typeInto(node, text) {
  return new Promise((resolve) => {
    if (!TYPE_MS) { node.textContent = text; resolve(); return; }
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      node.textContent = text.slice(0, i);
      if (i % 8 === 0) scrollDown();
      if (i >= text.length) done();
    }, TYPE_MS);
    function done() { clearInterval(timer); node.textContent = text; typing = null; scrollDown(); resolve(); }
    typing = { finish: done };
  });
}

function waitClick() {
  nextHint.classList.remove('hidden');
  return new Promise((r) => { waiting = () => { nextHint.classList.add('hidden'); r(); }; });
}

async function sayLine(raw) {
  dimOld();
  const m = raw.match(/^【(.+?)】([\s\S]*)$/);
  let node;
  if (m) {
    const [, who, text] = m;
    const cls = ['say', who === '我' ? 'me' : '', who.includes('录音') ? 'recorded' : ''].join(' ');
    const p = addLine(cls);
    p.appendChild(el('span', 'who', who === '我' ? '夏川' : who));
    node = el('span', 'text');
    p.appendChild(node);
    await typeInto(node, text);
  } else {
    node = addLine('');
    await typeInto(node, raw);
  }
  await waitClick();
}

async function play(lines = []) {
  controls.replaceChildren();
  for (const line of lines) {
    if (typeof line === 'string') await sayLine(line);
    else if (line.clue) gainClue(line.clue);
    else if (line.title) await chapterCard(line.title, line.sub);
  }
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
function openNotebook(selectHint) {
  const list = $('nb-list');
  list.replaceChildren();
  $('nb-hint').textContent = selectHint ?? '';
  if (!state.clues.length) list.appendChild(el('p', 'empty', '还没有任何线索。'));
  for (const id of state.clues) {
    const c = CLUES[id];
    const item = el('div', 'clue');
    const head = el('div', 'clue-head');
    head.append(el('span', 'clue-type', c.type), el('span', 'clue-name', c.name));
    if (selectHint) {
      const b = el('button', 'present', '出示');
      b.dataset.clue = id;
      b.addEventListener('click', () => closeNotebook(id));
      head.appendChild(b);
    }
    item.append(head, el('p', 'clue-text', c.text));
    list.appendChild(item);
  }
  $('notebook').classList.add('show');
  return new Promise((r) => { notebookResolve = r; });
}
function closeNotebook(result) {
  $('notebook').classList.remove('show');
  if (notebookResolve) { const r = notebookResolve; notebookResolve = null; r(result); }
}
$('nb-close').addEventListener('click', () => closeNotebook(null));
$('notebook').addEventListener('click', (e) => { if (e.target.id === 'notebook') closeNotebook(null); });
$('btn-notebook').addEventListener('click', () => openNotebook());

// ---------------- 覆盖层 ----------------
async function chapterCard(title, sub) {
  $('card-title').textContent = title;
  $('card-sub').textContent = sub ?? '';
  $('card').classList.add('show');
  await sleep(2200);
  $('card').classList.remove('show');
  await sleep(500);
  log.replaceChildren();
  addLine('divider', `${title}　${sub ?? ''}`);
}

function updateTopbar() {
  $('clue-count').textContent = state.clues.length;
  const hub = state.hub && HUBS[state.hub];
  $('chapter-label').textContent = hub ? hub.chapter : '第七间教室';
  $('when-label').textContent = hub ? hub.when : '';
}

// ---------------- 场景 ----------------
async function runScene(id) {
  Object.assign(state, { mode: 'scene', scene: id });
  save();
  const s = SCENES[id];
  await play(s.lines);
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
  Object.assign(state, { mode: 'hub', hub: id, hubTab: 'loc', hubSel: null });
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

async function doAction(key, lines) {
  await play(lines);
  if (!state.done.includes(key)) state.done.push(key);
  save();
  renderHub();
}

async function present(person) {
  const id = await openNotebook(`向${person.name}出示哪条线索？`);
  if (!id) return;
  dimOld();
  addLine('sys', `▷ 向${person.name}出示：${CLUES[id].name}`);
  const reaction = person.present?.[id] ?? [`【${person.name}】……这个，和我有什么关系吗？`];
  await play(reaction);
  save();
  renderHub();
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
      const b = actionButton(g.name, avail.length ? (g.note ?? g.role) : '还没有头绪', allDone, () => { state.hubSel = g.id; save(); renderHub(); }, { target: g.id });
      b.disabled = !avail.length;
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
      grid.appendChild(actionButton(label, null, state.done.includes(key), () => doAction(key, x.lines), { action: x.id }));
    }
    if (state.hubTab === 'people') {
      grid.appendChild(actionButton('出示线索…', null, false, () => present(sel), { present: sel.id }));
    }
    controls.appendChild(grid);
  }

  const need = hub.goal.requires;
  const got = need.filter(has).length;
  if (got === need.length) {
    const b = el('button', 'btn primary', '整理线索，开始推理');
    b.dataset.goal = '1';
    b.addEventListener('click', () => enterDeduction(hub.goal.deduction));
    controls.appendChild(b);
  } else {
    controls.appendChild(el('p', 'goal', `推理所需的关键线索：${got} / ${need.length}`));
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
  renderAnswers(q);
}

function renderAnswers(q) {
  controls.replaceChildren();
  if (q.options) {
    q.options.forEach((text, i) => {
      const b = el('button', 'btn', text);
      b.dataset.option = i;
      b.addEventListener('click', () => answer(q, i === q.answer, b, text));
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

async function answer(q, correct, button, label) {
  addLine('sys', `▷ ${label}`);
  if (correct) {
    await play(q.right ?? []);
    state.q += 1;
    save();
    askQuestion();
  } else {
    state.mistakes += 1;
    save();
    button.classList.add('shake');
    await play([WRONG_LINES[state.mistakes % WRONG_LINES.length]]);
    renderAnswers(q);
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
  const saved = store.get(SAVE_KEY, null);
  $('btn-continue').classList.toggle('hidden', !saved);
  const endings = store.get(ENDINGS_KEY, []);
  $('endings-got').textContent = endings.length ? `已达成结局：${endings.join('、')}（共 2 个）` : '';
  $('title-screen').classList.add('show');
}

function resetView() {
  waiting = null;
  typing = null;
  nextHint.classList.add('hidden');
  log.replaceChildren();
  controls.replaceChildren();
}

function startNew() {
  state = freshState();
  resetView();
  updateTopbar();
  $('title-screen').classList.remove('show');
  runScene(state.scene);
}

function resume() {
  state = { ...freshState(), ...store.get(SAVE_KEY, {}) };
  resetView();
  updateTopbar();
  $('title-screen').classList.remove('show');
  addLine('sys', '—— 继续上次的调查 ——');
  if (state.mode === 'hub') renderHub();
  else if (state.mode === 'deduction') askQuestion();
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
  if (on) rain.soundOn(); else rain.soundOff();
}
soundBtn.addEventListener('click', () => setSound(soundBtn.getAttribute('aria-pressed') !== 'true'));

showTitle();
