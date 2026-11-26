// The thumbnails of the featured music and manga, whose selection is edited by hand.
import { describe, onTestFinished, test } from 'vitest';
import assert from 'node:assert/strict';
import { ogImage, syncPicks, trackId, youtubeThumbnail } from './picks.ts';
import { tempDirs } from './temp-dirs.ts';

describe('trackId', () => {
  for (const link of [
    'javascript://youtu.be/upUv8iWVs-I?%0Aalert(document.domain)',
    'http://youtu.be/upUv8iWVs-I',
    'https://youtu.be.example.com/upUv8iWVs-I',
    'https://youtu.be/too-short',
    'https://youtu.be/upUv8iWVs-I?si=x',
  ])
    test(`${link} は曲のリンクにできない`, () => {
      assert.throws(() => trackId(link));
    });

  test('素の https://youtu.be/<id> から動画の id を取り出す', () => {
    assert.equal(trackId('https://youtu.be/upUv8iWVs-I'), 'upUv8iWVs-I');
  });
});

test('サムネイルは YouTube にある一番大きいものを使う', async () => {
  const has = (name: string) =>
    (async (url: string) =>
      new Response(null, { status: url.includes(`/${name}.jpg`) ? 200 : 404 })) as unknown as typeof fetch;
  assert.deepEqual(
    await Promise.all(
      [has('maxresdefault'), has('sddefault'), has('none')].map((f) => youtubeThumbnail('a', f)),
    ),
    [
      'https://i.ytimg.com/vi/a/maxresdefault.jpg',
      'https://i.ytimg.com/vi/a/sddefault.jpg',
      'https://i.ytimg.com/vi/a/hqdefault.jpg',
    ],
  );
});

test('漫画のサムネイルは、知っている出版社の CDN の og:image だけ', () => {
  assert.equal(
    ogImage('<head><meta property="og:image" content="https://cdn-img.comic-action.com/a.png"></head>'),
    'https://cdn-img.comic-action.com/a.png',
  );
  assert.throws(() =>
    ogImage('<head><meta property="og:image" content="https://evil.example/a.png"></head>'),
  );
});

describe('syncPicks', () => {
  const book = {
    title: 'Book',
    author: 'A',
    link: 'https://comic-action.com/episode/0',
    thumbnail: 'https://cdn-img.comic-action.com/0.png',
    credit: '双葉社 / webアクション',
  };
  const song = { title: 'Song', composer: 'C', link: 'https://youtu.be/upUv8iWVs-I', thumbnail: '' };
  const page = (image: string) => `<head><meta property="og:image" content="${image}"></head>`;
  const missing = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
  async function run(answers: Record<string, unknown>) {
    const box = await tempDirs({ tracks: [song], series: [book] });
    onTestFinished(box.cleanup);
    const changed = await syncPicks(
      async (url) => {
        if (!(url in answers)) throw Error(`HTTP 404 ${url}`);
        return answers[url];
      },
      { dirs: box.dirs, fetch: missing },
    );
    return { changed, tracks: await box.load('tracks'), series: await box.load('series') };
  }

  test('手で選んだ曲と漫画はそのまま残し、サムネイルだけを更新する', async () => {
    const { changed, tracks, series } = await run({
      [book.link]: page('https://cdn-img.comic-action.com/1.png'),
    });
    assert.deepEqual(
      [changed, tracks, series],
      [
        true,
        [{ ...song, thumbnail: 'https://i.ytimg.com/vi/upUv8iWVs-I/hqdefault.jpg' }],
        [{ ...book, thumbnail: 'https://cdn-img.comic-action.com/1.png' }],
      ],
    );
  });

  test('ページを読めない漫画は前のサムネイルを残す', async () => {
    const { series } = await run({});
    assert.deepEqual(series, [book]);
  });
});
