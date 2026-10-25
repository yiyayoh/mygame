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
    if (x.optional && grants(x.lines).some((c) => h.goal.requires.includes(c))) err(`${id}/${x.id}: 补充项目不能发放本轮必需的关键线索`);
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
  if (d.review != null && typeof d.review !== 'boolean') err(`${id}: review 必须是布尔值`);
  d.questions.forEach((q, i) => {
    const where = `${id} 第${i + 1}题`;
    linesRef(q.right ?? [], `${where} right`);
    if (d.review && (q.testimony || q.link || grants(q.right ?? []).length || (q.replies ?? []).some((r) => grants(r).length))) err(`${where}: 可略过的回顾不能发放线索或推理发现`);
    if (q.wrong) linesRef(q.wrong, `${where} wrong`);
    if (q.options && q.answer !== 'any' && !(q.answer >= 0 && q.answer < q.options.length)) err(`${where}: answer 越界`);
    if (q.answer === 'any' && q.replies && q.replies.length !== q.options.length) err(`${where}: replies 数量和选项不一致`);
    if (q.multi && !(q.answer.length && q.answer.every((a) => a >= 0 && a < q.multi.length))) err(`${where}: 多选题 answer 不合法`);
    if (q.order && q.order.length < 2) err(`${where}: 排序题至少要两项`);
    (q.clue ?? []).forEach((c) => clueRef(c, where));
    if (q.testimony) {
      const t = q.testimony;
      if (q.options || q.multi || q.order || q.clue || q.link) err(`${where}: 证言对质不能与其他题型混用`);
      if (!Array.isArray(t.statements) || t.statements.length < 2 || t.statements.some((s) => typeof s !== 'string' || !s.trim())) err(`${where}: 证言至少要有两句非空陈述`);
      if (!Number.isInteger(t.answer) || t.answer < 0 || t.answer >= (t.statements?.length ?? 0)) err(`${where}: 证言 answer 越界`);
      if (!Array.isArray(t.clue) || !t.clue.length) err(`${where}: 证言缺少正确证据`);
      else t.clue.forEach((c) => clueRef(c, where));
      if (!t.source?.trim() || !t.finding?.title?.trim() || !t.finding?.text?.trim()) err(`${where}: 证言缺少来源或推理记录`);
      if (!Array.isArray(t.hints) || t.hints.length < 2 || t.hints.some((h) => typeof h !== 'string' || !h.trim())) err(`${where}: 证言需要至少两级思路提示`);
      for (const key of ['wrongStatement', 'wrongEvidence']) {
        if (!Array.isArray(t[key]) || !t[key].length) err(`${where}: 证言缺少 ${key} 反馈`);
        else linesRef(t[key], `${where} ${key}`);
      }
    }
    if (q.link) {
      const l = q.link;
      if (q.options || q.multi || q.order || q.clue || q.testimony) err(`${where}: 线索联结不能与其他题型混用`);
      if (!Array.isArray(l.clues) || l.clues.length !== 2 || new Set(l.clues).size !== 2) err(`${where}: 线索联结需要两条不同证据`);
      else l.clues.forEach((c) => clueRef(c, where));
      if (!Array.isArray(l.hints) || l.hints.length < 2 || l.hints.some((h) => typeof h !== 'string' || !h.trim())) err(`${where}: 线索联结需要两级提示`);
      if (!l.finding?.title?.trim() || !l.finding?.text?.trim() || !l.finding?.confirmedText?.trim()) err(`${where}: 线索联结缺少推测或印证记录`);
      clueRef(l.finding?.confirmWith, `${where} 印证证据`);
      if (l.clues?.includes(l.finding?.confirmWith)) err(`${where}: 印证证据不能是用于提出推测的证据`);
    }
    if (!q.options && !q.multi && !q.order && !q.clue?.length && !q.testimony && !q.link) err(`${where}: 没有可作答的内容`);
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
      const evidence = q.testimony?.clue ?? q.clue;
      if (evidence && !evidence.some((c) => owned.has(c))) err(`${dedId} 第${i + 1}题: 玩家此时没有可用的正确证据`);
      if (q.link?.clues?.some((c) => !owned.has(c))) err(`${dedId} 第${i + 1}题: 玩家此时没有联结所需的全部证据`);
      if (q.link && owned.has(q.link.finding.confirmWith)) err(`${dedId} 第${i + 1}题: 联结推测的印证证据已提前获得`);
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
