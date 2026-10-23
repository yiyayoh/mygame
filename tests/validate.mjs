// 剧本数据静态校验：引用是否存在，以及按流程推进时每一章的关键线索是否都拿得到。
// 用法：node tests/validate.mjs
import { START, CLUES, PROFILES, SCENES, HUBS, DEDUCTIONS } from '../js/story.js';
import { MUSIC_SCORES, MUSIC_CUES } from '../js/music.js';

const errors = [];
const err = (msg) => errors.push(msg);
const clueRef = (id, where) => { if (!CLUES[id]) err(`${where}: 未定义的线索 ${id}`); };
const linesRef = (lines, where) => lines.forEach((l) => typeof l === 'object' && l.clue && clueRef(l.clue, where));
const grants = (lines) => lines.filter((l) => typeof l === 'object' && l.clue).map((l) => l.clue);

for (const [kind, collection] of Object.entries({ scene: SCENES, hub: HUBS, deduction: DEDUCTIONS })) {
  for (const id of Object.keys(collection)) if (!MUSIC_SCORES[MUSIC_CUES[kind][id]]) err(`${kind}/${id}: 缺少有效配乐`);
  for (const id of Object.keys(MUSIC_CUES[kind])) if (!collection[id]) err(`${kind}/${id}: 配乐指向不存在的内容`);
}

for (const [id, s] of Object.entries(SCENES)) {
  linesRef(s.lines, `场景 ${id}`);
  if (s.next && !SCENES[s.next]) err(`场景 ${id}: next 指向不存在的场景 ${s.next}`);
  if (s.hub && !HUBS[s.hub]) err(`场景 ${id}: 不存在的调查 ${s.hub}`);
  if (s.deduction && !DEDUCTIONS[s.deduction]) err(`场景 ${id}: 不存在的推理 ${s.deduction}`);
  for (const c of s.choices ?? []) if (!SCENES[c.to]) err(`场景 ${id}: 选项指向不存在的场景 ${c.to}`);
}

for (const [id, h] of Object.entries(HUBS)) {
  for (const x of [...h.locations.flatMap((l) => l.items), ...h.people.flatMap((p) => p.talks)]) {
    linesRef(x.lines, `${id}/${x.id}`);
    (x.requires ?? []).forEach((c) => clueRef(c, `${id}/${x.id} requires`));
  }
  for (const p of h.people) {
    for (const [c, lines] of Object.entries(p.present ?? {})) { clueRef(c, `${id}/${p.id} present`); linesRef(lines, `${id}/${p.id} present`); }
  }
  h.goal.requires.forEach((c) => clueRef(c, `${id} goal`));
  if (h.goal.deduction ? !DEDUCTIONS[h.goal.deduction] : !SCENES[h.goal.scene]) err(`${id}: goal 指向不存在的推理或场景`);
}

for (const [id, d] of Object.entries(DEDUCTIONS)) {
  if (!SCENES[d.done]) err(`${id}: done 指向不存在的场景 ${d.done}`);
  d.questions.forEach((q, i) => {
    const where = `${id} 第${i + 1}题`;
    if (q.wrong) linesRef(q.wrong, `${where} wrong`);
    if (q.options && q.answer !== 'any' && !(q.answer >= 0 && q.answer < q.options.length)) err(`${where}: answer 越界`);
    if (q.answer === 'any' && q.replies && q.replies.length !== q.options.length) err(`${where}: replies 数量和选项不一致`);
    if (q.multi && !(q.answer.length && q.answer.every((a) => a >= 0 && a < q.multi.length))) err(`${where}: 多选题 answer 不合法`);
    if (q.order && q.order.length < 2) err(`${where}: 排序题至少要两项`);
    (q.clue ?? []).forEach((c) => clueRef(c, where));
    if (!q.options && !q.multi && !q.order && !q.clue?.length) err(`${where}: 没有可作答的内容`);
  });
}

// 沿主线模拟：在每个调查里反复执行所有可用的行动 / 出示，直到拿不到新线索
const owned = new Set();
const visited = new Set();
let scene = START;
while (scene && !visited.has(scene)) {
  visited.add(scene);
  const s = SCENES[scene];
  grants(s.lines).forEach((c) => owned.add(c));
  let dedId = s.deduction;
  if (s.hub) {
    const h = HUBS[s.hub];
    let grew = true;
    while (grew) {
      const before = owned.size;
      for (const x of [...h.locations.flatMap((l) => l.items), ...h.people.flatMap((p) => p.talks)]) {
        if ((x.requires ?? []).every((c) => owned.has(c))) grants(x.lines).forEach((c) => owned.add(c));
      }
      for (const p of h.people) {
        for (const [c, lines] of Object.entries(p.present ?? {})) if (owned.has(c)) grants(lines).forEach((g) => owned.add(g));
      }
      grew = owned.size > before;
    }
    const missing = h.goal.requires.filter((c) => !owned.has(c));
    if (missing.length) err(`${s.hub}: 关键线索无法取得 ${missing.join(', ')}`);
    dedId = h.goal.deduction;
    if (!dedId) { scene = h.goal.scene; continue; }
  }
  if (dedId) {
    const d = DEDUCTIONS[dedId];
    d.questions.forEach((q, i) => {
      if (q.clue && !q.clue.some((c) => owned.has(c))) err(`${dedId} 第${i + 1}题: 玩家此时没有可用的正确证据`);
    });
    scene = d.done;
  } else {
    scene = s.next ?? s.choices?.[0]?.to;
  }
}

for (const [id, p] of Object.entries(PROFILES)) p.entries.forEach((e) => e.requires.forEach((c) => clueRef(c, `档案 ${id}`)));

const unreachable = Object.keys(CLUES).filter((c) => !owned.has(c));
if (unreachable.length) err(`以下线索在主线中无法取得：${unreachable.join(', ')}`);

if (errors.length) {
  errors.forEach((e) => console.error('✗', e));
  process.exit(1);
}
console.log(`✓ 剧本校验通过：${Object.keys(SCENES).length} 个场景，${Object.keys(HUBS).length} 个调查，${Object.keys(DEDUCTIONS).length} 轮推理，${Object.keys(CLUES).length} 条线索`);
