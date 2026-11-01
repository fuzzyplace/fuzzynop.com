import { describe, expect, it } from 'vitest';
import { tie, tieTitle } from './typeset';

const NB = ' ';
describe('tie (running copy)', () => {
  it('ties a short final pair, or three when the last two are tiny', () => {
    expect(tie('I started out tracking bad guys.')).toBe(`I started out tracking${NB}bad${NB}guys.`);
    expect(tie('leading in the security space.')).toBe(`leading in the security${NB}space.`);
  });
  it('leaves long final pairs to balanced wrapping', () => {
    expect(tie('as machines and humans become indistinguishable.')).toBe('as machines and humans become indistinguishable.');
  });
  it('short strings stay on one line', () => {
    expect(tie('Red teaming')).toBe(`Red${NB}teaming`);
  });
});
describe('tieTitle (headings)', () => {
  it('keeps the slash with the word before it', () => {
    expect(tieTitle('Hacker / Executive')).toBe(`Hacker${NB}/ Executive`);
  });
  it('glues a short opening word', () => {
    expect(tieTitle('The human side')).toBe(`The${NB}human side`);
    expect(tieTitle('What I’m looking for')).toBe(`What${NB}I’m looking${NB}for`);
  });
  it('does not glue a long final pair (display lines must not overflow)', () => {
    expect(tieTitle('Setting the vibe has never been more important.')).toBe('Setting the vibe has never been more important.');
  });
});
