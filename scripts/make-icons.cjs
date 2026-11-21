// Renders icons/icon.svg to the PNG icons with the pre-installed Chromium
// (Playwright). The page loads the local fonts so the digits match the app.
//   node scripts/make-icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'icons/icon.svg'), 'utf8');
const font = (f) => `data:font/woff2;base64,${fs.readFileSync(path.join(root, 'fonts', f)).toString('base64')}`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (size, file, { maskable = false } = {}) => {
    // maskable: content inside the inner 80 % safe zone, full-bleed background
    const inner = maskable ? Math.round(size * 0.78) : size;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>
      @font-face { font-family: 'Source Serif 4'; src: url(${font('source-serif-4.woff2')}); font-weight: 200 900; }
      @font-face { font-family: 'Source Sans 3'; src: url(${font('source-sans-3.woff2')}); font-weight: 200 900; }
      html, body { margin: 0; width: ${size}px; height: ${size}px; background: ${maskable ? '#f7f5ef' : 'transparent'}; display: grid; place-items: center; }
      svg { width: ${inner}px; height: ${inner}px; display: block; }
    </style>${svg}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(root, 'icons', file), omitBackground: !maskable });
  };
  await render(192, 'icon-192.png');
  await render(512, 'icon-512.png');
  await render(512, 'icon-maskable-512.png', { maskable: true });
  await render(180, 'apple-touch-icon.png', { maskable: true });
  await browser.close();
})();
