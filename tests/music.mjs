import assert from 'node:assert/strict';
import { createTestPage } from './browser.mjs';

export async function checkMusic(browser, url, errors) {
  const page = await createTestPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    window.testAudioContexts = [];
    window.testCompressors = [];
    window.AudioContext = class extends Base {
      constructor(...args) { super(...args); window.testAudioContexts.push(this); }
      createDynamicsCompressor() { const node = super.createDynamicsCompressor(); window.testCompressors.push(node); return node; }
    };
  });
  const seed = async (save) => {
    await page.evaluate((save) => localStorage.setItem('seventh-classroom/save', JSON.stringify(save)), save);
    await page.reload();
    await page.click('#btn-continue');
  };
  try {
    await page.goto(`${url}/?fast`);
    assert.equal(await page.evaluate(() => testAudioContexts.length), 0, '首次操作前不得创建音频上下文');
    await page.click('#btn-title-music');
    await page.waitForFunction(() => document.querySelector('#app').dataset.musicState === 'playing');
    assert.equal(await page.locator('#btn-title-music').getAttribute('aria-pressed'), 'true', '首次点击应播放而非关闭音乐');
    await page.evaluate(() => { window.testAnalyser = testAudioContexts[0].createAnalyser(); testCompressors[0].connect(testAnalyser); });
    await page.waitForFunction(() => { const data = new Float32Array(testAnalyser.fftSize); testAnalyser.getFloatTimeDomainData(data); return data.some((v) => Math.abs(v) > 0.00001); });

    await page.click('#btn-title-settings');
    await page.click('#btn-sound');
    assert.equal(await page.evaluate(() => testAudioContexts.length), 1, '音乐与雨声应共用一个上下文');
    await page.click('#btn-music');
    assert.equal(await page.locator('#app').getAttribute('data-music-state'), 'muted');
    assert.equal(await page.locator('#btn-sound').getAttribute('aria-pressed'), 'true', '关闭音乐不应关闭雨声');
    await page.click('#btn-music');
    await page.click('#btn-sound');
    await page.locator('#music-volume').focus();
    await page.keyboard.press('Home');
    assert.equal(await page.locator('#music-volume-value').innerText(), '0%');
    await page.waitForTimeout(500);
    const quietPeak = await page.evaluate(() => { const data = new Float32Array(testAnalyser.fftSize); testAnalyser.getFloatTimeDomainData(data); return Math.max(...data.map(Math.abs)); });
    assert.ok(quietPeak < 0.00001, '音量为零时实际输出应静音');
    await page.evaluate(() => { const slider = document.querySelector('#music-volume'); slider.value = '43'; slider.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('#btn-music');
    await page.click('#settings-close');

    // 静音偏好、音量及读档场景一起恢复；关闭音乐后点击正文不会擅自重新开启。
    await seed({ mode: 'hub', scene: 'ch4_open', hub: 'hub4a', ded: null, q: 0, clues: [], done: [], mistakes: 0, hubTab: 'loc', hubSel: null });
    assert.equal(await page.locator('#app').getAttribute('data-music-cue'), 'tension');
    assert.equal(await page.locator('#app').getAttribute('data-music-state'), 'muted');
    assert.equal(await page.evaluate(() => testAudioContexts.length), 0);
    await page.click('#btn-settings');
    assert.equal(await page.locator('#music-volume').inputValue(), '43');
    await page.click('#btn-music');
    await page.waitForFunction(() => document.querySelector('#app').dataset.musicState === 'playing');
    assert.equal(await page.evaluate(() => testAudioContexts.length), 1);
    await page.setViewportSize({ width: 320, height: 844 });
    const bounds = await page.locator('#settings-close').boundingBox();
    assert.ok(bounds.y + bounds.height <= 844 && bounds.x + bounds.width <= 320);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.click('#settings-close');

    // 用真实音频时钟检查后台暂停、快速切换和尾音回收。
    await page.evaluate(async () => {
      const { MusicDirector } = await import('./js/music.js');
      window.testDirector = new MusicDirector();
      await testDirector.unlock();
      testDirector.setHidden(true);
    });
    await page.waitForFunction(() => testDirector.status.contextState === 'suspended');
    assert.equal(await page.evaluate(() => testDirector.status.layers), 0);
    await page.evaluate(() => { testDirector.setCue('reflection'); testDirector.setHidden(false); });
    await page.waitForFunction(() => testDirector.status.contextState === 'running' && testDirector.current?.cue === 'reflection');
    assert.ok(await page.evaluate(() => { const old = testDirector.current; testDirector.setCue('reflection'); return testDirector.current === old; }), '同一配乐不应因重复操作而重启');
    await page.evaluate(() => { for (const cue of ['title', 'deduction', 'tension', 'reflection', 'recording', 'afterglow']) testDirector.setCue(cue); });
    await page.waitForFunction(() => testDirector.status.layers === 1, null, { timeout: 5000 });
    assert.ok(await page.evaluate(() => testDirector.status.voices < 100), '快速切换后不应积累旧音符');
    await page.evaluate(() => testDirector.setEnabled(false));
    await page.waitForFunction(() => testDirector.status.layers === 0);
    await page.evaluate(() => testDirector.dispose());

    // 实际离线渲染所有配乐：均有声音、满音量无削波、零音量为静音。
    const renders = await page.evaluate(async () => {
      const { MUSIC_SCORES, renderMusicPreview } = await import('./js/music.js');
      const out = [];
      for (const cue of Object.keys(MUSIC_SCORES)) {
        const context = new OfflineAudioContext(2, 44100 * 8, 44100);
        const buffer = await renderMusicPreview(context, cue, 8, 1);
        let peak = 0, energy = 0;
        for (const value of buffer.getChannelData(0)) { peak = Math.max(peak, Math.abs(value)); energy += value * value; }
        out.push({ cue, peak, rms: Math.sqrt(energy / buffer.length) });
      }
      const muted = await renderMusicPreview(new OfflineAudioContext(2, 44100 * 4, 44100), 'title', 4, 0);
      return { out, mutedPeak: Math.max(...muted.getChannelData(0).subarray(0, 20000).map(Math.abs)) };
    });
    for (const result of renders.out) assert.ok(Number.isFinite(result.rms) && result.rms > 0.0001 && result.peak < 0.98, `配乐输出异常：${result.cue}`);
    assert.equal(renders.mutedPeak, 0);
    console.log('✓ 场景配乐、实际声音输出、静音记忆、雨声独立控制、后台暂停和淡出回收检查通过');
  } finally {
    await page.close();
  }

  // 不支持声音时仍可继续游戏，不产生未处理异常。
  const silentPage = await createTestPage(browser);
  silentPage.on('pageerror', (e) => errors.push(e.message));
  try {
    await silentPage.addInitScript(() => { window.AudioContext = undefined; window.webkitAudioContext = undefined; });
    await silentPage.goto(`${url}/?fast`);
    await silentPage.click('#btn-new');
    await silentPage.locator('#next-hint:not(.hidden)').waitFor();
    assert.equal(await silentPage.locator('#app').getAttribute('data-music-state'), 'unavailable');
  } finally { await silentPage.close(); }
}
