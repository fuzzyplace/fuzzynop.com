import { describe, expect, it } from 'vitest';
import { TRICKS, canTrick, endLetters, lettersAt, meAt, planTrick, type LBox, type Me } from './letterPlay';

// "past," at a plate title size: letters 30 px wide, 70 px line box; he stands right of it
const word: LBox[] = ['p', 'a', 's', 't', ','].map((ch, i) => ({ key: `t:${i}`, ch, left: 300 + i * 30, right: 330 + i * 30, top: 100, bottom: 170 }));
const me: Me = { x: 300 + 5 * 30 + 14, feet: 170, facing: -1, scale: 1.3 };
const r = () => 0.42;

describe('letter play', () => {
  it('works on the letters, not the punctuation, nearest him', () => {
    const [end, prev] = endLetters(word, -1)!;
    expect(end.ch).toBe('t');
    expect(prev!.ch).toBe('s');
    expect(endLetters(word, 1)![0].ch).toBe('p');
  });
  it('needs the word within reach, at hand height', () => {
    expect(canTrick('spin', word, me)).toBe(true);
    expect(canTrick('spin', word, { ...me, x: me.x + 200 })).toBe(false);
    expect(canTrick('spin', word, { ...me, feet: 600 })).toBe(false);
    expect(canTrick('swap', word.slice(0, 1), { ...me, x: 330 + 14 })).toBe(false);
  });
  for (const trick of TRICKS) {
    it(`${trick}: 3 to 6 s, ends with every letter home`, () => {
      const p = planTrick(trick, word, me, r)!;
      expect(p).not.toBeNull();
      expect(p.dur).toBeGreaterThanOrEqual(3);
      expect(p.dur).toBeLessThanOrEqual(6);
      // moves something in the middle
      const mid = lettersAt(p, word, me, p.dur * 0.5);
      expect([...mid.values()].some((q) => Math.abs(q.x ?? 0) + Math.abs(q.y ?? 0) + Math.abs(q.rot ?? 0) > 1)).toBe(true);
      // home at the end and after it
      expect(lettersAt(p, word, me, p.dur).size).toBe(0);
      const last = lettersAt(p, word, me, p.dur - 1e-3);
      for (const q of last.values()) {
        expect(Math.abs(q.x ?? 0)).toBeLessThan(1.5);
        expect(Math.abs(q.y ?? 0)).toBeLessThan(1.5);
        expect(Math.abs(q.rot ?? 0) % 360).toBeLessThan(3);
      }
      // and he's back where he started
      expect(Math.abs(meAt(p, p.dur - 1e-3).dx)).toBeLessThan(1);
    });
  }
  it('only moves the word he is beside (one word at a time)', () => {
    for (const trick of TRICKS) {
      const p = planTrick(trick, word, me, r)!;
      for (let t = 0; t < p.dur; t += 0.1) for (const k of lettersAt(p, word, me, t).keys()) expect(word.some((g) => g.key === k)).toBe(true);
    }
  });
  it('nudge keeps the word crooked by 4 degrees at most', () => {
    const p = planTrick('nudge', word, me, r)!;
    for (let t = 0; t < p.dur; t += 0.05) for (const q of lettersAt(p, word, me, t).values()) expect(Math.abs(q.rot ?? 0)).toBeLessThanOrEqual(4.5);
  });
  it('carry takes a step away and comes back', () => {
    const p = planTrick('carry', word, me, r)!;
    const dxs = Array.from({ length: 60 }, (_, i) => meAt(p, (p.dur * i) / 60).dx);
    expect(Math.max(...dxs)).toBeGreaterThan(10); // away from the word (he faces -1, steps +x)
  });
});
