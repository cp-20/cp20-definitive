import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { firstPictures } from './warm.ts';

describe('firstPictures', () => {
  test('main の中ですぐ読む画像を srcset と sizes ごと、足りなければ最初の遅延読み込みの画像を足す', () => {
    const html =
      '<header><img src="/images/avatar-384.webp" width="132"></header><main id="main">' +
      '<img src="/media/a.png" srcset="/media/a-320w.webp 320w" sizes="300px" width="1200" loading="eager">' +
      '<img src="/media/icon-96w.webp" width="24"><img src="/images/brands/x.svg" width="18">' +
      '<img src="/media/b.png" width="1200" loading="lazy"><img src="/media/c.png" width="1200" loading="lazy">' +
      '<img src="/media/d.png" width="1200" loading="lazy"></main>';
    assert.deepEqual(firstPictures(html), [
      { src: '/media/a.png', srcset: '/media/a-320w.webp 320w', sizes: '300px' },
      { src: '/media/b.png' },
      { src: '/media/c.png' },
    ]);
  });
});
