import assert from 'node:assert/strict';
import { createTestPage } from './browser.mjs';

const SAVE_KEY = 'seventh-classroom/save';

export async function checkReading(browser, url, errors) {
  const page = await createTestPage(browser, { viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  const seed = async (extra = {}, normal = false) => {
    await page.goto(`${url}/${normal ? '' : '?fast'}`);
    await page.evaluate(({ key, extra, normal }) => {
      localStorage.clear();
      localStorage.setItem('seventh-classroom/settings', JSON.stringify({ musicEnabled: false, typeMs: normal ? 16 : 0 }));
      localStorage.setItem(key, JSON.stringify({ version: 2, mode: 'scene', scene: 'prologue', ded: null, q: 0, clues: [], done: [], mistakes: 0, history: [], logStart: 0, playback: { lines: ['第一句阅读操作检查文字。', '第二句阅读操作检查文字。'], index: 0, shown: false, after: { type: 'scene', id: 'prologue' } }, ...extra }));
    }, { key: SAVE_KEY, extra, normal });
    await page.reload();
    await page.click('#btn-continue');
  };
  const atLatest = () => page.locator('#log').evaluate((n) => n.scrollHeight - n.clientHeight - n.scrollTop <= 40);

  try {
    // 原生鼠标拖选和选区内的键盘操作都不应跳句。
    await seed();
    await page.locator('#next-hint:not(.hidden)').waitFor();
    const box = await page.locator('#log .line').first().boundingBox();
    await page.mouse.move(box.x + 3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + Math.min(160, box.width - 5), box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    assert.ok(await page.evaluate(() => window.getSelection().toString().length > 0));
    assert.equal((await state()).playback.index, 0, '选字不能当作继续阅读');
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    assert.equal((await state()).playback.index, 0, '存在正文选区时不应误推进');
    await page.click('#next-hint');
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).playback.index === 1, SAVE_KEY);

    // 正在打字时向上翻看，字继续出现但阅读位置不被拉走。
    const history = Array.from({ length: 35 }, (_, i) => ({ raw: `阅读回顾 ${i + 1}。这是已经读过的检查文字，用来确认长正文的滚动行为。` }));
    const longLine = '正在逐字显示的检查文字，用于确认读旧句时不会被强制拉走。'.repeat(25);
    await seed({ history, playback: { lines: [longLine, '下一句检查文字。'], index: 0, shown: false, after: { type: 'scene', id: 'prologue' } } }, true);
    await page.waitForFunction(() => document.querySelector('#log .line:last-child').textContent.length > 8);
    await page.locator('#log').hover();
    await page.mouse.wheel(0, -10000);
    await page.locator('#btn-latest:not(.hidden)').waitFor();
    const before = await page.locator('#log').evaluate((n) => ({ top: n.scrollTop, chars: n.lastElementChild.textContent.length }));
    await page.waitForTimeout(350);
    const after = await page.locator('#log').evaluate((n) => ({ top: n.scrollTop, chars: n.lastElementChild.textContent.length }));
    assert.ok(Math.abs(after.top - before.top) < 5, '打字不能把正在读前文的玩家拉到底部');
    assert.ok(after.chars > before.chars, '向上滚动时打字本身仍继续');
    await page.click('#btn-history');
    await page.keyboard.press('Escape');
    assert.ok(Math.abs(await page.locator('#log').evaluate((n) => n.scrollTop) - before.top) < 5, '打开回看时补全当前句不能改变主阅读位置');
    const readBeforeLatest = await state();
    await page.click('#btn-latest');
    assert.ok(await atLatest());
    assert.equal((await state()).playback.index, readBeforeLatest.playback.index, '回到最新只滚动，不跳句');
    assert.equal((await state()).history.length, readBeforeLatest.history.length);
    await page.locator('#log').evaluate((n) => { n.scrollTop = 0; });
    await page.locator('#btn-latest:not(.hidden)').waitFor();
    await page.click('#btn-menu');
    await page.click('#btn-continue');
    await page.locator('#next-hint:not(.hidden)').waitFor();
    assert.ok(await atLatest(), '翻看旧句后返回标题再继续，应回到当前句');
    assert.equal((await state()).playback.index, 0);
    await page.locator('#log').focus();
    await page.keyboard.press('Control+Space');
    assert.equal((await state()).playback.index, 0, '输入法和快捷键组合不能当作继续');
    await page.keyboard.press('Shift+Space');
    assert.equal((await state()).playback.index, 0, '向上翻页快捷键不能当作继续');
    await page.keyboard.press('Space');
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).playback.index === 1, SAVE_KEY);
    assert.ok(await atLatest(), '明确继续时应跟随最新正文');

    // 整句显示同样跟随最新；小屏大字时仍可回到最新，主阅读区不会被挤没。
    await seed({ history });
    await page.locator('#next-hint:not(.hidden)').waitFor();
    assert.ok(await atLatest());
    await page.click('#btn-settings');
    await page.selectOption('#setting-size', '22');
    await page.keyboard.press('Escape');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 668 });
      await page.locator('#log').evaluate((n) => { n.scrollTop = 0; });
      await page.locator('#btn-latest:not(.hidden)').waitFor();
      const button = await page.locator('#btn-latest').boundingBox();
      const reading = await page.locator('#reading-pane').boundingBox();
      assert.ok(button.x >= 0 && button.x + button.width <= width && button.y + button.height <= reading.y + reading.height);
      assert.ok(reading.height > 100 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.click('#btn-latest');
      assert.ok(await atLatest());
      assert.equal((await state()).playback.index, 0);
    }

    // 标题只回顾存档里已到达的位置和线索数；小屏可以滚动到所有标题按钮。
    await page.evaluate((key) => {
      const save = JSON.parse(localStorage.getItem(key));
      Object.assign(save, { chapter: '已到达的章节', clues: ['ladder', 'wounds'] });
      localStorage.setItem(key, JSON.stringify(save));
      localStorage.setItem('seventh-classroom/endings', JSON.stringify(['已达成的结局甲', '已达成的结局乙']));
    }, SAVE_KEY);
    await page.reload();
    assert.ok((await page.locator('#resume-summary').innerText()).includes('已到达的章节'));
    assert.ok((await page.locator('#resume-summary').innerText()).includes('已收集 2 条线索'));
    assert.ok(!(await page.locator('#resume-summary').innerText()).includes(longLine));
    await page.setViewportSize({ width: 320, height: 568 });
    for (const selector of ['#btn-continue', '#btn-new', '#btn-title-settings', '#btn-title-music']) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      const button = await page.locator(selector).boundingBox();
      assert.ok(button.x >= 0 && button.x + button.width <= 320 && button.y >= 0 && button.y + button.height <= 568);
    }
    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await page.reload();
    assert.ok(await page.locator('#resume-summary').isHidden());
    assert.ok(await page.locator('#btn-continue').isHidden());
    console.log('✓ 正文选字、滚动跟随、回到最新、快捷键、继续摘要与小屏阅读检查通过');
  } finally {
    await page.close();
  }
}
