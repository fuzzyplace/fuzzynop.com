// WCAG contrast check for key token pairs. Usage: npm run tokens:contrast
import { readFileSync } from 'node:fs';

const t = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url)));
const ref = t.color.ref;
const resolve = (v) => (v.startsWith('{ref.') ? ref[v.slice(5, -1)] : v);
const sys = Object.fromEntries(Object.entries(t.color.sys).map(([k, v]) => [k, resolve(v)]));

const lum = (hex) => {
  const [r, g, b] = hex.replace('#', '').match(/../g).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// [fg, bg, minimum]  4.5 = AA text, 3 = AA large text / UI components
const pairs = [
  ['on-surface', 'surface', 4.5],
  ['on-surface-variant', 'surface', 4.5],
  ['on-surface-variant', 'surface-container-highest', 4.5],
  ['secondary', 'surface', 4.5],
  ['on-primary', 'primary', 4.5],
  ['on-secondary-container', 'secondary-container', 4.5],
  ['inverse-on-surface', 'inverse-surface', 4.5],
  ['error', 'surface', 4.5],
  ['on-paper', 'paper', 4.5],
  ['on-paper-variant', 'paper', 4.5],
  ['accent', 'surface', 3],   // highlight glyphs/lines only — never body text
  ['outline', 'surface', 3],
];

let fail = 0;
for (const [fg, bg, min] of pairs) {
  const r = ratio(sys[fg], sys[bg]);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${fg} on ${bg}`);
}
process.exit(fail ? 1 : 0);
