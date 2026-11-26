// The icons beside the stickers: the pattern each account gets and where pictures are kept.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { AVATAR_SHOWN_MAX, AVATAR_SIDE, avatarUrl, googlePhoto, patternIcon } from './avatar.ts';

describe('patternIcon', () => {
  const cells = (uri: string) =>
    [...decodeURIComponent(uri).matchAll(/<rect x="(\d)" y="(\d)" width="1"/g)].map(
      ([, x, y]) => `${x},${y}`,
    );

  test('同じアカウントには毎回同じ模様、違うアカウントには違う模様', () => {
    assert.equal(patternIcon('alice'), patternIcon('alice'));
    assert.notEqual(patternIcon('alice'), patternIcon('bob'));
  });

  test('模様は左右対称', () => {
    for (const uid of ['alice', 'bob', 'Zx9kQ2mB7cR4']) {
      const shown = new Set(cells(patternIcon(uid)));
      for (const cell of shown) {
        const [x, y] = cell.split(',').map(Number);
        assert.ok(shown.has(`${6 - x},${y}`), `${uid}: ${cell}`);
      }
    }
  });

  test('アカウントの ID 以外 (メールアドレスなど) は使わない SVG のデータ URI', () => {
    assert.match(patternIcon('alice'), /^data:image\/svg\+xml,/);
  });
});

test('画像は avatars/<uid> に置き、版を変えると URL も変わる', () => {
  assert.match(avatarUrl('alice'), /\/o\/avatars%2Falice\?alt=media$/);
  assert.notEqual(avatarUrl('alice', 1), avatarUrl('alice', 2));
});

test('保存する画像は、いちばん大きく見せるアイコンの2倍の解像度', async () => {
  const css = await fs.readFile(new URL('../styles/app.css', import.meta.url), 'utf8');
  const sizes = [
    ...css.matchAll(/\.(?:avatar-editor-icon|sticker-avatar|account-avatar) \{[^}]*?width: (\d+)px/g),
  ].map((m) => +m[1]);
  assert.equal(Math.max(...sizes), AVATAR_SHOWN_MAX);
  assert.equal(AVATAR_SIDE, AVATAR_SHOWN_MAX * 2);
});

test('Google のアイコンは、保存する大きさの2倍で取り寄せる', () => {
  assert.equal(
    googlePhoto('https://lh3.googleusercontent.com/a/ACg8ocK=s96-c'),
    `https://lh3.googleusercontent.com/a/ACg8ocK=s${AVATAR_SIDE * 2}-c`,
  );
  assert.equal(googlePhoto('https://example.com/me.png'), 'https://example.com/me.png');
});
