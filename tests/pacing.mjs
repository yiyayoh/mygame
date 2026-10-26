import assert from 'node:assert/strict';
import { HUBS } from '../js/story.js';
import { createTestPage } from './browser.mjs';

const SAVE_KEY = 'seventh-classroom/save';

async function drain(page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 3000; i++) {
      if (document.querySelector('#card.show')) { await new Promise((r) => setTimeout(r, 5)); continue; }
      if (document.querySelector('#next-hint:not(.hidden)')) document.querySelector('#next-hint').click();
      else if (document.querySelector('#controls button')) return;
      await new Promise((r) => setTimeout(r, 2));
    }
    throw new Error('回顾或补充谈话未结束');
  });
}

export async function checkPacing(browser, url, errors) {
  const page = await createTestPage(browser, { viewport: { width: 390, height: 668 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  const resume = async () => { await page.reload(); await page.click('#btn-continue'); };
  const seed = async (extra) => {
    await page.evaluate(({ key, extra }) => {
      localStorage.clear();
      localStorage.setItem('seventh-classroom/settings', JSON.stringify({ musicEnabled: false, typeMs: 0, fontSize: 22 }));
      localStorage.setItem(key, JSON.stringify({ mode: 'deduction', scene: 'recording', hub: null, ded: 'd5', q: 0, clues: ['recording_truth'], done: [], mistakes: 2, history: [], ...extra }));
    }, { key: SAVE_KEY, extra });
    await resume();
  };

  try {
    await page.goto(`${url}/?fast`);
    await seed({ reviewStarted: false });
    assert.equal(await page.locator('[data-review-start]').count(), 1);
    assert.equal(await page.locator('#log .question').count(), 0, '先让玩家决定是否回顾，不提前插入题目');
    for (const [width, height] of [[320, 568], [390, 668]]) {
      await page.setViewportSize({ width, height });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok((await page.locator('#reading-pane').boundingBox()).height > 100);
      for (const selector of ['[data-skip-review]', '[data-review-start]']) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        const box = await page.locator(selector).boundingBox();
        assert.ok(box.y >= 0 && box.y + box.height <= height);
      }
    }
    await resume();
    assert.equal(await page.locator('[data-review-start]').count(), 1, '刷新仍应停在回顾选择');
    await page.click('[data-review-start]');
    assert.equal((await state()).q, 0);
    assert.equal(await page.locator('[data-option]').count(), 3);
    await resume();
    assert.equal(await page.locator('[data-review-start]').count(), 0, '选择回顾后读档恢复当前题');
    const before = await state();
    await page.click('[data-skip-review]');
    await drain(page);
    let after = await state();
    assert.equal(after.hub, 'hub5');
    assert.equal(after.mistakes, before.mistakes);
    assert.deepEqual(after.clues, before.clues);
    assert.deepEqual(after.findings, before.findings, '略过回顾不补发推理发现');

    // 没有新字段的旧存档直接回到原题号；错题反馈中不能跳过，结束回顾也不抹去失误。
    await seed({ q: 2 });
    assert.equal((await state()).q, 2);
    assert.equal(await page.locator('[data-review-start]').count(), 0);
    await page.click('[data-option="0"]');
    assert.equal((await state()).mistakes, 3);
    assert.equal(await page.locator('[data-skip-review]').count(), 0);
    await drain(page);
    await resume();
    assert.equal((await state()).q, 2);
    await page.click('[data-skip-review]');
    await drain(page);
    assert.equal((await state()).mistakes, 3);

    await seed({ ded: 'd4', q: 5, clues: ['jing_testimony', 'sketchbook'] });
    assert.equal(await page.locator('[data-skip-review]').count(), 0, '关键推理不能作为回顾略过');
    assert.equal(await page.locator('[data-link-slot]').count(), 2);

    const hub = HUBS.hub5;
    const entries = [...hub.locations.flatMap((g) => g.items), ...hub.people.flatMap((g) => g.talks)];
    const done = entries.filter((x) => !x.optional).map((x) => `hub5:${x.id}`);
    const hubSave = { mode: 'hub', hub: 'hub5', hubTab: 'people', hubSel: null, done };
    await seed({ ...hubSave, clues: ['sun_note', ...hub.goal.requires.filter((c) => c !== 'zheng_admit')] });
    for (const id of ['zhao5', 'sun5', 'fang', 'bai5']) assert.ok((await page.locator(`[data-target="${id}"]`).innerText()).includes('补充了解'));
    assert.ok(!(await page.locator('[data-target="zheng5"]').innerText()).includes('补充了解'));
    await page.click('[data-hint]');
    const hint = await page.locator('.investigation-help p').innerText();
    assert.ok(hint.includes('出示线索'), '只剩补充谈话时，引导应指向核对证词');
    assert.equal((await state()).mistakes, 2);

    // 关键材料齐全即可继续；可选谈话仍可阅读，也仍然发放原有材料。
    await seed({ ...hubSave, clues: hub.goal.requires });
    assert.equal(await page.locator('[data-goal]').count(), 1);
    await page.click('[data-target="zhao5"]');
    await page.click('[data-action="zhao5_report"]');
    await drain(page);
    after = await state();
    assert.ok(after.clues.includes('zhao_report'));
    assert.ok(after.done.includes('hub5:zhao5_report'));
    await page.click('[data-goal]');
    assert.equal((await state()).ded, 'd6');
    console.log('✓ 可选回顾、旧题号恢复、失误保留、补充访谈及关键推进引导检查通过');
  } finally {
    await page.close();
  }
}
