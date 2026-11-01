// What the client receives about images: local paths, srcset candidates and sizes only.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { mangaCovers } from '../data/manga-covers.ts';
import { clientMedia, coverSrcsets } from './media.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe('漫画の表紙', () => {
  const srcsets = readdir(join(root, 'public/images/covers')).then(coverSrcsets);
  const candidates = async (image: string) =>
    (await srcsets)[image]?.split(', ').map((c) => c.split(' ')) ?? [];
  for (const { image } of Object.values(mangaCovers)) {
    test(`${image} の最大の候補は、元の表紙と同じ幅`, async () => {
      const { width } = await sharp(join(root, 'public', image)).metadata();
      assert.equal((await candidates(image)).at(-1)?.[1], `${width}w`);
    });

    test(`${image} の WebP の候補は、srcset に書いた幅のとおり`, async () => {
      const copies = (await candidates(image)).filter(([file]) => file.endsWith('.webp'));
      const actual = await Promise.all(
        copies.map(async ([file]) => `${(await sharp(join(root, 'public', file)).metadata()).width}w`),
      );
      assert.deepEqual(
        actual,
        copies.map(([, descriptor]) => descriptor),
      );
    });
  }

  test('srcset は元の画像と同じ名前の WebP だけから作る', () => {
    assert.deepEqual(
      coverSrcsets(['a.jpg', 'a-240w.webp', 'a-480w.webp', 'a-b.jpg', 'b.png', 'notes.txt'], '/c/'),
      { '/c/a.jpg': '/c/a-240w.webp 240w, /c/a-480w.webp 480w' },
    );
  });
});

describe('clientMedia', () => {
  const page = 'https://example.com/post';
  const { pages, images } = clientMedia(
    {
      [page]: {
        image: 'https://cdn.example.com/og.png?x=1',
        icon: 'https://cdn.example.com/icon.png',
        width: 1200,
        height: 630,
        checkedAt: '2026-01-01',
      },
      'https://example.com/none': { image: null, icon: null, width: 1200, height: 630, checkedAt: 'x' },
    },
    {
      'https://cdn.example.com/og.png?x=1': {
        file: '/media/og.png',
        checkedAt: 'x',
        width: 1200,
        variants: [
          { file: '/media/og-320w.webp', width: 320 },
          { file: '/media/og-640w.webp', width: 640 },
        ],
      },
      'https://cdn.example.com/icon.png': {
        file: '/media/icon.png',
        checkedAt: 'x',
        width: 180,
        variants: [{ file: '/media/icon-96w.webp', width: 96 }],
      },
      'https://i.ytimg.com/vi/a/hq.jpg': {
        file: '/media/yt.jpg',
        checkedAt: 'x',
        width: 480,
        variants: [{ file: '/media/yt-320w.webp', width: 320 }],
      },
      'https://i.ytimg.com/vi/b/hq.jpg': { file: '/media/yt-b.jpg', checkedAt: 'x' },
      'https://unused.example.com/a.png': { file: '/media/unused.png', checkedAt: 'x' },
    },
    ['https://i.ytimg.com/vi/a/hq.jpg', 'https://i.ytimg.com/vi/b/hq.jpg', null],
  );

  test('ページの画像は、ローカルのパスと srcset とサイズにする', () => {
    assert.deepEqual(pages[page], {
      width: 1200,
      height: 630,
      image: '/media/og.png',
      srcset: '/media/og-320w.webp 320w, /media/og-640w.webp 640w, /media/og.png 1200w',
      icon: '/media/icon-96w.webp',
    });
  });

  test('画像のないページは、サイズだけを持つ', () => {
    assert.deepEqual(pages['https://example.com/none'], { width: 1200, height: 630 });
  });

  test('ページ以外の画像は、使われているものだけを src と srcset にする', () => {
    assert.deepEqual(images, {
      'https://i.ytimg.com/vi/a/hq.jpg': {
        src: '/media/yt.jpg',
        srcset: '/media/yt-320w.webp 320w, /media/yt.jpg 480w',
      },
      'https://i.ytimg.com/vi/b/hq.jpg': { src: '/media/yt-b.jpg' },
    });
  });

  test('確認日時や元の URL は、クライアントに送らない', () => {
    const serialized = JSON.stringify({ pages, images });
    assert.deepEqual(
      [serialized.includes('checkedAt'), serialized.includes('cdn.example.com')],
      [false, false],
    );
  });
});
