import { BREAK } from '../content/phrase-marks.ts';

// Brackets that open a phrase, and those that close one.
const OPENING = '「『【（〔［',
  CLOSING = '」』】）〕］';
const spaced = new RegExp(`\\s+(?=[${OPENING}])|(?<=[${CLOSING}])\\s+`, 'g');
// A short aside in brackets (【#vuefes 参加記】), which is read as one.
const aside = new RegExp(`[${OPENING}][^${OPENING}${CLOSING}]{1,14}[${CLOSING}]`, 'g');

/**
 * A title as the pages set it (the data and the feed keep it as written): a space beside a
 * full-width bracket goes, as the bracket has half a space of its own (「件 【」 would be a hole),
 * leaving a phrase break in its place, and a short aside in brackets breaks before or after it,
 * not at a space in it. With `hang`, the opening bracket a title starts with.
 */
export function setTitle(title: string) {
  const text = title.replace(spaced, BREAK).replace(aside, (a) => a.replaceAll(' ', '\u00a0'));
  return OPENING.includes(text[0]) ? { hang: text[0], rest: text.slice(1) } : { rest: text };
}

/**
 * A title whose opening bracket hangs into the margin by its blank half (app.css .hang), so its
 * first ink lines up with the titles under it.
 */
export default function Title(props: { text: string }) {
  const { hang, rest } = setTitle(props.text);
  return (
    <>
      {hang && <span class="hang">{hang}</span>}
      {rest}
    </>
  );
}
