// The QR code of the site shown in the footer's dialog (and at /#qr), drawn once into
// public/images/qr-cp20.svg so the site does not carry a QR encoder: `node scripts/build/qr.ts`
// writes it, `--check` only compares (qr.test.ts does the same, and reads it back with a decoder).
//
// The code draws the site's clover with its own modules: it holds https://cp20.dev/#<digits>,
// and the digits (which the site ignores) are chosen so that, once encoded, error corrected and
// masked, the modules in the middle come out as the clover on a white ground. Every bit of the
// code is a fixed linear function (over GF(2)) of the digits' bits, error correction included, so
// choosing them is solving a system of linear equations (the method of Russ Cox's QArt codes).
// Nothing is left for error correction to repair: the code reads as cleanly as any other.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { encode, QrCodeDataType } from 'uqr';
import { SITE_ORIGIN } from '../../src/site/pages.ts';

export const qrFile = new URL('../../public/images/qr-cp20.svg', import.meta.url);
/** The quiet zone a scanner needs around the code, in modules. */
const QUIET = 4;
/** Version 5 (37×37 modules) at level M: two blocks of 43 data and 24 error correction codewords. */
export const VERSION = 5;
const SIZE = 17 + 4 * VERSION;
const BLOCKS = 2,
  DATA_PER_BLOCK = 43,
  ECC_PER_BLOCK = 24;
const DATA_BITS = BLOCKS * DATA_PER_BLOCK * 8;
/** What the code says before the digits: the page, and the fragment the digits fill. */
export const PREFIX = `${SITE_ORIGIN}/#`;
/** The digits, three to a 10-bit group, as many groups as fit after the address. */
const GROUPS = Math.floor((DATA_BITS - (4 + 8 + 8 * PREFIX.length) - (4 + 10) - 4) / 10);
export const DIGITS = GROUPS * 3;

// The clover (public/stamps/clover.svg, Twemoji, CC BY 4.0) sampled on a 17×17 grid of modules.
const CLOVER = [
  '...###.....###...',
  '...####...####...',
  '.#######.#######.',
  '########.########',
  '.###############.',
  '..#############..',
  '....#########....',
  '.....#######.....',
  '..#############..',
  '.###############.',
  '#################',
  '.###############.',
  '...####.######...',
  '...###...#.###...',
  '.........##......',
  '.........###.....',
  '..........##.....',
];
// Where its top left module is: a module left of the middle, where all but two of its modules fall
// on bits the digits decide (in the middle, four would be fixed by the address and stay white).
const CLOVER_AT = { x: 9, y: 10 };
/** The white ground round the clover, in modules. */
const HALO = 1;

/** Whether (x, y) is in the clover, in the white round it, or neither. */
export function artAt(x: number, y: number): 'clover' | 'ground' | undefined {
  const at = (cx: number, cy: number) => CLOVER[cy - CLOVER_AT.y]?.[cx - CLOVER_AT.x] === '#';
  if (at(x, y)) return 'clover';
  for (let dy = -HALO; dy <= HALO; dy++)
    for (let dx = -HALO; dx <= HALO; dx++) if (at(x + dx, y + dy)) return 'ground';
  return undefined;
}

// ── Reed–Solomon over GF(256) (the QR code's field, x^8 + x^4 + x^3 + x^2 + 1) ──
const multiply = (a: number, b: number) => {
  let r = 0;
  for (let i = 7; i >= 0; i--) {
    r = (r << 1) ^ ((r >>> 7) * 0x11d);
    r ^= ((b >>> i) & 1) * a;
  }
  return r;
};
const divisor = (degree: number) => {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = multiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = multiply(root, 2);
  }
  return result;
};
const GENERATOR = divisor(ECC_PER_BLOCK);
const remainder = (data: number[]) => {
  const result = new Array<number>(ECC_PER_BLOCK).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    GENERATOR.forEach((g, i) => (result[i] ^= multiply(g, factor)));
  }
  return result;
};

/** The data codewords' bits, error corrected and interleaved into the order they are placed in. */
function codewordBits(dataBits: number[]) {
  const bytes = Array.from({ length: DATA_BITS / 8 }, (_, i) =>
    dataBits.slice(i * 8, i * 8 + 8).reduce((byte, bit) => (byte << 1) | bit, 0),
  );
  const blocks = Array.from({ length: BLOCKS }, (_, b) =>
    bytes.slice(b * DATA_PER_BLOCK, (b + 1) * DATA_PER_BLOCK),
  );
  const ecc = blocks.map(remainder);
  const order: number[] = [];
  for (let i = 0; i < DATA_PER_BLOCK; i++) for (const block of blocks) order.push(block[i]);
  for (let i = 0; i < ECC_PER_BLOCK; i++) for (const e of ecc) order.push(e[i]);
  return order.flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1));
}

const bits = (value: number, length: number) =>
  Array.from({ length }, (_, i) => (value >>> (length - 1 - i)) & 1);
/** The data bits: the address in byte mode, the digits in numeric mode, then the terminator and padding. */
export function dataBits(digits: string, prefix = PREFIX) {
  const out = [...bits(0b0100, 4), ...bits(prefix.length, 8)];
  for (const c of Buffer.from(prefix, 'utf8')) out.push(...bits(c, 8));
  if (digits) {
    out.push(...bits(0b0001, 4), ...bits(digits.length, 10));
    for (let i = 0; i < digits.length; i += 3) {
      const group = digits.slice(i, i + 3);
      out.push(...bits(Number(group), [0, 4, 7, 10][group.length]));
    }
  }
  out.push(...bits(0, Math.min(4, DATA_BITS - out.length)));
  out.push(...bits(0, (8 - (out.length % 8)) % 8));
  for (let pad = 0xec; out.length < DATA_BITS; pad ^= 0xec ^ 0x11) out.push(...bits(pad, 8));
  return out;
}

const MASKS = [
  (x: number, y: number) => (x + y) % 2 === 0,
  (_: number, y: number) => y % 2 === 0,
  (x: number) => x % 3 === 0,
  (x: number, y: number) => (x + y) % 3 === 0,
  (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/**
 * Where the codewords go with `mask`: the finder, timing and alignment patterns and the format
 * information drawn by uqr, and the data modules in the order the codeword bits fill them (two
 * columns at a time, up and down from the bottom right).
 */
const layouts = new Map<number, { base: boolean[][]; order: [number, number][] }>();
function layout(mask: number) {
  if (!layouts.has(mask)) {
    const qr = encode('', {
      ecc: 'M',
      minVersion: VERSION,
      maxVersion: VERSION,
      maskPattern: mask,
      border: 0,
    });
    const order: [number, number][] = [];
    for (let right = SIZE - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < SIZE; vert++)
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const y = ((right + 1) & 2) === 0 ? SIZE - 1 - vert : vert;
          if (qr.types[y][x] === QrCodeDataType.Data) order.push([x, y]);
        }
    }
    layouts.set(mask, { base: qr.data, order });
  }
  return layouts.get(mask)!;
}

/** The code's modules for the data bits with `mask` (the remainder bits after the last codeword are 0). */
export function modules(dataBits: number[], mask: number) {
  const { base, order } = layout(mask);
  const grid = base.map((row) => [...row]);
  const stream = codewordBits(dataBits);
  order.forEach(([x, y], i) => (grid[y][x] = !!(stream[i] ?? 0) !== MASKS[mask](x, y)));
  return grid;
}

// The digits' bits, ten to a group of three digits. Each one's effect on the placed codeword
// bits is the same whatever the mask: the positions it flips.
const FIRST_GROUP = 4 + 8 + 8 * PREFIX.length + 4 + 10;
const DIGIT_BITS = Array.from({ length: GROUPS * 10 }, (_, i) => FIRST_GROUP + i);
const ZERO = '0'.repeat(DIGITS);
const withBits = (set: Iterable<number>) => {
  const out = dataBits(ZERO);
  for (const i of set) out[i] = 1;
  return out;
};
let effects: Map<number, Set<number>> | undefined;
const effectOf = (bit: number) => {
  if (!effects) {
    const zero = codewordBits(dataBits(ZERO));
    effects = new Map(
      DIGIT_BITS.map((b) => {
        const flipped = codewordBits(withBits([b]));
        return [b, new Set(flipped.flatMap((v, i) => (v !== zero[i] ? [i] : [])))];
      }),
    );
  }
  return effects.get(bit)!;
};

/**
 * Digits that draw as much of the art as they can with `mask`, given which bits are free: Gaussian
 * elimination over GF(2), one wanted module at a time, the clover's first, then its ground. A row
 * is a module's dependence on the free bits (a bigint bit set) and the change it needs from the
 * code with every free bit 0. Free bits that end up no row's pivot are 0.
 */
function solve(mask: number, free: number[]) {
  const { order } = layout(mask);
  const at = modules(dataBits(ZERO), mask);
  const slot = new Map(order.map(([x, y], i) => [`${x},${y}`, i]));
  const wanted: { slot: number; dark: boolean; change: boolean }[] = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const art = artAt(x, y);
      const i = slot.get(`${x},${y}`);
      if (!art || i === undefined) continue;
      wanted.push({ slot: i, dark: art === 'clover', change: at[y][x] !== (art === 'clover') });
    }
  wanted.sort((a, b) => Number(b.dark) - Number(a.dark));
  const pivots: { row: bigint; value: boolean; pivot: bigint }[] = [];
  let met = 0,
    metClover = 0;
  for (const w of wanted) {
    let row = 0n;
    free.forEach((bit, f) => effectOf(bit).has(w.slot) && (row |= 1n << BigInt(f)));
    let value = w.change;
    for (const p of pivots)
      if (row & p.pivot) {
        row ^= p.row;
        value = value !== p.value;
      }
    if (row !== 0n) {
      const pivot = row & -row;
      for (const p of pivots)
        if (p.row & pivot) {
          p.row ^= row;
          p.value = p.value !== value;
        }
      pivots.push({ row, value, pivot });
      value = false;
    }
    if (!value) {
      met++;
      metClover += Number(w.dark);
    }
  }
  const data = withBits(pivots.filter((p) => p.value).map((p) => free[p.pivot.toString(2).length - 1]));
  const groups = Array.from({ length: GROUPS }, (_, g) =>
    data.slice(FIRST_GROUP + g * 10, FIRST_GROUP + g * 10 + 10).reduce((n, b) => n * 2 + b, 0),
  );
  return { groups, met, metClover, wanted: wanted.length };
}

/**
 * The digits whose code draws the clover with `mask`, and how many of the clover's and its
 * ground's modules came out right. Every bit of every group is free at first; a group that comes
 * out at 1000 or more (not three digits) has its top bit held at 0, which keeps it under 512, and
 * the system is solved again.
 */
export function artDigits(mask: number) {
  const capped = new Set<number>();
  for (;;) {
    const free = DIGIT_BITS.filter((bit) => !capped.has(bit));
    const { groups, ...result } = solve(mask, free);
    const over = groups.flatMap((n, g) => (n >= 1000 ? [FIRST_GROUP + g * 10] : []));
    if (!over.length) return { digits: groups.map((n) => String(n).padStart(3, '0')).join(''), ...result };
    for (const bit of over) capped.add(bit);
  }
}

/**
 * The code with the clover: the mask that draws the most of the clover, then of its ground (the
 * lowest number of a tie).
 */
export function qrArt() {
  let best: ReturnType<typeof artDigits> & { mask: number } = {
    digits: '',
    met: -1,
    metClover: -1,
    wanted: 0,
    mask: 0,
  };
  for (let mask = 0; mask < 8; mask++) {
    const art = artDigits(mask);
    if (art.metClover * 1000 + art.met > best.metClover * 1000 + best.met) best = { ...art, mask };
  }
  return { ...best, text: PREFIX + best.digits, modules: modules(dataBits(best.digits), best.mask) };
}

/**
 * The code as an SVG: the modules in runs along each row, ink-coloured and the clover's in green,
 * on white with its quiet zone.
 */
export function qrSvg() {
  const art = qrArt();
  const paths = { ink: '', clover: '' };
  art.modules.forEach((row, y) => {
    for (let x = 0; x < SIZE; x++) {
      if (!row[x]) continue;
      const kind = artAt(x, y) === 'clover' ? 'clover' : 'ink';
      let end = x;
      while (row[end + 1] && (artAt(end + 1, y) === 'clover' ? 'clover' : 'ink') === kind) end++;
      paths[kind] += `M${x + QUIET} ${y + QUIET}h${end - x + 1}v1h${x - end - 1}z`;
      x = end;
    }
  });
  const full = SIZE + QUIET * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}"><rect width="${full}" height="${full}" fill="#fff"/><path fill="#2d2a33" shape-rendering="crispEdges" d="${paths.ink}"/><path fill="#3f8a3a" shape-rendering="crispEdges" d="${paths.clover}"/></svg>\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const svg = qrSvg();
  if (process.argv.includes('--check')) {
    if ((await readFile(qrFile, 'utf8').catch(() => '')) !== svg)
      throw Error('public/images/qr-cp20.svg is out of date: run node scripts/build/qr.ts');
  } else {
    await writeFile(qrFile, svg);
    const { met, wanted, mask, text } = qrArt();
    console.log(`Wrote ${qrFile.pathname}: mask ${mask}, ${met}/${wanted} modules of the clover, ${text}`);
  }
}
