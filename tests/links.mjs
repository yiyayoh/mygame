import assert from 'node:assert/strict';
import { DEDUCTIONS, PROFILES } from '../js/story.js';
import { createTestPage } from './browser.mjs';

const SAVE_KEY = 'seventh-classroom/save';

async function drain(page, { stopAtRecording = false } = {}) {
  await page.evaluate(async (stopAtRecording) => {
    for (let i = 0; i < 3000; i++) {
      const save = JSON.parse(localStorage.getItem('seventh-classroom/save'));
      if (stopAtRecording && save.mode === 'scene' && save.scene === 'recording') return;
      if (document.querySelector('#card.show')) { await new Promise((resolve) => setTimeout(resolve, 5)); continue; }
      if (document.querySelector('#next-hint:not(.hidden)')) document.querySelector('#log').click();
      else if (document.querySelector('#controls button')) return;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    throw new Error('联结反馈未能结束');
  }, stopAtRecording);
}

export async function checkLinks(browser, url, errors) {
  const page = await createTestPage(browser, { viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  const resume = async () => { await page.reload(); await page.click('#btn-continue'); };
  const q = DEDUCTIONS.d4.questions[5];
  const seed = async (extra = {}) => {
    await page.evaluate(({ key, extra }) => {
      localStorage.clear();
      localStorage.setItem('seventh-classroom/settings', JSON.stringify({ musicEnabled: false }));
      localStorage.setItem(key, JSON.stringify({ mode: 'deduction', scene: 'ch4_night', hub: null, ded: 'd4', q: 5, clues: ['jing_testimony', 'sketchbook', 'phone', 'sun_note'], done: [], mistakes: 0, ...extra }));
    }, { key: SAVE_KEY, extra });
    await resume();
  };
  const pick = async (slot, clue) => {
    await page.click(`[data-link-slot="${slot}"]`);
    await page.click(`#nb-list [data-clue="${clue}"]`);
  };

  try {
    await page.goto(`${url}/?fast`);
    await seed();
    assert.equal(await page.locator('[data-link-slot]').count(), 2);
    assert.ok(await page.locator('[data-confirm]').isDisabled());

    // 持有载体不等于已经读过内容，档案和线索本不能提前替玩家回答。
    await page.click('#btn-notebook');
    assert.ok(!(await page.locator('#nb-list').innerText()).includes(q.link.finding.confirmedText));
    await page.click('[data-nbtab="people"]');
    assert.ok(!(await page.locator('#nb-list').innerText()).includes(PROFILES.zhou.entries.at(-1).text));
    await page.keyboard.press('Escape');
    await page.click('[data-link-slot="0"]');
    assert.equal(await page.locator(`#nb-list [data-clue="${q.link.finding.confirmWith}"]`).count(), 0);
    await page.keyboard.press('Escape');
    assert.deepEqual((await state()).linkDraft.selected, [null, null]);

    // 选择、提示、取消和重复放入同一证据都不算提交。
    await pick(0, q.link.clues[0]);
    await pick(1, q.link.clues[0]);
    assert.ok(await page.locator('[data-confirm]').isDisabled());
    assert.equal((await state()).mistakes, 0);
    await page.click('[data-deduction-hint]');
    await resume();
    assert.deepEqual((await state()).linkDraft.selected, [q.link.clues[0], null]);
    assert.ok((await page.locator('.testimony-hints').innerText()).includes(q.link.hints[0]));
    await pick(1, 'phone');
    await page.click('[data-confirm]');
    await page.locator('#next-hint:not(.hidden)').waitFor();
    assert.equal((await state()).mistakes, 1);
    assert.equal((await state()).findings.length, 0);
    await resume();
    await drain(page);
    assert.equal((await state()).mistakes, 1, '恢复错误反馈不能重复计错');
    assert.equal((await state()).q, 5);

    // 手机大字下可以查看、重选和提交；两个槽位没有固定顺序。
    await page.click('#btn-settings');
    await page.selectOption('#setting-size', '22');
    await page.keyboard.press('Escape');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 668 });
      await page.click('[data-link-reset]');
      assert.ok(await page.locator('[data-confirm]').isDisabled());
      assert.equal((await state()).linkDraft.hints, 1, '重选不清除已读提示');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await pick(0, q.link.clues[1]);
      await pick(1, q.link.clues[0]);
      assert.ok(!(await page.locator('[data-confirm]').isDisabled()));
    }
    await page.click('[data-confirm]');
    await page.locator('#next-hint:not(.hidden)').waitFor();
    assert.equal((await state()).findings.length, 1);
    assert.equal((await state()).findings[0].status, 'pending');
    await resume();
    await drain(page, { stopAtRecording: true });
    await page.locator('#next-hint:not(.hidden)').waitFor();
    assert.equal((await state()).findings.length, 1, '恢复成功反馈不重复记录联结');
    assert.equal((await state()).findings[0].status, 'pending', '后续材料未读完时仍是推测');
    await page.click('#btn-notebook');
    await page.click('[data-nbtab="findings"]');
    const pending = await page.locator('#nb-list').innerText();
    assert.ok(pending.includes('待核实的推测') && pending.includes(q.link.finding.text));
    assert.ok(!pending.includes(q.link.finding.confirmedText));
    await page.keyboard.press('Escape');

    // 后续证据实际取得之后，才把同一条推测更新成印证；中断恢复不重复奖励。
    await drain(page);
    const confirmed = await state();
    assert.equal(confirmed.ded, 'd5');
    assert.equal(confirmed.findings[0].status, 'confirmed');
    assert.equal(confirmed.clues.filter((id) => id === q.link.finding.confirmWith).length, 1);
    assert.equal(confirmed.history.filter((entry) => entry.text?.includes('推测得到印证')).length, 1);
    await resume();
    assert.equal((await state()).history.filter((entry) => entry.text?.includes('推测得到印证')).length, 1);
    await page.click('#btn-notebook');
    await page.click('[data-nbtab="findings"]');
    assert.ok((await page.locator('#nb-list').innerText()).includes(q.link.finding.confirmedText));
    await page.click('[data-nbtab="people"]');
    assert.ok((await page.locator('#nb-list').innerText()).includes(PROFILES.zhou.entries.at(-1).text));
    await page.keyboard.press('Escape');
    assert.equal((await state()).mistakes, 1);

    // 升级前在这一题已答对的反馈存档照常前进，不补造玩家没有做过的联结。
    await seed({ playback: { lines: ['旧版已读反馈。'], index: 0, shown: false, after: { type: 'answer', correct: true, q: 5 } } });
    await drain(page, { stopAtRecording: true });
    assert.equal((await state()).scene, 'recording');
    assert.equal((await state()).findings.length, 0);
    console.log('✓ 跨章线索联结、自由重选、推测印证、防剧透档案、旧存档和小屏检查通过');
  } finally {
    await page.close();
  }
}
