// 对质的组合判断、提示、发现记录与中断恢复。输出只报告功能，不透露剧情。
import assert from 'node:assert/strict';
import { DEDUCTIONS } from '../js/story.js';
import { createTestPage } from './browser.mjs';

const SAVE_KEY = 'seventh-classroom/save';
const SETTINGS_KEY = 'seventh-classroom/settings';

async function drain(page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 2000; i++) {
      if (document.querySelector('#next-hint:not(.hidden)')) document.querySelector('#log').click();
      else if (document.querySelector('#controls button')) return;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    throw new Error('对质反馈未能返回题目');
  });
}

export async function checkTestimony(browser, url, errors) {
  const page = await createTestPage(browser, { viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  const resume = async () => { await page.reload(); await page.click('#btn-continue'); };
  const seed = async (extra = {}) => {
    await page.evaluate(({ key, settings, extra }) => {
      localStorage.clear();
      localStorage.setItem(settings, JSON.stringify({ musicEnabled: false }));
      // 故意省略新状态字段，验证旧存档可以直接进入新的对质。
      localStorage.setItem(key, JSON.stringify({ mode: 'deduction', scene: 'ch1_arrive', ded: 'd1', q: 0, hub: null, clues: ['ladder', 'bust', 'wounds'], done: [], mistakes: 0, ...extra }));
    }, { key: SAVE_KEY, settings: SETTINGS_KEY, extra });
    await resume();
  };
  const submit = async (index, clue) => {
    await page.click(`[data-statement="${index}"]`);
    await page.click('[data-evidence]');
    await page.click(`#nb-list [data-clue="${clue}"]`);
    await page.locator('#next-hint:not(.hidden)').waitFor();
  };

  try {
    await page.goto(`${url}/?fast`);
    await seed();
    const first = DEDUCTIONS.d1.questions[0].testimony;
    const second = DEDUCTIONS.d2.questions[1].testimony;
    assert.equal(await page.locator('[data-statement]').count(), first.statements.length);
    assert.ok(await page.locator('[data-evidence]').isDisabled(), '尚未选句不能提交');
    assert.equal((await state()).mistakes, 0);

    // 推理记录只收录玩家已完成的发现，不预列未来节点或答案。
    await page.click('#btn-notebook');
    await page.click('[data-nbtab="findings"]');
    assert.equal(await page.locator('[data-finding]').count(), 0);
    assert.ok(!(await page.locator('#nb-list').innerText()).includes(first.finding.title));
    assert.ok(await page.locator('#nb-filters').isHidden());
    await page.keyboard.press('Escape');

    // 自由选句、逐级提示、取消出示均不扣分；刷新后仍保留选择与提示。
    await page.locator('[data-statement="0"]').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('[data-statement="0"]').getAttribute('aria-pressed'), 'true');
    await page.click(`[data-statement="${first.answer}"]`);
    await page.click('[data-deduction-hint]');
    assert.equal((await state()).mistakes, 0);
    await resume();
    assert.equal(await page.locator(`[data-statement="${first.answer}"]`).getAttribute('aria-pressed'), 'true');
    assert.ok((await page.locator('.testimony-hints').innerText()).includes(first.hints[0]));
    await page.click('[data-deduction-hint]');
    assert.ok(await page.locator('[data-deduction-hint]').isDisabled());
    await page.click('[data-evidence]');
    assert.ok(await page.locator('#nb-tabs').isHidden(), '提交时只选择已获得的证据');
    await page.keyboard.press('Escape');
    assert.equal((await state()).mistakes, 0);
    assert.equal((await state()).findings.length, 0);
    assert.equal((await state()).q, 0);

    // 对证据配错陈述，与对陈述配错证据，都不能靠只猜中一半过关。
    await submit((first.answer + 1) % first.statements.length, first.clue[0]);
    assert.equal((await state()).mistakes, 1);
    assert.equal((await state()).findings.length, 0);
    assert.equal((await state()).history.at(-1).raw, first.wrongStatement[0]);
    await resume();
    await drain(page);
    assert.equal((await state()).mistakes, 1, '重看反馈不重复计错');
    assert.equal((await state()).q, 0);
    await submit(first.answer, 'bust');
    assert.equal((await state()).mistakes, 2);
    assert.equal((await state()).history.at(-1).raw, first.wrongEvidence[0]);
    await drain(page);
    assert.equal((await state()).q, 0);
    assert.equal((await state()).findings.length, 0);

    // 两部分都正确才留下可见的发现；在成功反馈中刷新不会重复发放。
    await submit(first.answer, first.clue[0]);
    const won = await state();
    assert.equal(won.findings.length, 1);
    assert.ok((await page.locator('#log .breakthrough').innerText()).includes(first.finding.title));
    assert.equal(won.findings[0].clue, first.clue[0]);
    await resume();
    assert.equal((await state()).findings.length, 1);
    await drain(page);
    assert.equal((await state()).q, 1);
    assert.equal((await state()).mistakes, 2);
    assert.equal((await state()).history.filter((h) => h.cls === 'breakthrough').length, 1);
    await page.click('#btn-notebook');
    await page.click('[data-nbtab="findings"]');
    assert.equal(await page.locator('[data-finding]').count(), 1);
    const record = await page.locator('#nb-list').innerText();
    assert.ok(record.includes(first.statements[first.answer]) && record.includes(first.finding.text));
    assert.ok(!record.includes(second.finding.title), '尚未完成的发现不能提前显示');
    await page.keyboard.press('Escape');

    // 第二处题目可以沿用已有记录；小屏和大字号下，所有交互仍能滚动到达。
    await seed({ ded: 'd2', q: 1, clues: ['inventory', 'timer_tag'], findings: won.findings });
    await page.click('#btn-settings');
    await page.selectOption('#setting-size', '22');
    await page.keyboard.press('Escape');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 668 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '对质不能横向溢出');
      for (const button of await page.locator('[data-statement]').all()) {
        await button.scrollIntoViewIfNeeded();
        const box = await button.boundingBox();
        assert.ok(box.width <= width && box.height >= 44, '陈述按钮应适合手机点选');
      }
      await page.click(`[data-statement="${second.answer}"]`);
      await page.click('[data-evidence]');
      await page.fill('#nb-search', '不会匹配的关键词');
      assert.equal(await page.locator('#nb-list .present').count(), 0);
      await page.fill('#nb-search', '');
      await page.keyboard.press('Escape');
    }
    await submit(second.answer, second.clue[0]);
    await drain(page);
    assert.equal((await state()).q, 2);
    assert.equal((await state()).findings.length, 2);
    assert.equal((await state()).mistakes, 0);
    await resume();
    await page.click('#btn-notebook');
    await page.click('[data-nbtab="findings"]');
    assert.equal(await page.locator('[data-finding]').count(), 2);
    await page.keyboard.press('Escape');

    // 升级前已经答对、正在读反馈的存档，按原进度推进，不补造发现。
    await seed({ playback: { lines: ['已读反馈。'], index: 0, shown: false, after: { type: 'answer', correct: true, q: 0 } } });
    await drain(page);
    assert.equal((await state()).q, 1);
    assert.equal((await state()).findings.length, 0);
    console.log('✓ 对质组合判断、分级提示、发现记录、旧存档、反馈恢复及手机操作检查通过');
  } finally {
    await page.close();
  }
}
