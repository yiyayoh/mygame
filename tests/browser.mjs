// 功能回归使用系统字体，避免 Google Fonts 的网络状态干扰游戏检查。
// 仅替换外部字体样式表；游戏脚本、样式和其他资源错误仍照常检查。
export async function createTestPage(browser, options = {}) {
  const page = await browser.newPage(options);
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '/* Use system fonts in functional tests. */' }));
  return page;
}
