// 阅读中断、旧存档、出示引导和手机操作的回归检查。只核对已读内容，不输出剧透。
import assert from 'node:assert/strict';
import { SCENES, HUBS, DEDUCTIONS } from '../js/story.js';

const SAVE_KEY = 'seventh-classroom/save';
const oldSave = (extra = {}) => ({ mode: 'scene', scene: 'prologue', hub: null, ded: null, q: 0, clues: [], done: [], mistakes: 0, hubTab: 'loc', hubSel: null, ...extra });

async function drain(page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 5000; i++) {
      if (document.querySelector('#card.show')) { await new Promise((r) => setTimeout(r, 5)); continue; }
      if (document.querySelector('#next-hint:not(.hidden)')) { document.querySelector('#log').click(); await new Promise((r) => setTimeout(r, 0)); continue; }
      if (document.querySelector('#controls button, #ending.show')) return;
      await new Promise((r) => setTimeout(r, 2));
    }
    throw new Error('阅读没有返回可操作界面');
  });
}

export async function checkExperience(browser, url, errors) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()} ${m.location().url}`); });
  const state = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  const waitLine = () => page.locator('#next-hint:not(.hidden)').waitFor();
  const resume = async () => { await page.reload(); await page.click('#btn-continue'); };
  const seed = async (extra) => {
    await page.evaluate(({ key, save }) => { localStorage.clear(); localStorage.setItem(key, JSON.stringify(save)); }, { key: SAVE_KEY, save: oldSave(extra) });
    await resume();
  };
  const present = async (id) => { await page.click('[data-evidence]'); await page.click(`#nb-list [data-clue="${id}"]`); };

  try {
    await page.goto(`${url}/?fast`);
    const icon = await page.request.get(`${url}/assets/favicon.svg`);
    assert.equal(icon.status(), 200, '网站图标应可加载');

    // 没有新字段的旧存档仍可进入；当前句在刷新后恢复，继续时不重复。
    await seed({});
    await waitLine();
    await page.click('#log');
    await waitLine();
    const readBefore = await state();
    const currentRaw = readBefore.history.at(-1).raw;
    await resume();
    await waitLine();
    assert.deepEqual((await state()).history, readBefore.history, '读档应恢复相同正文');
    assert.equal((await state()).playback.index, readBefore.playback.index, '应停在同一句');
    await page.click('#btn-history');
    await page.keyboard.press('Space');
    assert.equal((await state()).playback.index, readBefore.playback.index, '弹窗中空格不应推进正文');
    await page.keyboard.press('Escape');
    await page.click('#log');
    await waitLine();
    assert.equal((await state()).history.filter((e) => e.raw === currentRaw).length, 1, '恢复当前句不应重复记入回看');
    await drain(page);
    assert.equal((await state()).hub, 'hub1');
    await page.click('#btn-history');
    const history = await page.locator('#history-list').innerText();
    assert.ok(history.includes(SCENES.prologue.lines[1]), '回看应保留上一章正文');
    assert.ok(!history.includes(SCENES.ch2_open.lines[1]), '回看不能显示尚未读到的剧情');
    await page.click('#history-close');
    const hubHistory = (await state()).history;
    await resume();
    assert.deepEqual((await state()).history, hubHistory, '调查中读档也应恢复正文');

    // 调查对话在获得线索之前中断：读档后继续完整行动，完成和奖励只记一次。
    await seed({ mode: 'hub', hub: 'hub1', hubSel: 'prep' });
    await page.click('[data-action="body"]');
    await waitLine();
    await page.click('#log');
    await waitLine();
    const interruptedAction = await state();
    await resume();
    await waitLine();
    assert.deepEqual((await state()).history, interruptedAction.history);
    await drain(page);
    const completedAction = await state();
    assert.equal(completedAction.clues.filter((id) => id === 'body').length, 1);
    assert.equal(completedAction.done.filter((id) => id === 'hub1:body').length, 1);
    assert.equal(await page.locator('[data-action="body"].done').count(), 1);

    // 错误反馈中读档不再扣分；正确反馈中读档仅推进一道题。
    await seed({ mode: 'deduction', ded: 'd2', clues: ['timer', 'timer_tag'] });
    await present('timer');
    await waitLine();
    assert.equal((await state()).mistakes, 1);
    assert.ok((await state()).history.at(-1).raw === DEDUCTIONS.d2.questions[0].wrong[0]);
    await resume();
    await drain(page);
    assert.equal((await state()).mistakes, 1, '重看错误反馈不应重复扣分');
    assert.equal((await state()).q, 0);
    await present('timer_tag');
    await waitLine();
    await resume();
    await drain(page);
    assert.equal((await state()).q, 1, '重看正确反馈应只推进一次');
    assert.equal((await state()).mistakes, 1);

    // 个人态度题仍接受不同立场，不计失误。
    await seed({ mode: 'deduction', ded: 'd6', q: 1 });
    await page.click('[data-option="2"]');
    await drain(page);
    assert.equal((await state()).mistakes, 0);
    assert.equal((await state()).q, 2);

    // 已读到选择处时，读档不应把整段剧情再播一遍。
    await seed({ scene: 'finale', sceneComplete: true, history: [{ raw: SCENES.finale.lines.at(-1) }] });
    assert.equal(await page.locator('[data-choice]').count(), 2);
    await resume();
    assert.equal(await page.locator('[data-choice]').count(), 2);
    assert.equal((await state()).history.length, 1);

    // 普通询问做完仍能看出可以出示；操作提示不透露证据，也不影响评价。
    const hub = HUBS.hub4;
    const done = [...hub.locations.flatMap((g) => g.items), ...hub.people.flatMap((g) => g.talks)].map((x) => `hub4:${x.id}`);
    await seed({ mode: 'hub', hub: 'hub4', hubTab: 'people', clues: ['baizhi_story', 'phone', 'gu_umbrella', 'photo_1841'], done });
    assert.ok((await page.locator('[data-target="gu3"]').innerText()).includes('话题已问完'));
    assert.ok((await page.locator('[data-target="gu3"]').innerText()).includes('仍可出示线索'));
    const beforeHint = await state();
    await page.click('[data-hint]');
    assert.ok((await page.locator('.investigation-help').innerText()).includes('出示线索'));
    assert.deepEqual((await state()).clues, beforeHint.clues);
    assert.equal((await state()).mistakes, 0);
    await page.click('[data-target="lin3"]');
    await page.click('[data-present]');
    await page.selectOption('#nb-type', '照片');
    await page.fill('#nb-search', '18:41');
    assert.equal(await page.locator('#nb-list .clue').count(), 1);
    assert.equal(await page.locator('#nb-list [data-clue="photo_1841"]').count(), 1);
    assert.equal(await page.locator('#nb-list [data-clue="photo_cap"]').count(), 0, '不能搜索出未获得的线索');
    await page.click('#nb-list [data-clue="photo_1841"]');
    await waitLine();
    await resume();
    await drain(page);
    assert.equal((await state()).clues.filter((id) => id === 'photo_cap').length, 1, '出示回应读档后仍应发放线索');

    // 阅读设置独立保存，搜索无匹配、键盘关闭和小屏大字均能操作。
    await page.click('#btn-settings');
    await page.selectOption('#setting-speed', '0');
    await page.selectOption('#setting-size', '22');
    await page.keyboard.press('Escape');
    await resume();
    await page.click('#btn-settings');
    assert.equal(await page.locator('#setting-speed').inputValue(), '0');
    assert.equal(await page.locator('#setting-size').inputValue(), '22');
    await page.keyboard.press('Escape');
    await page.click('#btn-notebook');
    await page.fill('#nb-search', '不会匹配的关键词');
    assert.equal(await page.locator('#nb-list .clue').count(), 0);
    assert.ok((await page.locator('#nb-list').innerText()).includes('没有匹配'));
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '小屏不能横向溢出');
      const box = await page.locator('#nb-close').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 844, '关闭按钮应可见');
    }
    await page.keyboard.press('Escape');

    // 非加速模式中，打字时返回标题会停止旧播放；继续不会启动两份对话。
    await page.goto(`${url}/`);
    await seed({ scene: 'ch1_widow' });
    await page.click('#btn-menu');
    await page.waitForTimeout(700);
    await page.click('#btn-continue');
    await waitLine();
    const resumedNormal = await state();
    assert.equal(resumedNormal.history.filter((e) => e.raw === SCENES.ch1_widow.lines[0]).length, 1);
    await page.click('#btn-settings');
    await page.selectOption('#setting-speed', '0');
    await page.keyboard.press('Escape');
    await page.click('#log');
    await waitLine();
    assert.equal((await state()).playback.index, 1);
    assert.equal((await state()).history.at(-1).raw, SCENES.ch1_widow.lines[1]);
    console.log('✓ 阅读恢复、旧存档、跨章回看、提示、线索筛选、设置及小屏检查通过');
  } finally {
    await page.close();
  }
}
