// The picture of a shared link (og:image, src/Document.tsx): the avatar, the name, the school and
// the three results of the home page's note, on a sheet of the site's paper on its clover desk.
// Drawn at build time from the same data the pages show, so it never says anything they do not.
// The text is set in the site's Zen Maru Gothic by HarfBuzz and drawn as outlines, so the picture
// does not depend on the fonts of the machine that builds it.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';
import subsetFont from 'subset-font';
import { Blob, Buffer as GlyphBuffer, Face, Font, shape } from 'harfbuzzjs';
import { highlightIds, milestones } from '../../src/data/editorial.ts';
import profile from '../../src/data/profile.json' with { type: 'json' };
import { OG_IMAGE } from '../../src/site/pages.ts';

const INK = '#2d2a33';

type Run = { text: string; size: number; weight: 500 | 700 };

/** Outlines of the lines of text, each with its width, in one face per weight. */
async function typesetter(runs: Run[]) {
  const fonts = new Map<number, { font: Font; upem: number }>();
  for (const weight of [500, 700] as const) {
    const text = runs
      .filter((r) => r.weight === weight)
      .map((r) => r.text)
      .join('');
    if (!text) continue;
    const woff2 = await readFile(
      new URL(`../../fonts/zen-maru-gothic/zen-maru-gothic-${weight}.woff2`, import.meta.url),
    );
    const ttf = await subsetFont(woff2, text, { targetFormat: 'truetype' });
    const face = new Face(new Blob(ttf));
    fonts.set(weight, { font: new Font(face), upem: face.upem });
  }
  /** The text's outline with its baseline's left end at (x, y), and its advance width. */
  return (run: Run, x: number, y: number, fill = INK) => {
    const { font, upem } = fonts.get(run.weight)!;
    const buffer = new GlyphBuffer();
    buffer.addText(run.text);
    buffer.guessSegmentProperties();
    shape(font, buffer);
    const scale = run.size / upem;
    let pen = 0,
      paths = '';
    for (const g of buffer.getGlyphInfosAndPositions()) {
      const d = font.glyphToPath(g.codepoint);
      if (d)
        paths += `<path transform="translate(${(x + (pen + (g.xOffset ?? 0)) * scale).toFixed(2)} ${y}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})" d="${d}"/>`;
      pen += g.xAdvance ?? 0;
    }
    return { svg: `<g fill="${fill}">${paths}</g>`, width: pen * scale };
  };
}

/** The picture as a PNG. */
export async function ogImage() {
  const name: Run = { text: 'しーぴー', size: 104, weight: 700 };
  const seal: Run = { text: 'cp20', size: 34, weight: 700 };
  const school: Run = { text: profile.affiliations[0].name, size: 36, weight: 500 };
  const site: Run = { text: 'cp20.dev', size: 28, weight: 700 };
  const results = highlightIds.map((id) => {
    const m = milestones.find((m) => m.id === id)!;
    return { run: { text: m.title, size: 38, weight: 700 } as Run, kind: m.kind };
  });
  const award: Run = { text: '賞', size: 22, weight: 700 };
  const set = await typesetter([name, seal, school, site, award, ...results.map((r) => r.run)]);

  const { width, height } = OG_IMAGE;
  // The sheet, ruled like the site's paper, with its hard shadow on the desk.
  const sheet = { x: 56, y: 44, w: width - 112, h: height - 92 };
  const grid = Array.from({ length: Math.ceil(sheet.w / 28) }, (_, i) => sheet.x + 28 * (i + 1))
    .map((gx) => `<path d="M${gx} ${sheet.y}V${sheet.y + sheet.h}"/>`)
    .concat(
      Array.from({ length: Math.ceil(sheet.h / 28) }, (_, i) => sheet.y + 28 * (i + 1)).map(
        (gy) => `<path d="M${sheet.x} ${gy}H${sheet.x + sheet.w}"/>`,
      ),
    )
    .join('');
  const avatar = { cx: 236, cy: 214, r: 118 };
  const siteWidth = set(site, 0, 0).width;
  const nameText = set(name, 400, 222);
  const sealX = 400 + nameText.width + 26;
  const sealText = set(seal, sealX + 16, 207, '#d1402c');
  // The note of results, tilted a little like the one on the home page.
  const note = { x: 400, y: 318, w: 700, h: 226 };
  const lines = results
    .map((r, i) => {
      const y = note.y + 72 + i * 64;
      const mark =
        r.kind === 'award'
          ? `<g transform="rotate(-12 ${note.x + 44} ${y - 13})"><circle cx="${note.x + 44}" cy="${y - 13}" r="19" fill="none" stroke="#d1402c" stroke-width="3"/>${set(award, note.x + 33, y - 5, '#d1402c').svg}</g>`
          : `<path transform="rotate(-14 ${note.x + 44} ${y - 13})" d="M${note.x + 24} ${y - 22}h40l-3 9 3 9h-40l3-9z" fill="#7cc0ff" fill-opacity="0.8"/>`;
      return mark + set(r.run, note.x + 84, y).svg;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#cfe7c4"/>
<rect x="${sheet.x + 8}" y="${sheet.y + 8}" width="${sheet.w}" height="${sheet.h}" rx="30" fill="${INK}"/>
<rect x="${sheet.x}" y="${sheet.y}" width="${sheet.w}" height="${sheet.h}" rx="30" fill="#fffcf3" stroke="${INK}" stroke-width="3"/>
<clipPath id="sheet"><rect x="${sheet.x}" y="${sheet.y}" width="${sheet.w}" height="${sheet.h}" rx="30"/></clipPath>
<g clip-path="url(#sheet)" stroke="rgb(86 150 100 / 0.12)" stroke-width="1.5">${grid}</g>
<circle cx="${avatar.cx}" cy="${avatar.cy}" r="${avatar.r + 14}" fill="#fff"/>
<circle cx="${avatar.cx}" cy="${avatar.cy}" r="${avatar.r}" fill="none" stroke="#56c271" stroke-width="5"/>
${nameText.svg}
<g transform="rotate(-10 ${sealX + 50} 194)"><rect x="${sealX}" y="164" width="${sealText.width + 32}" height="58" rx="12" fill="none" stroke="#d1402c" stroke-width="4"/>${sealText.svg}</g>
${set(school, 404, 282).svg}
<g transform="rotate(1.2 ${note.x + note.w / 2} ${note.y + note.h / 2})">
<rect x="${note.x + 3}" y="${note.y + 6}" width="${note.w}" height="${note.h}" fill="rgb(45 42 51 / 0.18)"/>
<rect x="${note.x}" y="${note.y}" width="${note.w}" height="${note.h}" fill="#fff0b8"/>
<rect x="${note.x}" y="${note.y}" width="${note.w}" height="14" fill="#ffd54f" fill-opacity="0.75"/>
${lines}
</g>
${set(site, avatar.cx - siteWidth / 2, 424).svg}
</svg>`;
  // The avatar, round, inside its green ring.
  const size = (avatar.r - 6) * 2;
  const face = await sharp(new URL('../../public/images/avatar-384.webp', import.meta.url).pathname)
    .resize(size, size)
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`,
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
  return sharp(Buffer.from(svg))
    .composite([{ input: face, left: avatar.cx - size / 2, top: avatar.cy - size / 2 }])
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}

/** Writes the picture to `file` (prerender.ts puts it in dist/client). */
export async function writeOgImage(file: string) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, await ogImage());
}
