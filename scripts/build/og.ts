// The picture of a shared link (og:image, src/Document.tsx): the avatar, the name, the school and
// the three results of the home page's note, on a sheet of the site's paper on its clover desk.
// Drawn at build time from the same data the pages show, so it never says anything they do not.
// Also the pictures on the cards of works whose own OG image is only their name (WORK_ART).
// The text is set in the site's Zen Maru Gothic (and IBM Plex Mono for code) by HarfBuzz and
// drawn as outlines, so the pictures do not depend on the fonts of the machine that builds them.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';
import subsetFont from 'subset-font';
import { Blob, Buffer as GlyphBuffer, Face, Font, shape } from 'harfbuzzjs';
import { highlightIds, milestones } from '../../src/data/editorial.ts';
import profile from '../../src/data/profile.json' with { type: 'json' };
import works from '../../src/data/works.json' with { type: 'json' };
import { OG_IMAGE, WORK_ART, WORK_ART_WIDTHS, workArtFile } from '../../src/site/pages.ts';

const INK = '#2d2a33';
const MUTED = '#6c6873';
const SEAL = '#d1402c';

/** A line of text in Zen Maru Gothic at a weight, or (`mono`) in IBM Plex Mono 400. */
type Run = { text: string; size: number; weight: 500 | 700; mono?: true };
const FACES = {
  500: '../../fonts/zen-maru-gothic/zen-maru-gothic-500.woff2',
  700: '../../fonts/zen-maru-gothic/zen-maru-gothic-700.woff2',
  mono: '../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
};
const faceOf = (run: Run) => (run.mono ? 'mono' : run.weight);

/** Outlines of the lines of text, each with its width, in one face per font. */
async function typesetter(runs: Run[]) {
  const fonts = new Map<keyof typeof FACES, { font: Font; upem: number }>();
  for (const key of [500, 700, 'mono'] as const) {
    const text = runs
      .filter((r) => faceOf(r) === key)
      .map((r) => r.text)
      .join('');
    if (!text) continue;
    const woff2 = await readFile(new URL(FACES[key], import.meta.url));
    const ttf = await subsetFont(woff2, text, { targetFormat: 'truetype' });
    const face = new Face(new Blob(ttf));
    fonts.set(key, { font: new Font(face), upem: face.upem });
  }
  /** The text's outline with its baseline's left end at (x, y), and its advance width. */
  return (run: Run, x: number, y: number, fill = INK) => {
    const { font, upem } = fonts.get(faceOf(run))!;
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

/** The site's ruled paper, edge to edge, with the loose leaf's margin line. */
const paper = (width: number, height: number) => {
  const lines = [
    ...Array.from({ length: Math.floor(width / 30) }, (_, i) => `M${30 * (i + 1)} 0V${height}`),
    ...Array.from({ length: Math.floor(height / 30) }, (_, i) => `M0 ${30 * (i + 1)}H${width}`),
  ];
  return `<rect width="${width}" height="${height}" fill="#fffcf3"/>
<path d="${lines.join('')}" stroke="rgb(86 150 100 / 0.12)" stroke-width="1.5"/>
<path d="M90 0V${height}" stroke="rgb(255 120 150 / 0.35)" stroke-width="2.5"/>`;
};

/** A postage stamp: perforated white paper with a printed face, slanted and casting the site's shadow. */
const stamp = (x: number, y: number, w: number, h: number, tilt: number, face: string, content: string) => {
  const holes = [];
  for (let i = 0; i <= w / 14; i++) holes.push([x + i * 14, y], [x + i * 14, y + h]);
  for (let i = 1; i < h / 14; i++) holes.push([x, y + i * 14], [x + w, y + i * 14]);
  const id = `perf-${x}-${y}`;
  return `<mask id="${id}"><rect x="${x - 10}" y="${y - 10}" width="${w + 20}" height="${h + 20}" fill="#fff"/>${holes
    .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="4.2"/>`)
    .join('')}</mask>
<g transform="rotate(${tilt} ${x + w / 2} ${y + h / 2})" filter="url(#lift)">
<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" mask="url(#${id})"/>
<rect x="${x + 11}" y="${y + 11}" width="${w - 22}" height="${h - 22}" fill="${face}"/>
${content}
</g>`;
};

/**
 * The self-hosting compiler (works.json: its second and third generations compile themselves to
 * the same output) as three stamps: 1cc built by clang, 2cc by 1cc and 3cc by 2cc, the names of
 * the generations in its Makefile, with the seal of a match under the last two.
 */
async function compilerArt() {
  const work = works.find((w) => w.id === 'c-compiler')!;
  const title: Run = { text: work.title, size: 84, weight: 700 };
  const line: Run = { text: work.description, size: 30, weight: 500 };
  const clang: Run = { text: 'clang', size: 34, weight: 500, mono: true };
  const names = [1, 2, 3].map((n) => ({
    name: { text: `${n}cc`, size: 58, weight: 500, mono: true } as Run,
    caption: { text: `${n}世代目`, size: 19, weight: 700 } as Run,
  }));
  const match: Run = { text: '一致', size: 27, weight: 700 };
  const set = await typesetter([title, line, clang, match, ...names.flatMap((n) => [n.name, n.caption])]);
  const { width, height } = { width: 1200, height: 630 };
  const arrow = (x: number, y: number) =>
    `<path d="M${x} ${y}h50m-13-11l13 11l-13 11" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  const box = { w: 184, h: 132, y: 352 };
  const faces = ['#fff1bd', '#dcecff', '#d9f2dc'];
  const tilts = [-2, 1.6, -1.1];
  const clangWidth = set(clang, 0, 0).width;
  let x = 132 + clangWidth + 20;
  let chain = set(clang, 132, box.y + box.h / 2 + 12, MUTED).svg + arrow(x, box.y + box.h / 2);
  const centres: number[] = [];
  names.forEach((n, i) => {
    x += 50 + 20;
    const nameWidth = set(n.name, 0, 0).width;
    const inner =
      set(n.caption, x + 24, box.y + 44, MUTED).svg +
      set(n.name, x + (box.w - nameWidth) / 2, box.y + box.h - 30).svg;
    chain += stamp(x, box.y, box.w, box.h, tilts[i], faces[i], inner);
    centres.push(x + box.w / 2);
    x += box.w + 20;
    if (i < 2) chain += arrow(x, box.y + box.h / 2);
  });
  // The bracket under the last two generations, and the seal on it.
  const [, a, b] = centres;
  const under = box.y + box.h + 22;
  const seal = { x: (a + b) / 2, y: under + 30 };
  const matchWidth = set(match, 0, 0).width;
  const bracket = `<path d="M${a} ${under}v14H${seal.x - 46}M${seal.x + 46} ${under + 14}H${b}v-14" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<g transform="rotate(-8 ${seal.x} ${seal.y})" opacity="0.92"><circle cx="${seal.x}" cy="${seal.y}" r="38" fill="none" stroke="${SEAL}" stroke-width="4"/>${set(match, seal.x - matchWidth / 2, seal.y + 10, SEAL).svg}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<filter id="lift" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="5" dy="8" stdDeviation="4" flood-color="${INK}" flood-opacity="0.18"/></filter>
${paper(width, height)}
${set(title, 132, 178).svg}
${set(line, 134, 238, MUTED).svg}
${chain}
${bracket}
</svg>`;
}

/** A die's face: a rounded square at (x, y), `size` wide, slanted, with `n` pips. */
const die = (x: number, y: number, size: number, n: number, tilt: number) => {
  const at = [0.25, 0.5, 0.75].map((f) => f * size);
  const pips: Record<number, [number, number][]> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [2, 0], [0, 2], [2, 2]],
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
    6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
  };
  return `<g transform="rotate(${tilt} ${x + size / 2} ${y + size / 2})">
<rect x="${x + 6}" y="${y + 8}" width="${size}" height="${size}" rx="${size * 0.2}" fill="#0c0f17" fill-opacity="0.55"/>
<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.2}" fill="#fffcf3"/>
${pips[n].map(([c, r]) => `<circle cx="${x + at[c]}" cy="${y + at[r]}" r="${size * 0.085}" fill="${n === 1 ? SEAL : INK}"/>`).join('')}
</g>`;
};

/**
 * Dice Spec (works.json: the odds of a roll of TRPG dice) as what it answers: three dice rolled,
 * and the chance of each sum of 3D6 as bars, the 95% range in its slate and the dice's sum in
 * yellow, on the dark slate of its own pages.
 */
async function diceArt() {
  const work = works.find((w) => w.id === 'dice-spec-v2')!;
  const title: Run = { text: work.title, size: 76, weight: 700 };
  const line: Run = { text: work.description, size: 28, weight: 500 };
  const label: Run = { text: '3D6', size: 30, weight: 500, mono: true };
  const sums = Array.from({ length: 16 }, (_, i) => i + 3);
  const figures = sums.map((n) => ({ text: String(n), size: 22, weight: 500, mono: true }) as Run);
  const set = await typesetter([title, line, label, ...figures]);
  const { width, height } = { width: 1200, height: 630 };
  // How many of the 216 rolls of three dice make each sum.
  const ways = sums.map((n) => {
    let count = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) count += +(a + b + c === n);
    return count;
  });
  const rolled = [5, 2, 4];
  const sum = rolled.reduce((a, b) => a + b);
  const chart = { x: 96, w: 1008, base: 548, top: 330 };
  const slot = chart.w / sums.length;
  const bars = sums
    .map((n, i) => {
      const h = ((chart.base - chart.top) * ways[i]) / Math.max(...ways);
      const fill = n === sum ? '#ffd54f' : n >= 5 && n <= 16 ? '#8193b8' : '#3d475d';
      const x = chart.x + i * slot + 8;
      const figure = set(figures[i], 0, 0).width;
      return `<rect x="${x.toFixed(1)}" y="${(chart.base - h).toFixed(1)}" width="${(slot - 16).toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${fill}"/>
${set(figures[i], chart.x + i * slot + (slot - figure) / 2, chart.base + 38, n === sum ? '#ffd54f' : '#8a94a8').svg}`;
    })
    .join('');
  const dice = rolled.map((n, i) => die(846 + i * 98, 64 + [10, -8, 6][i], 84, n, [-9, 7, -4][i])).join('');
  const dots = [];
  for (let x = 30; x < width; x += 30) for (let y = 30; y < height; y += 30) dots.push(`M${x} ${y}h.01`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#1d2433"/>
<path d="${dots.join('')}" stroke="#ffffff" stroke-opacity="0.07" stroke-width="3" stroke-linecap="round"/>
${set(title, 96, 168, '#fffcf3').svg}
${set(line, 98, 228, '#a3adc2').svg}
${set(label, 96, chart.top - 10, '#a3adc2').svg}
<path d="M${chart.x} ${chart.base + 0.5}H${chart.x + chart.w}" stroke="#56607a" stroke-width="2"/>
${bars}
${dice}
</svg>`;
}

const workArts: Record<string, () => Promise<string>> = { 'c-compiler': compilerArt, 'dice-spec-v2': diceArt };

/** Writes the works' card pictures (WORK_ART) into `dir` (dist/client), a WebP for each width. */
export async function writeWorkArt(dir: string) {
  for (const id of Object.keys(WORK_ART)) {
    const svg = Buffer.from(await workArts[id]());
    for (const width of WORK_ART_WIDTHS) {
      const file = `${dir}${workArtFile(id, width)}`;
      await mkdir(dirname(file), { recursive: true });
      await sharp(svg).resize(width).webp({ quality: 88 }).toFile(file);
    }
  }
}
