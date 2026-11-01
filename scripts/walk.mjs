// Mouse-follow check for the character (v2.3 §3.1): scripted pointer paths, frames mid-walk and at rest,
// a 390px tap test and a reduced-motion check. Logs his x over time from the live SVG transform.
// Usage: npm run build && npx vite preview --port 4190 & node scripts/walk.mjs [url] [--prefix=name]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const prefix = process.argv.find((a) => a.startsWith('--prefix='))?.slice(9) ?? 'walk';
const url = pos[0] ?? 'http://localhost:4190';
mkdirSync('screenshots', { recursive: true });
const out = (name) => `screenshots/${prefix}-${name}.png`;

const charState = (page) =>
  page.evaluate(() => {
    const g = document.querySelector('svg.fixed.z-30 > g > g');
    const tr = g?.getAttribute('transform') ?? '';
    const m = tr.match(/translate\(([-\d.]+) ([-\d.]+)\).*scale\(([-\d.]+) ([-\d.]+)\)/);
    return m ? { x: +m[1], y: +m[2], sx: +m[3] } : null;
  });
async function crop(page, name, w = 360, h = 300) {
  const c = await charState(page);
  const vp = page.viewportSize();
  const x = Math.max(0, Math.min(vp.width - w, (c?.x ?? 0) - w / 2));
  const y = Math.max(0, Math.min(vp.height - h, (c?.y ?? 0) - h * 0.6));
  await page.screenshot({ path: out(name), clip: { x, y, width: w, height: h } });
  return c;
}
const log = (label, c) => console.log(`${label.padEnd(26)} x=${c?.x.toFixed(1)} y=${c?.y.toFixed(1)} facing=${c ? Math.sign(c.sx) : '?'}`);

const browser = await chromium.launch();

// ---- desktop: walk left toward the cursor, then back right, then beyond the edge ----
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000); // tagline written, he's landed on the ground
  let c = await charState(page);
  log('desktop landed', c);
  await page.screenshot({ path: out('desktop-landed') });
  // cursor sweeps in from the right, settles 260px to his left
  await page.mouse.move(1400, 500);
  await page.mouse.move(c.x - 260, 760, { steps: 30 });
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(160);
    c = await crop(page, `desktop-mid-${i}`);
    log(`desktop mid ${i}`, c);
  }
  await page.waitForTimeout(5000);
  c = await crop(page, 'desktop-rest-left');
  log('desktop rest (left)', c);
  await page.screenshot({ path: out('desktop-rest-full') });
  // cursor far right, beyond the walkable span: he stops at the edge, facing it
  await page.mouse.move(1435, 300, { steps: 20 });
  await page.waitForTimeout(1500);
  c = await crop(page, 'desktop-turn');
  log('desktop walking right', c);
  await page.waitForTimeout(9000);
  c = await crop(page, 'desktop-edge');
  log('desktop at edge', c);
  // cursor above him: head glance
  await page.mouse.move(c.x + 60, 120, { steps: 10 });
  await page.waitForTimeout(500);
  c = await crop(page, 'desktop-look-up');
  log('desktop look up', c);
  // scroll to a plate: carried, then walks on the plate
  const plateMid = () =>
    page.evaluate(() => {
      for (const el of document.querySelectorAll('[data-printed="1"][data-perch]')) {
        const r = el.getBoundingClientRect();
        if (r.top > innerHeight * 0.3 && r.top < innerHeight * 0.6) return { left: r.left, right: r.right, top: r.top };
      }
      return null;
    });
  let plate = null;
  for (let i = 0; i < 40 && !plate; i++) {
    await page.mouse.wheel(0, 150);
    await page.waitForTimeout(250);
    plate = await plateMid();
  }
  await page.waitForTimeout(2500);
  c = await charState(page);
  log(`desktop on plate ${plate ? `[${plate.left.toFixed(0)}–${plate.right.toFixed(0)}]` : '(none found)'}`, c);
  await page.screenshot({ path: out('desktop-plate-landed') });
  // cursor to the far side of the plate
  const far = plate && c.x - plate.left > plate.right - c.x ? plate.left + 40 : (plate?.right ?? 1400) - 40;
  await page.mouse.move(far, c.y + 100, { steps: 20 });
  await page.waitForTimeout(1200);
  c = await crop(page, 'desktop-plate-walk');
  log('desktop plate walking', c);
  await page.waitForTimeout(5000);
  c = await charState(page);
  log('desktop plate rest', c);
  await page.screenshot({ path: out('desktop-plate-full') });
  await page.close();
}

// ---- 390px: tap to the left of him ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  let c = await charState(page);
  log('mobile landed', c);
  await page.touchscreen.tap(60, 800);
  await page.waitForTimeout(1200);
  c = await crop(page, 'mobile-walk', 300, 260);
  log('mobile walking', c);
  await page.waitForTimeout(6000);
  c = await charState(page);
  log('mobile rest', c);
  await page.screenshot({ path: out('mobile-rest') });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(`mobile horizontal overflow: ${overflow}`);
  await ctx.close();
}

// ---- reduced motion: no walking, only turns ----
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const a = await charState(page);
  log('reduced start', a);
  await page.mouse.move(a.x + 300, 700, { steps: 10 });
  await page.waitForTimeout(800);
  const b = await crop(page, 'reduced-right');
  log('reduced cursor right', b);
  await page.mouse.move(200, 700, { steps: 10 });
  await page.waitForTimeout(3000);
  const c = await crop(page, 'reduced-left');
  log('reduced cursor left', c);
  console.log(`reduced moved: ${Math.abs(c.x - a.x) > 0.5 ? 'YES (bad)' : 'no'}; turned: ${Math.sign(b.sx) !== Math.sign(c.sx) ? 'yes' : 'NO (bad)'}`);
  await page.close();
}
await browser.close();
