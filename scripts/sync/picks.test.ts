// The featured music and manga, read from JSON that nobody here controls.
import { describe, onTestFinished, test } from 'vitest';
import assert from 'node:assert/strict';
import { ogImage, seriesFrom, syncPicks, trackFrom, youtubeThumbnail } from './picks.ts';
import { tempDirs } from './temp-dirs.ts';

const track = (link: string) => ({ title: 't', composer: 'c', link });

describe('trackFrom', () => {
  for (const link of [
    'javascript://youtu.be/upUv8iWVs-I?%0Aalert(document.domain)',
    'http://youtu.be/upUv8iWVs-I',
    'https://youtu.be.example.com/upUv8iWVs-I',
    'https://youtu.be/too-short',
  ])
    test(`${link} の曲は受け付けない`, () => {
      assert.throws(() => trackFrom(track(link)));
    });

  test('曲名や作曲者が文字列でない曲は受け付けない', () => {
    assert.throws(() => trackFrom({ ...track('https://youtu.be/upUv8iWVs-I'), title: 1 }));
  });

  test('https://youtu.be/<id> のリンクは、クエリとハッシュを落として作り直す', () => {
    assert.deepEqual(trackFrom(track('https://youtu.be/upUv8iWVs-I?si=x#t=1')), {
      id: 'upUv8iWVs-I',
      title: 't',
      composer: 'c',
      link: 'https://youtu.be/upUv8iWVs-I',
    });
  });
});

test('サムネイルは YouTube にある一番大きいものを使う', async () => {
  const has = (name: string) =>
    (async (url: string) => new Response(null, { status: url.includes(`/${name}.jpg`) ? 200 : 404 })) as unknown as typeof fetch;
  assert.deepEqual(
    await Promise.all([has('maxresdefault'), has('sddefault'), has('none')].map((f) => youtubeThumbnail('a', f))),
    [
      'https://i.ytimg.com/vi/a/maxresdefault.jpg',
      'https://i.ytimg.com/vi/a/sddefault.jpg',
      'https://i.ytimg.com/vi/a/hqdefault.jpg',
    ],
  );
});

describe('seriesFrom', () => {
  const entry = { title: 'T', author: 'A', link: 'https://comic-action.com/episode/1' };

  test('知っている出版社の漫画を、その出版社の名前と前のサムネイルつきで受け付ける', () => {
    const before = [{ ...entry, thumbnail: 'https://cdn-img.comic-action.com/t.png', credit: 'x' }];
    assert.deepEqual(seriesFrom(entry, before), {
      ...entry,
      thumbnail: 'https://cdn-img.comic-action.com/t.png',
      credit: '双葉社 / webアクション',
    });
  });

  for (const [why, raw] of [
    ['知らないサイト', { ...entry, link: 'https://evil.example/episode/1' }],
    ['http のリンク', { ...entry, link: 'http://comic-action.com/episode/1' }],
    ['文字列でない作者', { ...entry, author: null }],
  ] as const)
    test(`${why}の漫画は受け付けない`, () => {
      assert.throws(() => seriesFrom(raw, []));
    });
});

test('漫画のサムネイルは、知っている出版社の CDN の og:image だけ', () => {
  assert.equal(
    ogImage('<head><meta property="og:image" content="https://cdn-img.comic-action.com/a.png"></head>'),
    'https://cdn-img.comic-action.com/a.png',
  );
  assert.throws(() => ogImage('<head><meta property="og:image" content="https://evil.example/a.png"></head>'));
});

describe('syncPicks', () => {
  const shelf = [
    {
      title: 'Old',
      author: 'A',
      link: 'https://comic-action.com/episode/0',
      thumbnail: 'https://cdn-img.comic-action.com/0.png',
      credit: '双葉社 / webアクション',
    },
  ];
  const page = (image: string) => `<head><meta property="og:image" content="${image}"></head>`;
  const missing = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
  async function run(answers: Record<string, unknown>) {
    const box = await tempDirs({ tracks: [], series: shelf });
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
  const tracksUrl = 'https://2026.cp20.dev/featured-tracks?raw=true';
  const seriesUrl = 'https://2026.cp20.dev/featured-series?raw=true';

  test('1曲でもおかしな曲があれば、前の選曲を残す', async () => {
    const { changed, tracks } = await run({
      [tracksUrl]: [track('https://youtu.be/upUv8iWVs-I'), track('javascript:alert(1)')],
    });
    assert.deepEqual([changed, tracks], [false, []]);
  });

  test('新しい棚の漫画は、それぞれのページの og:image をサムネイルにする', async () => {
    const link = 'https://comic-action.com/episode/1';
    const { changed, series } = await run({
      [seriesUrl]: [{ title: 'New', author: 'B', link }],
      [link]: page('https://cdn-img.comic-action.com/1.png'),
    });
    assert.deepEqual(
      [changed, series.map((s: { thumbnail: string }) => s.thumbnail)],
      [true, ['https://cdn-img.comic-action.com/1.png']],
    );
  });

  test('サムネイルを読めない漫画がある新しい棚は使わず、前の棚を残す', async () => {
    const { changed, series } = await run({
      [seriesUrl]: [{ title: 'New', author: 'B', link: 'https://comic-action.com/episode/1' }],
    });
    assert.deepEqual([changed, series], [false, shelf]);
  });
});
