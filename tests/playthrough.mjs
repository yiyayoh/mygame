// 端到端测试：用 Playwright 在真实浏览器里从标题画面一路玩到结局。
// 会故意答错一次、中途刷新页面测试读档，并分别打通两个结局。
// 用法：node tests/playthrough.mjs [截图输出目录]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { DEDUCTIONS, HUBS } from '../js/story.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.argv[2];
const PORT = 8765;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch();
const errors = [];

async function playOnce(choiceIndex, { mobile = false } = {}) {
  const page = await browser.newPage(mobile ? { viewport: { width: 390, height: 844 } } : { viewport: { width: 1100, height: 800 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${PORT}/index.html?fast`);
  const shot = async (name) => {
    if (!SHOTS) return;
    await page.waitForTimeout(600); // 等淡入动画结束
    await page.screenshot({ path: join(SHOTS, `${choiceIndex}-${name}.png`) });
  };
  await shot('title');
  await page.click('#btn-new');

  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('seventh-classroom/save')));
  const presented = new Set();
  let wrongOnce = false;
  let reloaded = false;
  const shotTaken = new Set();

  for (let step = 0; step < 5000; step++) {
    if (await page.locator('#ending.show').count()) {
      await page.waitForTimeout(900);
      await shot('ending');
      const text = await page.locator('#ending').innerText();
      await page.close();
      return text;
    }
    if (await page.locator('#card.show').count()) { await page.waitForTimeout(50); continue; }
    if (await page.locator('#next-hint:not(.hidden)').count()) { await page.click('#log'); continue; }

    const choice = page.locator('[data-choice]');
    if (await choice.count()) { await shot('choice'); await choice.nth(choiceIndex).click(); continue; }

    const s = await state();
    if (s?.mode === 'deduction' && (await page.locator('[data-option], [data-evidence]').count())) {
      const q = DEDUCTIONS[s.ded].questions[s.q];
      if (!shotTaken.has(s.ded)) { shotTaken.add(s.ded); await shot(`deduction-${s.ded}`); }
      if (q.options) {
        if (!wrongOnce) { wrongOnce = true; await page.click(`[data-option="${(q.answer + 1) % q.options.length}"]`); continue; }
        await page.click(`[data-option="${q.answer}"]`);
      } else {
        await page.click('[data-evidence]');
        const id = q.clue.find((c) => s.clues.includes(c));
        await page.click(`#nb-list .present[data-clue="${id}"]`);
      }
      continue;
    }

    if (s?.mode === 'hub' && (await page.locator('[data-tab]').count())) {
      // 第二章开始时刷新一次，测试读档
      if (s.hub === 'hub2' && !reloaded) {
        reloaded = true;
        await page.reload();
        await page.click('#btn-continue');
        continue;
      }
      const hub = HUBS[s.hub];
      if (!shotTaken.has(s.hub)) { shotTaken.add(s.hub); await shot(`hub-${s.hub}`); }
      // 在当前列表里找一个没做过的行动
      const todo = page.locator('#controls .grid .btn:not(.done):not(:disabled)[data-action], #controls .grid .btn:not(.done):not(:disabled)[data-target]');
      if (await todo.count()) { await todo.first().click(); continue; }
      // 当前打开的人物：出示所有有反应的线索
      if (s.hubSel && s.hubTab === 'people') {
        const person = hub.people.find((p) => p.id === s.hubSel);
        const next = Object.keys(person.present ?? {}).find((c) => s.clues.includes(c) && !presented.has(`${s.hub}:${person.id}:${c}`));
        if (next) {
          presented.add(`${s.hub}:${person.id}:${next}`);
          await page.click(`[data-present="${person.id}"]`);
          await page.click(`#nb-list .present[data-clue="${next}"]`);
          continue;
        }
      }
      if (s.hubSel) { await page.click('[data-back]'); continue; }
      if (await page.locator('[data-goal]').count()) { await page.click('[data-goal]'); continue; }
      if (s.hubTab === 'loc') { await page.click('[data-tab="people"]'); continue; }
      // 人物都问完了：逐个打开去出示线索
      const person = hub.people.find((p) => Object.keys(p.present ?? {}).some((c) => s.clues.includes(c) && !presented.has(`${s.hub}:${p.id}:${c}`)));
      if (person) { await page.click(`[data-target="${person.id}"]`); continue; }
      const pending = (group, key) => group.some((g) => g[key].some((x) => (x.requires ?? []).every((c) => s.clues.includes(c)) && !s.done.includes(`${s.hub}:${x.id}`)));
      if (pending(hub.locations, 'items')) { await page.click('[data-tab="loc"]'); continue; }
      if (pending(hub.people, 'talks')) { await page.click('[data-tab="people"]'); continue; }
      throw new Error(`卡在调查 ${s.hub}：已有线索 ${s.clues.join(',')}`);
    }
    await page.waitForTimeout(30);
  }
  await page.screenshot({ path: 'stuck.png' }).catch(() => {});
  throw new Error(`步数超限，可能卡住了：${JSON.stringify(await state())}\n${(await page.locator('#controls').innerHTML()).slice(0, 800)}`);
}

try {
  const a = await playOnce(0);
  console.log('结局一：', a.replace(/\s+/g, ' '));
  const b = await playOnce(1, { mobile: true });
  console.log('结局二（手机尺寸）：', b.replace(/\s+/g, ' '));
  if (!a.includes('真相结局') || !b.includes('沉默结局')) throw new Error('结局不符合预期');
  if (!a.includes('推理失误：1 次')) throw new Error('失误计数不对');
  if (errors.length) throw new Error(`页面报错：\n${errors.join('\n')}`);
  console.log('✓ 两个结局均可通关，读档正常，无页面报错');
} finally {
  await browser.close();
  server.kill();
}
