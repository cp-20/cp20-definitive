// Regression tests for the third-party notices: the notices file the build writes, the credits
// section that links to it, and the license records kept in the Zen Maru Gothic subsets.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import subsetFont from 'subset-font';
import { subsetOptions } from './fonts.mjs';
import { bareName, formatNotices, licensesPath, packageDirectory, packageLicense } from './licenses.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const built = (path) => join(root, 'dist/client', path);
const skip = !existsSync(built('404.html')) && 'run `npm run build` first';

// The `name` table of a WOFF2 font: nameID → string (Windows Unicode records first).
function nameRecords(woff2) {
  const view = new DataView(woff2.buffer, woff2.byteOffset, woff2.byteLength);
  assert.equal(view.getUint32(0), 0x774f4632, 'WOFF2 signature');
  const numTables = view.getUint16(12);
  const compressedSize = view.getUint32(20);
  let at = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = view.getUint8(at++);
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw Error('bad UIntBase128');
  };
  const known = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name'];
  let offset = 0,
    name;
  for (let i = 0; i < numTables; i++) {
    const flags = view.getUint8(at++);
    const index = flags & 0x3f;
    const tag =
      index === 63 ? String.fromCharCode(...woff2.subarray(at, (at += 4))) : (known[index] ?? index);
    let length = base128();
    const version = flags >> 6;
    const transformed = index === 10 || index === 11 ? version === 0 : version !== 0;
    if (transformed) length = base128();
    if (tag === 'name') name = { offset, length };
    offset += length;
  }
  assert.ok(name, 'name table');
  const data = brotliDecompressSync(woff2.subarray(at, at + compressedSize));
  const table = new DataView(data.buffer, data.byteOffset + name.offset, name.length);
  const count = table.getUint16(2),
    strings = table.getUint16(4);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    const [platform, , , id, length, start] = [0, 2, 4, 6, 8, 10].map((o) => table.getUint16(r + o));
    const bytes = data.subarray(name.offset + strings + start, name.offset + strings + start + length);
    const text =
      platform === 3 || platform === 0
        ? String.fromCharCode(
            ...Array.from({ length: length / 2 }, (_, k) => (bytes[2 * k] << 8) | bytes[2 * k + 1]),
          )
        : bytes.toString('latin1');
    if (!out.has(id) || platform === 3) out.set(id, text);
  }
  return out;
}

const fontLicense = (names) => {
  assert.match(names.get(13) ?? '', /SIL Open Font License, Version 1\.1/);
  assert.match(names.get(14) ?? '', /scripts\.sil\.org\/OFL|openfontlicense\.org/);
  assert.match(names.get(0) ?? '', /Copyright/);
};

test('font subsets keep the copyright, designer and OFL records of the name table', async () => {
  const source = readFileSync(join(root, 'fonts/zen-maru-gothic/zen-maru-gothic-500.woff2'));
  const original = nameRecords(source);
  const names = nameRecords(await subsetFont(source, 'あa', subsetOptions));
  fontLicense(names);
  for (const id of [8, 9, 11, 12, 13, 14])
    if (original.has(id)) assert.equal(names.get(id), original.get(id), `name ID ${id}`);
});

test('built Zen Maru Gothic subsets carry the OFL in their name table', { skip }, () => {
  const fonts = readdirSync(built('assets')).filter((f) => /^zen-maru-gothic-\d+-.*\.woff2$/.test(f));
  assert.equal(fonts.length, 2);
  for (const font of fonts) fontLicense(nameRecords(readFileSync(built(`assets/${font}`))));
});

test('module ids and bare imports map to their package', () => {
  assert.equal(
    packageDirectory('/x/node_modules/@firebase/app/dist/esm/index.esm.js'),
    '/x/node_modules/@firebase/app',
  );
  assert.equal(
    packageDirectory('/x/node_modules/a/node_modules/b/index.js?v=1'),
    '/x/node_modules/a/node_modules/b',
  );
  assert.equal(
    packageDirectory('node_modules/@fontsource/ibm-plex-mono/files/x.woff2'),
    'node_modules/@fontsource/ibm-plex-mono',
  );
  assert.equal(packageDirectory('/x/src/App.tsx'), undefined);
  assert.equal(bareName('@solidjs/web/storage'), '@solidjs/web');
  assert.equal(bareName('lucide'), 'lucide');
  assert.equal(bareName('./assets/a.js'), undefined);
  assert.equal(bareName('node:fs'), undefined);
});

test('packages without a LICENSE file get the license text and their own copyright lines', () => {
  const firebase = packageLicense(join(root, 'node_modules/@firebase/app'));
  assert.match(firebase.text, /Apache License\s+Version 2\.0/);
  assert.ok(firebase.copyright.some((line) => /Google LLC/.test(line)));
  const solid = packageLicense(join(root, 'node_modules/solid-js'));
  assert.match(solid.text, /Permission is hereby granted/);
  assert.ok(solid.copyright.some((line) => /Ryan Carniato/.test(line)));
  const lucide = packageLicense(join(root, 'node_modules/lucide'));
  assert.match(lucide.text, /Cole Bemis/, 'the Feather-derived MIT part of the Lucide license');
});

test('identical license texts are printed once, with every package and copyright line', () => {
  const text = formatNotices([
    { name: 'b', version: '1.0.0', license: 'MIT', copyright: ['Copyright B'], text: 'MIT TEXT' },
    { name: 'a', version: '2.0.0', license: 'MIT', copyright: ['Copyright A'], text: 'MIT TEXT' },
    { name: 'c', license: 'ISC', copyright: [], text: 'ISC TEXT' },
  ]);
  assert.equal(text.split('MIT TEXT').length, 2);
  assert.ok(text.indexOf('a@2.0.0 (MIT)') < text.indexOf('b@1.0.0 (MIT)'));
  assert.match(text, /a@2\.0\.0 \(MIT\)\n {2}Copyright A\nb@1\.0\.0 \(MIT\)\n {2}Copyright B/);
  assert.match(text, /ISC TEXT\n$/);
});

test('the built notices cover the bundled libraries, fonts and stickers', { skip }, () => {
  const text = readFileSync(built(licensesPath), 'utf8');
  for (const needle of [
    /^@firebase\/app@\S+ \(Apache-2\.0\)/m,
    /^firebase@\S+ \(Apache-2\.0\)/m,
    /^solid-js@\S+ \(MIT\)/m,
    /^@solidjs\/web@\S+ \(MIT\)/m,
    /^lucide@\S+ \(ISC\)/m,
    /Copyright \(c\) 2013-present Cole Bemis/,
    /^@fontsource\/ibm-plex-mono@\S+ \(OFL-1\.1\)/m,
    /^Zen Maru Gothic .*\(OFL-1\.1\)/m,
    /^Twemoji graphics .*\(CC-BY-4\.0\).*\n-+\nCopyright 2019 Twitter, Inc and other contributors/m,
    /Apache License\s+Version 2\.0/,
    /SIL OPEN FONT LICENSE Version 1\.1/,
  ])
    assert.match(text, needle);
  assert.ok(existsSync(built('stamps/LICENSE-GRAPHICS.txt')));
  assert.match(readFileSync(built('about/index.html'), 'utf8'), /href="\/third-party-licenses\.txt"/);
});

describe('the built credits on /about', { skip }, () => {
  const html = readFileSync(built('about/index.html'), 'utf8');
  const credits = html.slice(
    html.indexOf('id="credits"'),
    html.indexOf('</section>', html.indexOf('id="credits"')),
  );
  for (const [what, needle] of [
    ['the third-party notices', 'href="/third-party-licenses.txt"'],
    ['the Twemoji graphics license', 'href="/stamps/LICENSE-GRAPHICS.txt"'],
    ["Twemoji's copyright holder", '© Twitter, Inc and other contributors'],
    ["Lucide's Feather-derived MIT part", 'Feather 由来で MIT'],
    ["Firebase's license", 'Firebase（Apache-2.0）'],
  ])
    test(`credit ${what}`, () => {
      assert.ok(credits.includes(needle));
    });
});

test('the Twemoji graphics license names its copyright holder', () => {
  assert.match(
    read('public/stamps/LICENSE-GRAPHICS.txt'),
    /Copyright 2019 Twitter, Inc and other contributors/,
  );
});

test('the Twemoji graphics license lists every sticker picture', () => {
  const graphics = read('public/stamps/LICENSE-GRAPHICS.txt');
  const pictures = readdirSync(join(root, 'public/stamps')).filter((f) => f.endsWith('.svg'));
  assert.deepEqual(
    pictures.filter((file) => !graphics.includes(file)),
    [],
  );
});
