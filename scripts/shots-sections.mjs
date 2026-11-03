// Viewport shots of each section after scrolling to it (mouse.wheel so prints/reveals fire).
// Usage: node scripts/shots-sections.mjs [url] [--prefix=name] [--width=1440]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const url = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const prefix = process.argv.find((a) => a.startsWith('--prefix='))?.slice(9) ?? 'sec';
const width = Number(process.argv.find((a) => a.startsWith('--width='))?.slice(8) ?? 1440);
mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(4500);
const ids = await page.evaluate(() => [...document.querySelectorAll('main [id]')].map((e) => e.id));
for (const id of ids) {
  const target = await page.evaluate((id) => document.getElementById(id).getBoundingClientRect().top + scrollY - 120, id);
  while (true) {
    const y = await page.evaluate(() => scrollY);
    if (Math.abs(target - y) < 60) break;
    await page.mouse.wheel(0, Math.sign(target - y) * Math.min(300, Math.abs(target - y)));
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `screenshots/${prefix}-${id}.png` });
  console.log(`screenshots/${prefix}-${id}.png`);
}
await browser.close();
