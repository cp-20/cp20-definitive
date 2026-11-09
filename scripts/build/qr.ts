// The QR code of https://cp20.dev shown in the footer's dialog (and at /#qr), drawn once into
// public/images/qr-cp20.svg so the site does not carry a QR encoder: `node scripts/build/qr.ts`
// writes it, `--check` only compares (qr.test.ts does the same).
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { encode } from 'uqr';
import { SITE_ORIGIN } from '../../src/site/pages.ts';

export const qrFile = new URL('../../public/images/qr-cp20.svg', import.meta.url);
/** The quiet zone a scanner needs around the code, in modules. */
const QUIET = 4;

/**
 * The code as an SVG: one path of ink-coloured modules (runs along each row merged into one
 * rectangle) on white, with its quiet zone. The error correction is raised as far as the
 * smallest version that fits allows, so a crease or glare on a phone screen still scans.
 */
export function qrSvg(text = SITE_ORIGIN) {
  const { data, size } = encode(text, { ecc: 'M', boostEcc: true, border: 0 });
  let path = '';
  data.forEach((row, y) => {
    for (let x = 0; x < size; x++) {
      if (!row[x]) continue;
      let end = x;
      while (row[end + 1]) end++;
      path += `M${x + QUIET} ${y + QUIET}h${end - x + 1}v1h${x - end - 1}z`;
      x = end;
    }
  });
  const full = size + QUIET * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges"><rect width="${full}" height="${full}" fill="#fff"/><path fill="#2d2a33" d="${path}"/></svg>\n`;
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
