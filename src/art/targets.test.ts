import { describe, expect, it } from 'vitest';
import { POKE_KINDS, poseCss } from './targets';

describe('poseCss', () => {
  it('identity is "none", pivot defaults to bottom centre', () => {
    expect(poseCss(null)).toEqual({ transform: 'none', origin: '50% 100%' });
    expect(poseCss({ x: 0.001, rot: 0.001 })).toEqual({ transform: 'none', origin: '50% 100%' });
  });
  it('writes translate then rotate, rounded to 0.01', () => {
    expect(poseCss({ y: 2.3456, rot: -3.999, ox: 1, oy: 0 })).toEqual({ transform: 'translate(0px, 2.35px) rotate(-4deg)', origin: '100% 0%' });
  });
});

describe('poke kinds', () => {
  it('match the documented contract', () => {
    expect([...POKE_KINDS]).toEqual(['spin', 'lift', 'peek', 'tug', 'rattle', 'twitch', 'tap']);
  });
});
