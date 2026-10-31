// Full-page screenshots at mobile + desktop for design review.
// Setup once: npm i -D playwright && npx playwright install chromium
// Usage: npm run build && npx vite preview --port 4173 & node scripts/screenshot.mjs [url]
// Note: scroll with mouse.wheel — html{scroll-behavior:smooth} makes window.scrollTo lazy, so whileInView reveals never fire.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173';
mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch();
for (const [w, h, name] of [[375, 812, 'mobile'], [1440, 900, 'desktop']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(url, { waitUntil: 'networkidle' });
  const total = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < total; y += 300) { await page.mouse.wheel(0, 300); await page.waitForTimeout(120); }
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  console.log(`${name}: screenshots/${name}.png${overflow ? '  ⚠ horizontal overflow' : ''}`);
}
await browser.close();
