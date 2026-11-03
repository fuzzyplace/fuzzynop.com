import { describe, expect, it } from 'vitest';
import * as links from './links';
import * as site from './site';
import indexHtml from '../../index.html?raw';
import notFoundHtml from '../../public/404.html?raw';
import manifest from '../../public/site.webmanifest?raw';

/** Every string that can reach the page, the share card or a screen reader. */
const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

describe('copy rules', () => {
  const all = [...strings(site), ...strings(links), indexHtml, notFoundHtml, manifest];

  it('has no em or en dashes anywhere (hard rule, Z 2026-11-02)', () => {
    const bad = all.filter((s) => /[–—]/.test(s));
    expect(bad).toEqual([]);
  });

  it('has no exclamation marks or stock filler', () => {
    const stock = /!|passionate|leverag|synerg|cutting[- ]edge|unlock|empower|journey|delve|tapestry|elevate|seamless|game[- ]changer/i;
    expect(all.flatMap(strings).filter((s) => !s.includes('<!doctype') && stock.test(s))).toEqual([]);
  });
});
