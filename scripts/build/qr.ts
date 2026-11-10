// The QR code of https://cp20.dev shown in the footer's dialog (and at /#qr), drawn once into
// public/images/qr-cp20.svg so the site does not carry a QR encoder: `node scripts/build/qr.ts`
// writes it, `--check` only compares (qr.test.ts does the same, and reads it back with a decoder).
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { encode, QrCodeDataType } from 'uqr';
import { SITE_ORIGIN } from '../../src/site/pages.ts';

export const qrFile = new URL('../../public/images/qr-cp20.svg', import.meta.url);
/** The quiet zone a scanner needs around the code, in modules. */
const QUIET = 4;
/**
 * The side of the clearing in the middle that the site's clover sits in, in modules (odd, so it
 * is centred). Its modules are left out and read back by error correction: at level H a code
 * restores about 30% of itself, and the clearing is under 10% of it, a third of that.
 */
export const ART = 9;
// The clover (public/stamps/clover.svg, Twemoji, CC BY 4.0), drawn on a 36-unit square.
const CLOVER =
  'M32.551 18.852c-2.093-1.848-6.686-3.264-10.178-3.84 3.492-.577 8.085-1.993 10.178-3.839 2.014-1.776 2.963-2.948 2.141-4.722-.566-1.219-2.854-1.333-4.166-2.491C29.214 2.802 29.083.783 27.7.285c-2.01-.726-3.336.114-5.347 1.889-2.094 1.847-3.698 5.899-4.353 8.98-.653-3.082-2.258-7.134-4.351-8.981C11.634.397 10.308-.441 8.297.285c-1.383.5-1.512 2.518-2.823 3.675S1.872 5.234 1.308 6.454c-.823 1.774.129 2.943 2.14 4.718 2.094 1.847 6.688 3.263 10.181 3.84-3.493.577-8.087 1.993-10.181 3.84-2.013 1.775-2.963 2.945-2.139 4.721.565 1.219 2.854 1.334 4.166 2.49 1.311 1.158 1.444 3.178 2.827 3.676 2.009.727 3.336-.115 5.348-1.889 1.651-1.457 2.997-4.288 3.814-6.933-.262 4.535.528 10.591 3.852 14.262 1.344 1.483 2.407.551 2.822.187.416-.365 1.605-1.414.186-2.822-3.91-3.883-5.266-7.917-5.628-11.14.827 2.498 2.107 5.077 3.657 6.446 2.012 1.775 3.339 2.615 5.351 1.889 1.382-.5 1.512-2.52 2.822-3.676 1.312-1.158 3.602-1.273 4.166-2.494.822-1.774-.13-2.944-2.141-4.717z';

/** The code at level H, and the clearing for the clover (in the code's own module coordinates). */
export function qrLayout(text = SITE_ORIGIN) {
  const qr = encode(text, { ecc: 'H', border: 0 });
  const start = (qr.size - ART) / 2;
  const cleared = (x: number, y: number) => x >= start && x < start + ART && y >= start && y < start + ART;
  // The finder, timing and alignment patterns and the format information stay whole, so a
  // scanner still finds the code, its size and its mask before it reads anything.
  for (let y = start; y < start + ART; y++)
    for (let x = start; x < start + ART; x++)
      if (qr.types[y][x] !== QrCodeDataType.Data)
        throw Error(`The clover covers a function pattern at ${x},${y}`);
  return { ...qr, start, cleared };
}

/**
 * The code as an SVG: one path of ink-coloured modules (runs along each row merged into one
 * rectangle) on white, with its quiet zone, and the clover in a clearing in the middle.
 */
export function qrSvg(text = SITE_ORIGIN) {
  const { data, size, start, cleared } = qrLayout(text);
  let path = '';
  data.forEach((row, y) => {
    for (let x = 0; x < size; x++) {
      if (!row[x] || cleared(x, y)) continue;
      let end = x;
      while (row[end + 1] && !cleared(end + 1, y)) end++;
      path += `M${x + QUIET} ${y + QUIET}h${end - x + 1}v1h${x - end - 1}z`;
      x = end;
    }
  });
  const full = size + QUIET * 2;
  // The clover a module inside the clearing on every side.
  const clover = { at: start + QUIET + 1, scale: (ART - 2) / 36 };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}"><rect width="${full}" height="${full}" fill="#fff"/><path fill="#2d2a33" shape-rendering="crispEdges" d="${path}"/><path fill="#77b255" transform="translate(${clover.at} ${clover.at}) scale(${clover.scale.toFixed(4)})" d="${CLOVER}"/></svg>\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const svg = qrSvg();
  if (process.argv.includes('--check')) {
    if ((await readFile(qrFile, 'utf8').catch(() => '')) !== svg)
      throw Error('public/images/qr-cp20.svg is out of date: run node scripts/build/qr.ts');
  } else {
    await writeFile(qrFile, svg);
    console.log(`Wrote ${qrFile.pathname}`);
  }
}
