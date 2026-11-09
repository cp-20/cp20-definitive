// What the client receives about images: local paths, srcset candidates and sizes only. The
// committed covers and screenshots are checked in src/data/snapshot.test.ts.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { clientMedia, coverSrcsets } from './media.ts';

test('srcset は元の画像と同じ名前の WebP だけから、幅の順に作る', () => {
  assert.deepEqual(
    coverSrcsets(['a.jpg', 'a-480w.webp', 'a-240w.webp', 'a-b.jpg', 'b.png', 'notes.txt'], '/c/'),
    { '/c/a.jpg': '/c/a-240w.webp 240w, /c/a-480w.webp 480w' },
  );
});

describe('clientMedia', () => {
  const page = 'https://example.com/post';
  const media = () => clientMedia(
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
      'https://i.ytimg.com/vi/c/hq.jpg': {
        file: '/media/yt-c.jpg',
        checkedAt: 'x',
        width: 480,
        crop: { left: 0, top: 45, width: 480, height: 270 },
        variants: [
          { file: '/media/yt-c-320w.webp', width: 320 },
          { file: '/media/yt-c-480w.webp', width: 480 },
        ],
      },
      'https://unused.example.com/a.png': { file: '/media/unused.png', checkedAt: 'x' },
    },
    ['https://i.ytimg.com/vi/a/hq.jpg', 'https://i.ytimg.com/vi/b/hq.jpg', 'https://i.ytimg.com/vi/c/hq.jpg', null],
  );

  test('ページの画像は、ローカルのパスと srcset とサイズにする', () => {
    assert.deepEqual(media().pages[page], {
      width: 1200,
      height: 630,
      image: '/media/og.png',
      srcset: '/media/og-320w.webp 320w, /media/og-640w.webp 640w, /media/og.png 1200w',
      icon: '/media/icon-96w.webp',
    });
  });

  test('画像のないページは、サイズだけを持つ', () => {
    assert.deepEqual(media().pages['https://example.com/none'], { width: 1200, height: 630 });
  });

  test('ページ以外の画像は、使われているものだけを src と srcset にし、切り出した画像は切り出しだけを候補にする', () => {
    assert.deepEqual(media().images, {
      'https://i.ytimg.com/vi/a/hq.jpg': {
        src: '/media/yt.jpg',
        srcset: '/media/yt-320w.webp 320w, /media/yt.jpg 480w',
      },
      'https://i.ytimg.com/vi/b/hq.jpg': { src: '/media/yt-b.jpg' },
      'https://i.ytimg.com/vi/c/hq.jpg': {
        src: '/media/yt-c-480w.webp',
        srcset: '/media/yt-c-320w.webp 320w, /media/yt-c-480w.webp 480w',
      },
    });
  });

  test('確認日時や元の URL は、クライアントに送らない', () => {
    const serialized = JSON.stringify(media());
    assert.deepEqual(
      [serialized.includes('checkedAt'), serialized.includes('cdn.example.com')],
      [false, false],
    );
  });
});
