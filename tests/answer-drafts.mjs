import assert from 'node:assert/strict';
import { DEDUCTIONS } from '../js/story.js';
import { createTestPage } from './browser.mjs';

const SAVE_KEY = 'seventh-classroom/save';

async function drain(page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 2000; i++) {
      if (document.querySelector('#next-hint:not(.hidden)')) document.querySelector('#log').click();
      else if (document.querySelector('#controls button')) return;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    throw new Error('答题反馈未结束');
  });
}

export async function checkAnswerDrafts(browser, url, errors) {
  const page = await createTestPage(browser, { viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  const resume = async () => { await page.reload(); await page.click('#btn-continue'); };
  const seed = async (extra = {}) => {
    await page.evaluate(({ key, extra }) => {
      localStorage.clear();
      localStorage.setItem('seventh-classroom/settings', JSON.stringify({ musicEnabled: false }));
      localStorage.setItem(key, JSON.stringify({ mode: 'deduction', scene: 'prologue', ded: 'd1', q: 4, clues: [], done: [], mistakes: 0, ...extra }));
    }, { key: SAVE_KEY, extra });
    await resume();
  };
  const displayOrder = () => page.locator('[data-order-item]').evaluateAll((buttons) => buttons.map((b) => Number(b.dataset.orderItem)));

  try {
    await page.goto(`${url}/?fast`);
    await seed();
    const originalOrder = await displayOrder();
    assert.notDeepEqual(originalOrder, originalOrder.map((_, i) => i));
    assert.ok(await page.locator('[data-confirm]').isDisabled());
    assert.ok(await page.locator('[data-order-undo]').isDisabled());
    await page.click('[data-order-item="2"]');
    await page.click('[data-order-item="0"]');
    await page.click('#btn-notebook');
    await page.keyboard.press('Escape');
    await page.click('#btn-menu');
    await page.click('#btn-continue');
    assert.equal(await page.locator('.order-seq li').count(), 2, '返回标题再继续不能丢失排序');
    await resume();
    assert.deepEqual((await state()).answerDraft.selected, [2, 0]);
    assert.deepEqual(await displayOrder(), originalOrder, '刷新不能重新打乱候选事件');
    assert.ok(await page.locator('[data-order-item="2"]').isDisabled());
    assert.equal((await state()).mistakes, 0);
    await page.click('[data-order-undo]');
    assert.deepEqual((await state()).answerDraft.selected, [2]);
    assert.ok(await page.locator('[data-order-item="0"]').isEnabled());
    await resume();
    assert.equal(await page.locator('.order-seq li').count(), 1);
    await page.click('[data-order-reset]');
    assert.equal(await page.locator('.order-seq li').count(), 0);
    assert.deepEqual(await displayOrder(), originalOrder);

    const order = DEDUCTIONS.d1.questions[4].order;
    for (const i of [1, 0, ...order.slice(2).map((_, i) => i + 2)]) await page.click(`[data-order-item="${i}"]`);
    await page.click('[data-confirm]');
    await page.locator('#next-hint:not(.hidden)').waitFor();
    await resume();
    await drain(page);
    assert.equal((await state()).mistakes, 1);
    assert.equal((await state()).q, 4);
    assert.equal(await page.locator('.order-seq li').count(), order.length, '错误反馈之后仍保留原排列以便修改');
    await page.click('[data-order-undo]');
    assert.ok(await page.locator('[data-confirm]').isDisabled());
    await page.click('[data-order-reset]');
    for (let i = 0; i < order.length; i++) await page.click(`[data-order-item="${i}"]`);
    await page.click('[data-confirm]');
    await page.locator('#next-hint:not(.hidden)').waitFor();
    await resume();
    await drain(page);
    assert.equal((await state()).q, 5);
    assert.equal((await state()).answerDraft, null);
    assert.equal((await state()).mistakes, 1);

    // 多选未选不能误提交，键盘点选、清空与刷新均不计失误。
    await seed({ ded: 'd2', q: 3 });
    assert.ok(await page.locator('[data-confirm]').isDisabled());
    await page.locator('[data-option="0"]').focus();
    await page.keyboard.press('Space');
    await page.click('[data-option="2"]');
    assert.equal(await page.locator('[data-option="0"]').getAttribute('aria-pressed'), 'true');
    await resume();
    assert.equal(await page.locator('[data-option].picked').count(), 2);
    assert.deepEqual((await state()).answerDraft.selected, [0, 2]);
    await page.click('[data-confirm]');
    await page.locator('#next-hint:not(.hidden)').waitFor();
    await resume();
    await drain(page);
    assert.equal((await state()).mistakes, 1);
    assert.equal(await page.locator('[data-option].picked').count(), 2);
    await page.click('[data-multi-reset]');
    assert.ok(await page.locator('[data-confirm]').isDisabled());
    assert.equal((await state()).mistakes, 1);
    for (const i of DEDUCTIONS.d2.questions[3].answer) await page.click(`[data-option="${i}"]`);
    await page.click('[data-confirm]');
    await page.locator('#next-hint:not(.hidden)').waitFor();
    await resume();
    await drain(page);
    assert.equal((await state()).q, 4);
    assert.equal((await state()).answerDraft, null);

    // 无关题号或损坏的草稿回退为空白，不影响旧存档进入和计分。
    await seed({ answerDraft: { ded: 'd1', q: 4, kind: 'order', selected: [0, 0], displayOrder: [0] } });
    assert.deepEqual((await state()).answerDraft.selected, []);
    assert.equal((await state()).mistakes, 0);
    await page.click('#btn-settings');
    await page.selectOption('#setting-size', '22');
    await page.keyboard.press('Escape');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 668 });
      await page.click('[data-order-item="0"]');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('[data-order-undo]').scrollIntoViewIfNeeded();
      const undo = await page.locator('[data-order-undo]').boundingBox();
      assert.ok(undo.x >= 0 && undo.x + undo.width <= width && undo.height >= 44);
      await page.click('[data-order-undo]');
    }
    console.log('✓ 排序与多选草稿、撤回重选、防空提交、计分恢复、旧存档及小屏检查通过');
  } finally {
    await page.close();
  }
}
