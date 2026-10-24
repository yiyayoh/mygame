import assert from 'node:assert/strict';
import { createTestPage } from './browser.mjs';

const SAVE_KEY = 'seventh-classroom/save';

async function drain(page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 2000; i++) {
      if (document.querySelector('#next-hint:not(.hidden)')) document.querySelector('#log').click();
      else if (document.querySelector('#controls button')) return;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    throw new Error('出示回应没有结束');
  });
}

export async function checkClueWorkflow(browser, url, errors) {
  const page = await createTestPage(browser, { viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  const resume = async () => { await page.reload(); await page.click('#btn-continue'); };
  const seed = async (extra = {}) => {
    await page.evaluate(({ key, extra }) => {
      localStorage.clear();
      localStorage.setItem('seventh-classroom/settings', JSON.stringify({ musicEnabled: false }));
      localStorage.setItem(key, JSON.stringify({ mode: 'hub', scene: 'ch1_arrive', hub: 'hub1', ded: null, q: 0, hubTab: 'people', hubSel: 'gu', clues: ['gu_umbrella', 'letters', 'ladder'], done: [], mistakes: 0, ...extra }));
    }, { key: SAVE_KEY, extra });
    await resume();
  };

  try {
    await page.goto(`${url}/?fast`);
    await seed();
    await page.click('#btn-notebook');
    await page.click('#nb-marked');
    assert.equal(await page.locator('#nb-list .clue').count(), 0);
    assert.ok((await page.locator('#nb-list').innerText()).includes('关闭「只看标记」'));
    await page.click('#nb-marked');
    await page.click('[data-pin="gu_umbrella"]');
    assert.equal(await page.locator('[data-pin="gu_umbrella"]').getAttribute('aria-pressed'), 'true');
    await page.click('#nb-marked');
    assert.equal(await page.locator('#nb-list .clue').count(), 1);
    await page.fill('#nb-search', '不会匹配的关键词');
    assert.equal(await page.locator('#nb-list .clue').count(), 0);
    await page.fill('#nb-search', '');
    await page.keyboard.press('Escape');
    await resume();
    await page.click('[data-present="gu"]');
    assert.equal(await page.locator('#nb-marked').getAttribute('aria-pressed'), 'false', '每次打开重置筛选，避免隐藏其他证据');
    assert.equal(await page.locator('#nb-list .clue').count(), 3);
    assert.equal(await page.locator('[data-pin="gu_umbrella"]').getAttribute('aria-pressed'), 'true', '标记本身应永久保留');
    await page.locator('[data-pin="letters"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#notebook.show').count(), 1, '标记不会误提交证据');
    await page.keyboard.press('Escape');
    assert.deepEqual((await state()).presented, []);
    assert.equal((await state()).mistakes, 0);

    // 回应读完才记为出示过，中途读档继续；不会把打开或取消当作出示。
    await page.click('[data-present="gu"]');
    await page.click('#nb-list [data-clue="gu_umbrella"]');
    await page.locator('#next-hint:not(.hidden)').waitFor();
    assert.deepEqual((await state()).presented, []);
    await resume();
    await drain(page);
    assert.deepEqual((await state()).presented, ['hub1:gu:gu_umbrella']);
    assert.ok((await page.locator('[data-present="gu"]').innerText()).includes('本轮已出示 1 条'));
    await page.click('[data-present="gu"]');
    assert.equal(await page.locator('#nb-list [data-clue="gu_umbrella"]').innerText(), '再次出示');
    assert.equal(await page.locator('#nb-list [data-clue="letters"]').innerText(), '出示');
    assert.equal(await page.locator('#nb-list .clue-seen').count(), 1);
    assert.equal(await page.locator('[data-clue="photo_cap"]').count(), 0, '不能预告未获得的证据或反应');
    await page.click('#nb-list [data-clue="gu_umbrella"]');
    await drain(page);
    assert.equal((await state()).presented.length, 1, '重复出示允许重读，但不能重复计数');
    const saved = await state();

    // 出示记录按本轮调查和人物区分，不能把后续新回应提前标成已读。
    await seed({ hubSel: 'zheng', pinnedClues: saved.pinnedClues, presented: saved.presented });
    await page.click('[data-present="zheng"]');
    assert.equal(await page.locator('#nb-list [data-clue="gu_umbrella"]').innerText(), '出示');
    await page.keyboard.press('Escape');
    await seed({ hub: 'hub4', hubSel: 'gu3', pinnedClues: saved.pinnedClues, presented: saved.presented });
    await page.click('[data-present="gu3"]');
    assert.equal(await page.locator('#nb-list [data-clue="gu_umbrella"]').innerText(), '出示');
    await page.keyboard.press('Escape');

    // 事实不相关的默认回应同样允许留下操作轨迹，避免玩家反复试同一组合。
    await seed();
    await page.click('[data-present="gu"]');
    await page.click('#nb-list [data-clue="ladder"]');
    await drain(page);
    assert.deepEqual((await state()).presented, ['hub1:gu:ladder']);
    assert.equal((await state()).mistakes, 0);

    // 在推理题内标记线索也不会被当作向人物出示；大字小屏仍能关闭、筛选与取消标记。
    await seed({ mode: 'deduction', ded: 'd1', q: 0, pinnedClues: ['ladder'] });
    await page.click('[data-statement="1"]');
    await page.click('[data-evidence]');
    await page.click('#nb-marked');
    await page.click('[data-pin="ladder"]');
    assert.equal(await page.locator('#nb-list .clue').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'nb-marked', '取消最后一个标记后焦点应回到筛选按钮');
    await page.keyboard.press('Escape');
    assert.deepEqual((await state()).presented, []);
    assert.equal((await state()).mistakes, 0);
    await page.click('#btn-settings');
    await page.selectOption('#setting-size', '22');
    await page.keyboard.press('Escape');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 668 });
      await page.click('[data-evidence]');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '线索操作不能横向溢出');
      await page.locator('[data-pin="gu_umbrella"]').scrollIntoViewIfNeeded();
      const pin = await page.locator('[data-pin="gu_umbrella"]').boundingBox();
      assert.ok(pin.height >= 44 && pin.x >= 0 && pin.x + pin.width <= width);
      await page.click('#nb-close');
    }
    console.log('✓ 线索标记、组合筛选、出示记录、跨章区分、旧存档和手机操作检查通过');
  } finally {
    await page.close();
  }
}
