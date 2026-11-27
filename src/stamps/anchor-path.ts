// A sticker's anchor names the element it lies on. A section, card or other part of the page
// marked with data-stamp-anchor is named as it is ("intro"). An element inside one (a heading, a
// picture, a line of text) is named by the way down to it from there: each step is the element's
// place among its parent's children and its tag, so "intro--1div-0h1" is the first child, an
// <h1>, of the second child, a <div>, of "intro". The sticker then stays on that element however
// the page is laid out on another screen, where the section around it changes shape.
// A sticker on words names the character under it, so it moves with its word when the lines wrap
// anew: after the way down to the element holding the words, "t" and the run of words' place
// among the element's runs (its text nodes that are not blank), then "c" and the character's place
// in the run, as "intro--0div-1h1-0t-2c" (the third character of "しーぴー"). A run alone ("-0t")
// stands for a character too far into it to be counted. No HTML element is called "t" or "c".
// The name still fits ANCHOR_PATTERN (limits.ts), so the stored format and the rules are as before.
import { ANCHOR_PATTERN } from './limits.ts';

/** Between the marked name and the way down; no data-stamp-anchor name has it (dist.test.ts). */
export const PATH_MARK = '--';

export type Step = { index: number; tag: string };

/** The tag of a step to a run of words (a text node that is not blank), not to an element. */
export const TEXT_STEP = 't';
/** The tag of the step after a run of words, to a character in it. */
export const CHAR_STEP = 'c';

// Steps to elements, then at most a run of words, then at most a character in that run.
function inOrder(steps: readonly Step[]) {
  const words = steps.findIndex((s) => s.tag === TEXT_STEP || s.tag === CHAR_STEP);
  if (words < 0) return true;
  const rest = steps
    .slice(words)
    .map((s) => s.tag)
    .join(' ');
  return rest === TEXT_STEP || rest === `${TEXT_STEP} ${CHAR_STEP}`;
}

const anchorPattern = new RegExp(ANCHOR_PATTERN);
// A step's tag: an ordinary HTML element's name (no custom elements, which have a hyphen).
const STEP = /^(\d{1,3})([a-z][a-z0-9]{0,15})$/;

/** The data-stamp-anchor name an anchor starts from. */
export const markedName = (anchor: string) => anchor.split(PATH_MARK, 1)[0];

/** The anchor of an element reached from the marked `name` by `steps`; null when it cannot be stored. */
export function joinAnchor(name: string, steps: readonly Step[]): string | null {
  if (name.includes(PATH_MARK)) return null;
  if (!inOrder(steps)) return null;
  for (const s of steps) if (!STEP.test(`${s.index}${s.tag}`)) return null;
  const anchor = steps.length
    ? `${name}${PATH_MARK}${steps.map((s) => `${s.index}${s.tag}`).join('-')}`
    : name;
  return anchorPattern.test(anchor) ? anchor : null;
}

/** The way down an anchor names from its marked name; null when it is not one joinAnchor makes. */
export function anchorSteps(anchor: string): Step[] | null {
  const at = anchor.indexOf(PATH_MARK);
  if (at < 0) return [];
  const steps: Step[] = [];
  for (const part of anchor.slice(at + PATH_MARK.length).split('-')) {
    const m = STEP.exec(part);
    if (!m) return null;
    steps.push({ index: Number(m[1]), tag: m[2] });
  }
  return inOrder(steps) ? steps : null;
}
