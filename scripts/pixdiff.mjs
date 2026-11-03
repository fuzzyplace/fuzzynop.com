// Pixel diff of two PNGs (same size). Usage: node scripts/pixdiff.mjs a.png b.png
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2);
const br = await chromium.launch(); const p = await br.newPage();
const r = await p.evaluate(async ([a, b]) => {
  const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
  const [A, B] = await Promise.all([load(a), load(b)]);
  if (A.width !== B.width || A.height !== B.height) return { size: [A.width, A.height, B.width, B.height] };
  const px = (I) => { const c = new OffscreenCanvas(I.width, I.height); const x = c.getContext('2d'); x.drawImage(I, 0, 0); return x.getImageData(0, 0, I.width, I.height).data; };
  const da = px(A), db = px(B); let n = 0, max = 0, y0 = 1e9, y1 = -1, x0 = 1e9, x1 = -1;
  for (let i = 0; i < da.length; i += 4) { const d = Math.max(Math.abs(da[i]-db[i]), Math.abs(da[i+1]-db[i+1]), Math.abs(da[i+2]-db[i+2])); if (d > 0) { n++; max = Math.max(max, d); const y = (i/4/A.width)|0; y0 = Math.min(y0,y); y1 = Math.max(y1,y); const x = (i/4)%A.width; x0 = Math.min(x0,x); x1 = Math.max(x1,x);} }
  return { w: A.width, h: A.height, diffPx: n, max, box: n ? [x0, y0, x1, y1] : null };
}, [a, b].map((f) => 'data:image/png;base64,' + readFileSync(f).toString('base64')));
console.log(a.split('/').pop(), 'vs', b.split('/').pop(), JSON.stringify(r)); await br.close();
