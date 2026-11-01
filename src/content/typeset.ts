/**
 * Typesetting so no line ends with a word or two dangling. CSS `text-wrap: balance / pretty`
 * (global.css) does most of the work; these helpers add non-breaking spaces where it can't.
 *
 * tie(): running copy. Keeps the last words together when they're short enough to travel as a
 * unit (two words ≤ 20 characters; three when the last two are tiny). Long final pairs are left
 * to the browser so a narrow column doesn't strand the word before them.
 *
 * tieTitle(): headings and display lines. Glues a short opening word to the next ("The human"),
 * keeps a slash with the word before it ("Hacker /"), and ties a short final pair.
 */
const NB = ' ';
const len = (w: string[]) => w.join(' ').length;

export function tie(s: string): string {
  const words = s.trim().split(/ +/);
  if (words.length < 3) return words.join(NB);
  let keep = 0;
  if (words.length >= 4 && len(words.slice(-2)) <= 10 && len(words.slice(-3)) <= 20) keep = 3;
  else if (len(words.slice(-2)) <= 20) keep = 2;
  if (!keep) return words.join(' ');
  return [...words.slice(0, words.length - keep), words.slice(-keep).join(NB)].join(' ');
}

export function tieTitle(s: string): string {
  let words = s.trim().split(/ +/);
  if (words.length < 2) return s;
  // a slash stays with the word before it
  words = words.reduce<string[]>((acc, w) => (w === '/' && acc.length ? [...acc.slice(0, -1), `${acc[acc.length - 1]}${NB}/`] : [...acc, w]), []);
  // a short opening word never sits alone
  if (words.length >= 3 && words[0].length <= 4) words = [`${words[0]}${NB}${words[1]}`, ...words.slice(2)];
  // short final pair travels together
  if (words.length >= 3 && len(words.slice(-2)) <= 12) words = [...words.slice(0, -2), words.slice(-2).join(NB)];
  return words.join(' ');
}
