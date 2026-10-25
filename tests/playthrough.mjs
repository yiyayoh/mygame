// 端到端测试：用 Playwright 在真实浏览器里从标题画面一路玩到结局。
// 会故意答错一次、中途刷新页面测试读档，并分别打通两个结局。
// 用法：node tests/playthrough.mjs [截图输出目录]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { DEDUCTIONS, HUBS } from '../js/story.js';
import { startServer } from './server.mjs';
import { checkExperience } from './experience.mjs';
import { checkMusic } from './music.mjs';
import { checkTestimony } from './testimony.mjs';
import { checkClueWorkflow } from './clue-workflow.mjs';
import { checkLinks } from './links.mjs';
import { checkAnswerDrafts } from './answer-drafts.mjs';
import { checkReading } from './reading.mjs';
import { checkPacing } from './pacing.mjs';
import { musicCueFor } from '../js/music.js';
import { createTestPage } from './browser.mjs';

const SHOTS = process.argv[2];
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const server = await startServer();
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}).catch(async (e) => { await server.close(); throw e; });
const errors = [];

async function playOnce(choiceIndex, { mobile = false } = {}) {
  const page = await createTestPage(browser, mobile ? { viewport: { width: 390, height: 844 } } : { viewport: { width: 1100, height: 800 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${server.url}/index.html?fast`);
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
      await page.click('#btn-title');
      if (await page.locator('#app').getAttribute('data-music-cue') !== 'title') throw new Error('回到标题时配乐未切回');
      if (await state() || await page.locator('#btn-continue:not(.hidden)').count()) throw new Error('完成流程后不应恢复已经结束的存档');
      await page.close();
      return text;
    }
    if (await page.locator('#card.show').count()) { await page.waitForTimeout(50); continue; }
    if (await page.locator('#next-hint:not(.hidden)').count()) { await page.click('#log'); continue; }

    const choice = page.locator('[data-choice]');
    if (await choice.count()) { await shot('choice'); await choice.nth(choiceIndex).click(); continue; }

    const s = await state();
    if (s && await page.locator('#app').getAttribute('data-music-cue') !== musicCueFor(s)) throw new Error('配乐未随当前场景切换');
    if (await page.locator('[data-review-start]').count()) {
      await page.click(mobile ? '[data-skip-review]' : '[data-review-start]');
      continue;
    }
    if (s?.mode === 'deduction' && (await page.locator('[data-option], [data-evidence], [data-order-item], [data-link-slot]').count())) {
      const q = DEDUCTIONS[s.ded].questions[s.q];
      if (s.ded === 'd5' && s.findings.some((f) => f.kind === 'link' && f.status !== 'confirmed')) throw new Error('后续材料读完后联结仍未得到印证');
      if (!shotTaken.has(s.ded)) { shotTaken.add(s.ded); await shot(`deduction-${s.ded}`); }
      if (q.testimony) {
        const t = q.testimony;
        const selected = !wrongOnce ? (t.answer + 1) % t.statements.length : t.answer;
        wrongOnce = true;
        await page.click(`[data-statement="${selected}"]`);
        await page.click('[data-evidence]');
        const id = t.clue.find((c) => s.clues.includes(c));
        await page.click(`#nb-list .present[data-clue="${id}"]`);
      } else if (q.link) {
        const clues = mobile ? [...q.link.clues].reverse() : q.link.clues;
        for (const [i, id] of clues.entries()) {
          await page.click(`[data-link-slot="${i}"]`);
          await page.click(`#nb-list .present[data-clue="${id}"]`);
        }
        await page.click('[data-confirm]');
      } else if (q.order) {
        for (let i = 0; i < q.order.length; i++) await page.click(`[data-order-item="${i}"]`);
        await page.click('[data-confirm]');
      } else if (q.multi) {
        for (const i of q.answer) await page.click(`[data-option="${i}"]`);
        await page.click('[data-confirm]');
      } else if (q.answer === 'any') {
        await page.click(`[data-option="${choiceIndex % q.options.length}"]`);
      } else if (q.options) {
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
      // 第三章开始时刷新一次，测试读档
      if (s.hub === 'hub3' && !reloaded) {
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
  await checkExperience(browser, server.url, errors);
  await checkTestimony(browser, server.url, errors);
  await checkClueWorkflow(browser, server.url, errors);
  await checkLinks(browser, server.url, errors);
  await checkAnswerDrafts(browser, server.url, errors);
  await checkReading(browser, server.url, errors);
  await checkPacing(browser, server.url, errors);
  await checkMusic(browser, server.url, errors);
  const a = await playOnce(0);
  console.log('✓ 桌面流程完成');
  const b = await playOnce(1, { mobile: true });
  console.log('✓ 手机流程完成');
  if (!a.includes('真相结局') || !b.includes('沉默结局')) throw new Error('结局不符合预期');
  if (![a, b].every((text) => text.includes('推理失误：1 次'))) throw new Error('失误计数不对');
  const findingCount = Object.values(DEDUCTIONS).reduce((n, d) => n + d.questions.filter((q) => q.testimony).length, 0);
  if (![a, b].every((text) => text.includes(`发现矛盾：${findingCount} 处`))) throw new Error('对质完成后的推理记录数量不对');
  const linkCount = Object.values(DEDUCTIONS).reduce((n, d) => n + d.questions.filter((q) => q.link).length, 0);
  if (![a, b].every((text) => text.includes(`线索联结：${linkCount} 组`))) throw new Error('线索联结数量不对');
  if (errors.length) throw new Error(`页面报错：\n${errors.join('\n')}`);
  console.log('✓ 两个结局均可通关，读档正常，无页面报错');
} finally {
  await browser.close();
  await server.close();
}
