// Renders public/apple-touch-icon.png (180x180 home-screen icon) from the live tokens and fonts.
// Setup once: npm i && npx playwright install chromium
// Usage: node scripts/touch-icon.mjs
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const href = (p) => pathToFileURL(resolve(root, p)).href;

// The mark comes from src/content/site.ts (the single source of copy).
const mark = readFileSync(resolve(root, 'src/content/site.ts'), 'utf8').match(/mark:\s*'([^']*)'/)?.[1];
if (!mark) throw new Error('touch-icon: could not read ui.mark from src/content/site.ts');

// pointy-top hexagon
const hex = (r) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(90 + r * Math.cos(a)).toFixed(1)},${(90 + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const html = `<!doctype html>
<meta charset="utf-8" />
<link rel="stylesheet" href="${href('src/styles/tokens.css')}" />
<link rel="stylesheet" href="${href('src/styles/fonts.css')}" />
<style>
  * { margin: 0; }
  body { width: 180px; height: 180px; overflow: hidden; background: var(--md-sys-color-background); }
  .face { fill: var(--md-sys-color-paper); }
  .line { fill: none; stroke: var(--md-sys-color-on-paper); stroke-width: 2; }
  text { font: 400 34px var(--md-ref-typeface-mono); letter-spacing: 0.12em; fill: var(--md-sys-color-on-paper); }
</style>
<svg viewBox="0 0 180 180" width="180" height="180" aria-hidden="true">
  <polygon class="face" points="${hex(80)}" />
  <polygon class="line" points="${hex(68)}" />
  <text x="92" y="90" text-anchor="middle" dominant-baseline="central">${mark}</text>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
// A file:// page, so the linked token and font files (also file://) are allowed to load.
const tmp = mkdtempSync(join(tmpdir(), 'icon-'));
writeFileSync(join(tmp, 'icon.html'), html);
await page.goto(pathToFileURL(join(tmp, 'icon.html')).href, { waitUntil: 'load' });
rmSync(tmp, { recursive: true });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: resolve(root, 'public/apple-touch-icon.png'), type: 'png' });
await browser.close();
console.log('public/apple-touch-icon.png written');
