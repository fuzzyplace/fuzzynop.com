// Renders public/og.png (1200x630 share card) from the live tokens, fonts and hero copy.
// Setup once: npm i && npx playwright install chromium
// Usage: node scripts/og.mjs
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const href = (p) => pathToFileURL(resolve(root, p)).href;

// Copy comes from src/content/site.ts (the single source of copy), never from here.
const site = readFileSync(resolve(root, 'src/content/site.ts'), 'utf8');
const heroSrc = site.slice(site.indexOf('export const hero'));
const str = (key) => heroSrc.match(new RegExp(`${key}:\\s*'([^']*)'`))?.[1];
const tagline = [...heroSrc.match(/tagline:\s*\[([^\]]*)\]/)[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
const eyebrow = str('eyebrow');
const lede = str('lede');
if (!eyebrow || !lede || !tagline.length) throw new Error('og: could not read hero copy from src/content/site.ts');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const hex = (cx, cy, r) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
const R = 58;
const hexes = [];
for (let col = 0; col < 4; col++)
  for (let row = 0; row < 4; row++) {
    const cx = 820 + col * R * 1.5;
    const cy = 150 + row * R * Math.sqrt(3) + (col % 2 ? (R * Math.sqrt(3)) / 2 : 0);
    hexes.push(`<polygon points="${hex(cx, cy, R - 5)}" />`);
  }

const html = `<!doctype html>
<meta charset="utf-8" />
<link rel="stylesheet" href="${href('src/styles/tokens.css')}" />
<link rel="stylesheet" href="${href('src/styles/fonts.css')}" />
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1200px; height: 630px; overflow: hidden; position: relative;
    background:
      radial-gradient(ellipse 46% 62% at 78% 42%,
        color-mix(in srgb, var(--md-sys-color-fog-mid) 62%, transparent) 0%,
        color-mix(in srgb, var(--md-sys-color-fog-mid) 22%, transparent) 42%,
        transparent 74%),
      var(--md-sys-color-background);
    color: var(--md-sys-color-on-surface);
    padding: 118px 96px 0;
  }
  svg { position: absolute; inset: 0; }
  polygon { fill: none; stroke: color-mix(in srgb, var(--md-sys-color-fog-light) 16%, transparent); stroke-width: 2; }
  p, h1 { position: relative; }
  .eyebrow { font: 400 18px/1 var(--md-ref-typeface-mono); letter-spacing: 0.24em; text-transform: uppercase; color: var(--md-ref-gray-500); }
  h1 { font: 400 92px/1.03 var(--md-ref-typeface-display); letter-spacing: -0.015em; margin-top: 30px; }
  h1 span { display: block; white-space: nowrap; }
  .lede { font: 400 25px/1.4 var(--md-ref-typeface-sans); color: var(--md-ref-gray-400); margin-top: 44px; }
</style>
<svg viewBox="0 0 1200 630" aria-hidden="true">${hexes.join('')}</svg>
<p class="eyebrow">${esc(eyebrow)}</p>
<h1>${tagline.map((l) => `<span>${esc(l)}</span>`).join('')}</h1>
<p class="lede">${esc(lede)}</p>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
// A file:// page, so the linked token and font files (also file://) are allowed to load.
const tmp = mkdtempSync(join(tmpdir(), 'og-'));
writeFileSync(join(tmp, 'og.html'), html);
await page.goto(pathToFileURL(join(tmp, 'og.html')).href, { waitUntil: 'load' });
rmSync(tmp, { recursive: true });
await page.evaluate(() => document.fonts.ready);
const overflow = await page.evaluate(() => [...document.querySelectorAll('h1 span, .lede')].some((el) => el.getBoundingClientRect().right > 1200 - 48));
if (overflow) throw new Error('og: text runs past the right margin; shorten the copy or lower the type size');
await page.screenshot({ path: resolve(root, 'public/og.png'), type: 'png' });
await browser.close();
console.log('public/og.png written');
