// Main-thread + frame-timing benchmark for the art engine.
// Usage: npm run build && npx vite preview --port 4173 & node scripts/perf.mjs [url] [--cpu=4] [--runs=3] [--label=name]
// Scenarios: "idle" = hero after the tagline is written (arms swaying, character perched);
//            "scroll" = steady mouse-wheel scroll top → bottom (plates printing, character carried).
// Reports per scenario: main-thread busy ms/s (script, layout, style), long tasks (> 50 ms),
// rAF frame interval p50/p95 and share of frames > 20 ms. CPU throttle emulates a mid laptop.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const url = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const cpu = Number(args.cpu ?? 4);
const runs = Number(args.runs ?? 3);
const label = args.label ?? 'run';

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
};
const median = (xs) => pct(xs, 0.5);

async function measure(page, cdp, act) {
  await page.evaluate(() => {
    window.__frames = [];
    window.__long = [];
    let last = performance.now();
    const loop = (t) => {
      window.__frames.push(t - last);
      last = t;
      window.__raf = requestAnimationFrame(loop);
    };
    window.__raf = requestAnimationFrame(loop);
    window.__lt = new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration)));
    window.__lt.observe({ type: 'longtask' });
  });
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const t0 = Date.now();
  await act();
  const secs = (Date.now() - t0) / 1000;
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const { frames, long } = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    window.__lt.disconnect();
    return { frames: window.__frames.slice(1), long: window.__long };
  });
  const d = (k) => ((m1[k] - m0[k]) * 1000) / secs; // ms per second
  return {
    busy: d('TaskDuration'),
    script: d('ScriptDuration'),
    layout: d('LayoutDuration'),
    style: d('RecalcStyleDuration'),
    longTasks: long.length,
    longMax: long.length ? Math.max(...long) : 0,
    fps: frames.length / secs,
    p50: pct(frames, 0.5),
    p95: pct(frames, 0.95),
    jank: frames.filter((f) => f > 20).length / Math.max(1, frames.length),
  };
}

async function runOnce(browser, vw, vh) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(url, { waitUntil: 'networkidle' });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.waitForTimeout(6000); // tagline written, arm parked
  const idle = await measure(page, cdp, () => page.waitForTimeout(5000));
  await page.mouse.move(vw / 2, vh / 2);
  const scroll = await measure(page, cdp, async () => {
    const total = await page.evaluate(() => document.body.scrollHeight - innerHeight);
    for (let y = 0; y < total; y += 80) {
      await page.mouse.wheel(0, 80);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(500);
  });
  await page.close();
  return { idle, scroll };
}

const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
const out = {};
for (const [vw, vh, name] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
  const all = [];
  for (let i = 0; i < runs; i++) all.push(await runOnce(browser, vw, vh));
  out[name] = {};
  for (const sc of ['idle', 'scroll']) {
    const keys = Object.keys(all[0][sc]);
    out[name][sc] = Object.fromEntries(keys.map((k) => [k, median(all.map((r) => r[sc][k]))]));
  }
}
await browser.close();

const f = (v, n = 1) => v.toFixed(n).padStart(7);
console.log(`\n${label}  (CPU ×${cpu}, median of ${runs})`);
console.log('                     busy  script  layout   style  long>50  longMax    fps   p50ms   p95ms  >20ms');
for (const [name, r] of Object.entries(out))
  for (const [sc, m] of Object.entries(r))
    console.log(
      `${`${name}/${sc}`.padEnd(16)} ${f(m.busy)} ${f(m.script)} ${f(m.layout)} ${f(m.style)} ${f(m.longTasks, 0)}  ${f(m.longMax, 0)} ${f(m.fps)} ${f(m.p50)} ${f(m.p95)}  ${f(m.jank * 100, 0)}%`,
    );
console.log('(busy/script/layout/style = main-thread ms per second)');
mkdirSync('screenshots', { recursive: true });
writeFileSync(`screenshots/perf-${label}.json`, JSON.stringify({ cpu, runs, out }, null, 2));
