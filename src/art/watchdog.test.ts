import { describe, expect, it } from 'vitest';
import { overdue, unseen, WATCH_AFTER, type Sight } from './watchdog';

const view = { w: 1440, h: 900, header: 64 };
const onScreen = { left: 600, right: 650, top: 400, bottom: 520 };
const base: Sight = { mode: 'idle', hidden: false, pageHidden: false, hop: null, fall: null, body: onScreen, view };

describe('watchdog: is he out of sight for no good reason', () => {
  it('standing in view: seen', () => {
    expect(unseen(base)).toBe(false);
  });
  it('hidden, or off screen, or under the header: unseen', () => {
    expect(unseen({ ...base, hidden: true })).toBe(true);
    expect(unseen({ ...base, body: { left: 600, right: 650, top: 1000, bottom: 1120 } })).toBe(true);
    expect(unseen({ ...base, body: { left: 600, right: 650, top: -80, bottom: 40 } })).toBe(true);
    expect(unseen({ ...base, mode: 'sitting', body: { left: -90, right: -40, top: 400, bottom: 520 } })).toBe(true);
  });
  it('a hop within its own length is the ink, not lost; a hop that never ends is', () => {
    expect(unseen({ ...base, mode: 'teleport', hidden: true, hop: { t: 0.8, dur: 1.2 } })).toBe(false);
    expect(unseen({ ...base, mode: 'teleport', hop: { t: 3, dur: 1.2 } })).toBe(true);
    expect(unseen({ ...base, mode: 'teleport', hop: null })).toBe(true);
  });
  it('a fall within its time is fine, wherever he is; past it, only if he landed in view', () => {
    const below = { left: 600, right: 650, top: 1000, bottom: 1120 };
    expect(unseen({ ...base, mode: 'falling', fall: { t: 0.4, T: 0.6 }, body: below })).toBe(false);
    expect(unseen({ ...base, mode: 'falling', fall: { t: 2, T: 0.6 }, body: below })).toBe(true);
    expect(unseen({ ...base, mode: 'falling', fall: { t: 2, T: 0.6 } })).toBe(false);
  });
  it('in the visitor hand, or with the page hidden: never his fault', () => {
    expect(unseen({ ...base, mode: 'carried', body: { left: 600, right: 650, top: -200, bottom: -80 } })).toBe(false);
    expect(unseen({ ...base, mode: 'grabbed', hidden: true })).toBe(false);
    expect(unseen({ ...base, hidden: true, pageHidden: true })).toBe(false);
  });
  it('the stunt and his own whims get no pass', () => {
    expect(unseen({ ...base, mode: 'stunt', body: { left: 600, right: 650, top: -200, bottom: -80 } })).toBe(true);
    expect(unseen({ ...base, mode: 'hopping', hidden: true })).toBe(true);
  });
});

describe('watchdog: when to step in', () => {
  it('only after WATCH_AFTER s unseen in a row', () => {
    let w = overdue(0, true, 1000);
    expect(w).toEqual({ since: 1000, act: false });
    w = overdue(w.since, true, 1000 + WATCH_AFTER * 1000 - 1);
    expect(w.act).toBe(false);
    w = overdue(w.since, true, 1000 + WATCH_AFTER * 1000);
    expect(w.act).toBe(true);
  });
  it('seen again resets it', () => {
    const w = overdue(1000, false, 1500);
    expect(w).toEqual({ since: 0, act: false });
    expect(overdue(w.since, true, 1600).since).toBe(1600);
  });
});
