// Full-page screenshots at desktop, 390px mobile and reduced motion for design review.
// Setup once: npm i && npx playwright install chromium
// Usage: npm run build && npx vite preview --port 4173 & node scripts/screenshot.mjs [url] [--prefix=name]
// Note: scroll with mouse.wheel — html{scroll-behavior:smooth} makes window.scrollTo lazy, so reveals never fire.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const prefix = process.argv.find((a) => a.startsWith('--prefix='))?.slice(9);
const url = pos[0] ?? 'http://localhost:4173';
const out = (name) => `screenshots/${prefix ? `${prefix}-` : ''}${name}.png`;
mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch();
for (const [w, h, name, reducedMotion] of [
  [390, 844, 'mobile', 'no-preference'],
  [1440, 900, 'desktop', 'no-preference'],
  [1440, 900, 'desktop-reduced', 'reduce'],
  [390, 844, 'mobile-reduced', 'reduce'],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion });
  await page.goto(url, { waitUntil: 'networkidle' });
  const total = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < total; y += 300) { await page.mouse.wheel(0, 300); await page.waitForTimeout(120); }
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(reducedMotion === 'reduce' ? 3000 : 1500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.screenshot({ path: out(name), fullPage: true });
  console.log(`${name}: ${out(name)}${overflow ? '  ⚠ horizontal overflow' : ''}`);
}
await browser.close();
