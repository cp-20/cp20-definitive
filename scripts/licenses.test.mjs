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

describe('Zen Maru Gothic の絞り込み', async () => {
  const source = readFileSync(join(root, 'fonts/zen-maru-gothic/zen-maru-gothic-500.woff2'));
  const original = nameRecords(source);
  const names = nameRecords(await subsetFont(source, 'あa', subsetOptions));

  test('絞り込んだフォントにも著作権と OFL の記載が残る', () => {
    fontLicense(names);
  });

  test('デザイナーやライセンスの name レコードは元のまま残る', () => {
    const kept = [8, 9, 11, 12, 13, 14].filter((id) => original.has(id));
    assert.deepEqual(
      kept.map((id) => names.get(id)),
      kept.map((id) => original.get(id)),
    );
  });
});

describe('ビルドした Zen Maru Gothic', { skip }, () => {
  const fonts = skip
    ? []
    : readdirSync(built('assets')).filter((f) => /^zen-maru-gothic-\d+-.*\.woff2$/.test(f));

  test('太さ2つぶんのファイルがある', () => {
    assert.equal(fonts.length, 2);
  });

  for (const font of fonts)
    test(`${font} の name テーブルに OFL が書かれている`, () => {
      fontLicense(nameRecords(readFileSync(built(`assets/${font}`))));
    });
});

describe('packageDirectory', () => {
  for (const [id, directory] of [
    ['/x/node_modules/@firebase/app/dist/esm/index.esm.js', '/x/node_modules/@firebase/app'],
    ['/x/node_modules/a/node_modules/b/index.js?v=1', '/x/node_modules/a/node_modules/b'],
    ['node_modules/@fontsource/ibm-plex-mono/files/x.woff2', 'node_modules/@fontsource/ibm-plex-mono'],
    ['/x/src/App.tsx', undefined],
  ])
    test(`${id} は ${directory ?? 'どのパッケージにも属さない'}`, () => {
      assert.equal(packageDirectory(id), directory);
    });
});

describe('bareName', () => {
  for (const [specifier, name] of [
    ['@solidjs/web/storage', '@solidjs/web'],
    ['lucide', 'lucide'],
    ['./assets/a.js', undefined],
    ['node:fs', undefined],
  ])
    test(`${specifier} は ${name ?? 'パッケージではない'}`, () => {
      assert.equal(bareName(specifier), name);
    });
});

describe('packageLicense', () => {
  test('LICENSE ファイルのない Firebase には Apache-2.0 の本文と Google の著作権表示をつける', () => {
    const firebase = packageLicense(join(root, 'node_modules/@firebase/app'));
    assert.deepEqual(
      [
        /Apache License\s+Version 2\.0/.test(firebase.text),
        firebase.copyright.some((l) => /Google LLC/.test(l)),
      ],
      [true, true],
    );
  });

  test('solid-js には MIT の本文と作者の著作権表示をつける', () => {
    const solid = packageLicense(join(root, 'node_modules/solid-js'));
    assert.deepEqual(
      [/Permission is hereby granted/.test(solid.text), solid.copyright.some((l) => /Ryan Carniato/.test(l))],
      [true, true],
    );
  });

  test('Lucide のライセンスには Feather 由来の MIT の部分も含む', () => {
    assert.match(packageLicense(join(root, 'node_modules/lucide')).text, /Cole Bemis/);
  });
});

describe('formatNotices', () => {
  const text = formatNotices([
    { name: 'b', version: '1.0.0', license: 'MIT', copyright: ['Copyright B'], text: 'MIT TEXT' },
    { name: 'a', version: '2.0.0', license: 'MIT', copyright: ['Copyright A'], text: 'MIT TEXT' },
    { name: 'c', license: 'ISC', copyright: [], text: 'ISC TEXT' },
  ]);

  test('同じライセンス本文は1回だけ書く', () => {
    assert.equal(text.split('MIT TEXT').length, 2);
  });

  test('同じ本文のパッケージを名前順に、それぞれの著作権表示つきで並べる', () => {
    assert.match(text, /a@2\.0\.0 \(MIT\)\n {2}Copyright A\nb@1\.0\.0 \(MIT\)\n {2}Copyright B/);
  });

  test('最後の本文で終わる', () => {
    assert.match(text, /ISC TEXT\n$/);
  });
});

describe('ビルドした第三者ライセンス表示', { skip }, () => {
  const text = skip ? '' : readFileSync(built(licensesPath), 'utf8');
  for (const [what, needle] of [
    ['@firebase/app', /^@firebase\/app@\S+ \(Apache-2\.0\)/m],
    ['firebase', /^firebase@\S+ \(Apache-2\.0\)/m],
    ['solid-js', /^solid-js@\S+ \(MIT\)/m],
    ['@solidjs/web', /^@solidjs\/web@\S+ \(MIT\)/m],
    ['lucide', /^lucide@\S+ \(ISC\)/m],
    ['Feather 由来の Lucide の著作権', /Copyright \(c\) 2013-present Cole Bemis/],
    ['IBM Plex Mono', /^@fontsource\/ibm-plex-mono@\S+ \(OFL-1\.1\)/m],
    ['Zen Maru Gothic', /^Zen Maru Gothic .*\(OFL-1\.1\)/m],
    [
      'Twemoji の絵柄と著作権',
      /^Twemoji graphics .*\(CC-BY-4\.0\).*\n-+\nCopyright 2019 Twitter, Inc and other contributors/m,
    ],
    ['Apache-2.0 の本文', /Apache License\s+Version 2\.0/],
    ['OFL の本文', /SIL OPEN FONT LICENSE Version 1\.1/],
  ])
    test(`${what} を載せる`, () => {
      assert.match(text, needle);
    });

  test('シールの絵柄のライセンスも公開する', () => {
    assert.ok(existsSync(built('stamps/LICENSE-GRAPHICS.txt')));
  });
});

describe('the built credits on /about', { skip }, () => {
  const html = skip ? '' : readFileSync(built('about/index.html'), 'utf8');
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
