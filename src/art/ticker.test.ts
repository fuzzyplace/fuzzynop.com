import { describe, expect, it } from 'vitest';
import { createTicker } from './ticker';

function fakeEnv() {
  let t = 0;
  let hidden = false;
  let queued: ((now: number) => void) | null = null;
  let vis: () => void = () => {};
  const env = {
    raf: (cb: (now: number) => void) => ((queued = cb), 1),
    caf: () => void (queued = null),
    now: () => t,
    hidden: () => hidden,
    onVisibility: (cb: () => void) => void (vis = cb),
  };
  const advance = (ms: number) => {
    t += ms;
    const cb = queued;
    queued = null;
    cb?.(t);
  };
  const setHidden = (h: boolean) => ((hidden = h), vis());
  return { env, advance, setHidden, pending: () => queued !== null };
}

describe('ticker', () => {
  it('does not run with nothing awake', () => {
    const f = fakeEnv();
    const tk = createTicker(f.env);
    expect(tk.running).toBe(false);
    expect(f.pending()).toBe(false);
  });

  it('runs while a loop is awake and stops when it sleeps', () => {
    const f = fakeEnv();
    const tk = createTicker(f.env);
    let n = 0;
    const l = tk.loop(() => ++n < 3);
    l.wake();
    expect(tk.running).toBe(true);
    f.advance(16);
    f.advance(16);
    f.advance(16);
    expect(n).toBe(3);
    expect(tk.running).toBe(false);
    l.wake();
    expect(tk.running).toBe(true);
  });

  it('passes dt in seconds, clamped to 50 ms', () => {
    const f = fakeEnv();
    const tk = createTicker(f.env);
    const dts: number[] = [];
    tk.loop((_, dt) => (dts.push(dt), true)).wake();
    f.advance(16);
    f.advance(500);
    expect(dts[0]).toBeCloseTo(0.016);
    expect(dts[1]).toBe(0.05);
  });

  it('pauses when hidden and resumes without a catch-up jump', () => {
    const f = fakeEnv();
    const tk = createTicker(f.env);
    const dts: number[] = [];
    tk.loop((_, dt) => (dts.push(dt), true)).wake();
    f.advance(16);
    f.setHidden(true);
    expect(tk.running).toBe(false);
    f.advance(5000); // nothing queued: no frame
    expect(dts.length).toBe(1);
    f.setHidden(false);
    expect(tk.running).toBe(true);
    f.advance(16);
    expect(dts[1]).toBeCloseTo(0.016);
  });

  it('shares one frame between loops', () => {
    const f = fakeEnv();
    const tk = createTicker(f.env);
    const seen: string[] = [];
    tk.loop(() => (seen.push('a'), true)).wake();
    tk.loop(() => (seen.push('b'), true)).wake();
    f.advance(16);
    expect(seen).toEqual(['a', 'b']);
    expect(tk.size).toBe(2);
  });
});
