// 把 characters.mjs 中的矢量立绘导出为 art/sprites/*.svg 和 game/figure/*.png（透明背景）。
// 依赖 Playwright（npm i -D playwright 或全局安装）。用法：node scripts/sprites/render.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { CHARACTERS, renderSVG } from './characters.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SVG_DIR = join(ROOT, 'art', 'sprites');
const PNG_DIR = join(ROOT, 'game', 'figure');
mkdirSync(SVG_DIR, { recursive: true });
mkdirSync(PNG_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1440 } });
for (const [key, ch] of Object.entries(CHARACTERS)) {
  for (const expr of ch.expressions) {
    const svg = renderSVG(key, expr);
    const name = `${key}_${expr}`;
    writeFileSync(join(SVG_DIR, `${name}.svg`), svg);
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.locator('svg').screenshot({ path: join(PNG_DIR, `${name}.png`), omitBackground: true });
    console.log('rendered', name);
  }
}
await browser.close();
