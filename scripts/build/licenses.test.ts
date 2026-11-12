// The third-party notices: which package a bundled module belongs to, each package's license text,
// and the notices file. What the build publishes is checked in dist.test.ts.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bareName, formatNotices, packageDirectory, packageLicense } from './licenses.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');

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
  const format = () =>
    formatNotices([
      { name: 'b', version: '1.0.0', license: 'MIT', copyright: ['Copyright B'], text: 'MIT TEXT' },
      { name: 'a', version: '2.0.0', license: 'MIT', copyright: ['Copyright A'], text: 'MIT TEXT' },
      { name: 'c', license: 'ISC', copyright: [], text: 'ISC TEXT' },
    ]);

  test('同じ本文のパッケージを名前順に、それぞれの著作権表示つきで並べ、本文は1回だけ書く', () => {
    const text = format();
    assert.match(text, /a@2\.0\.0 \(MIT\)\n {2}Copyright A\nb@1\.0\.0 \(MIT\)\n {2}Copyright B/);
    assert.equal(text.split('MIT TEXT').length, 2);
  });

  test('最後の本文で終わる', () => {
    assert.match(format(), /ISC TEXT\n$/);
  });
});

test('シールの絵柄のライセンスは、著作権者を書く', () => {
  assert.match(
    read('public/stamps/LICENSE-GRAPHICS.txt'),
    /Copyright 2019 Twitter, Inc and other contributors/,
  );
});

test('文字のシールの字形のフォントは、著作権者と SIL OFL の本文を載せる', () => {
  const graphics = read('public/stamps/LICENSE-GRAPHICS.txt');
  assert.match(graphics, /Copyright 2019 The Cherry Bomb Project Authors/);
  assert.match(graphics, /SIL OPEN FONT LICENSE Version 1\.1/);
});

test('シールの絵柄のライセンスは、どの絵のファイルも挙げる', () => {
  const graphics = read('public/stamps/LICENSE-GRAPHICS.txt');
  const pictures = readdirSync(join(root, 'public/stamps')).filter((f) => f.endsWith('.svg'));
  assert.deepEqual(
    pictures.filter((file) => !graphics.includes(file)),
    [],
  );
});
