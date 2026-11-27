import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { imageTags, placeholderBackground, wantsPlaceholder } from './placeholders.ts';

describe('placeholders', () => {
  test('img の src と幅を読み、サイトのラスター画像でアイコンより大きいものだけ対象にする', () => {
    const tags = imageTags(
      '<img _hk=1 src="/media/a.png" srcset="x 1w" width="1200" height="630">' +
        '<img src="/images/brands/github.svg" width="18"><img class="x" src="/media/icon-96w.webp" width="24">' +
        '<img src="https://example.com/a.png"><img src="/media/spine.webp" alt="">',
    );
    assert.deepEqual(
      tags.filter(wantsPlaceholder).map((t) => t.src),
      ['/media/a.png', '/media/spine.webp'],
    );
  });

  test('仮の絵は小さな WebP をぼかす SVG で、CSS の url() にそのまま書ける', async () => {
    const webp = await sharp({ create: { width: 10, height: 5, channels: 3, background: '#3a7' } })
      .webp()
      .toBuffer();
    const css = placeholderBackground(webp, 10, 5);
    const svg = decodeURIComponent(css.slice('url("data:image/svg+xml,'.length, -2));
    assert.deepEqual(
      [
        /^url\("data:image\/svg\+xml,[^"#<>]+"\)$/.test(css),
        svg.includes("viewBox='0 0 10 5'"),
        svg.includes(webp.toString('base64')),
      ],
      [true, true, true],
    );
  });
});
