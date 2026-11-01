// Regression tests for the third-party notices: the notices file the build writes and the credits
// section that links to it.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bareName, formatNotices, licensesPath, packageDirectory, packageLicense } from './licenses.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const built = (path: string) => join(root, 'dist/client', path);
const skip = !existsSync(built('404.html'));

describe('packageDirectory', () => {
  for (const [id, directory] of [
    ['/x/node_modules/@firebase/app/dist/esm/index.esm.js', '/x/node_modules/@firebase/app'],
    ['/x/node_modules/a/node_modules/b/index.js?v=1', '/x/node_modules/a/node_modules/b'],
    ['node_modules/@fontsource/ibm-plex-mono/files/x.woff2', 'node_modules/@fontsource/ibm-plex-mono'],
    ['/x/src/App.tsx', undefined],
  ] as const)
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
  ] as const)
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

describe.skipIf(skip)('ビルドした第三者ライセンス表示', () => {
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
  ] as [string, RegExp][])
    test(`${what} を載せる`, () => {
      assert.match(text, needle);
    });

  test('シールの絵柄のライセンスも公開する', () => {
    assert.ok(existsSync(built('stamps/LICENSE-GRAPHICS.txt')));
  });
});

describe.skipIf(skip)('the built credits dialog', () => {
  const html = skip ? '' : readFileSync(built('index.html'), 'utf8');
  const credits = html.slice(
    html.indexOf('id="credits"'),
    html.indexOf('</dialog>', html.indexOf('id="credits"')),
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
