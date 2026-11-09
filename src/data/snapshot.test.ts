// The data the site is built from, as committed: the snapshot the scheduled refresh collects
// (previews, image cache, music and manga) and the files edited by hand (works, the history, the
// covers). Each check lists everything that breaks it, so one run shows all there is to fix.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { clientMedia, type CacheEntry, type Preview } from '../content/media.ts';
import {
  framedCrop,
  framedSources,
  iconPages,
  iconSources,
  shownItems,
  thumbnailSources,
} from '../../scripts/sync/images.ts';
import cacheJson from './image-cache.json' with { type: 'json' };
import previewsJson from './previews.json' with { type: 'json' };
import tracks from './tracks.json' with { type: 'json' };
import series from './series.json' with { type: 'json' };
import baseWorks from './works.json' with { type: 'json' };

const cache: Record<string, CacheEntry> = cacheJson;
const previews = previewsJson as Record<string, Preview>;
const publicDir = fileURLToPath(new URL('../../public', import.meta.url));

describe('画像キャッシュ', () => {
  const entries = (sources: (string | null | undefined)[]) =>
    sources.flatMap((source) => (source && cache[source] ? [cache[source]] : []));
  const files = (e: CacheEntry) => [e.file, ...(e.variants ?? []).map((v) => v.file)];

  test('ページに表示する画像だけがキャッシュにあり、public/media にはそのファイルだけがある', async () => {
    const shown = new Set([
      ...thumbnailSources(previews, shownItems(tracks, series)),
      ...iconSources(previews, iconPages(baseWorks)),
    ]);
    const listed = new Set(Object.values(cache).flatMap(files));
    const media = (await readdir(`${publicDir}/media`)).map((name) => `/media/${name}`);
    assert.deepEqual(
      {
        notShown: Object.keys(cache).filter((source) => !shown.has(source)),
        unlisted: media.filter((file) => !listed.has(file)),
        missing: [...listed].filter((file) => !media.includes(file)),
      },
      { notShown: [], unlisted: [], missing: [] },
    );
  });

  test('幅 400px 以上のサムネイルとアイコンは幅が記録され、縮小版がある', () => {
    const shown = entries([
      ...Object.values(previews).flatMap((p) => [p.image, p.icon]),
      ...[...tracks, ...series].map((i) => i.thumbnail),
    ]).filter((e) => !/\.(gif|ico|svg)$/.test(e.file));
    assert.deepEqual(
      shown.filter((e) => !(e.width! > 0) || (e.width! >= 400 && !e.variants?.length)).map((e) => e.file),
      [],
    );
  });

  // The pages show only the 16:9 picture cut out of the YouTube thumbnails' bands.
  const framed = framedSources(tracks);
  const { images } = clientMedia({}, cache, [...framed]);

  test('曲のサムネイルはどれも 16:9 の切り出しを記録し、切り出したコピーだけを候補にする', () => {
    const wrong = tracks.flatMap(({ thumbnail }) => {
      const { file, crop, variants } = cache[thumbnail] ?? {};
      const largest = variants?.at(-1);
      const ok =
        framed.has(thumbnail) &&
        crop &&
        Math.abs(crop.width / crop.height - 16 / 9) < 0.01 &&
        !images[thumbnail].srcset?.includes(file!) &&
        images[thumbnail].src === largest?.file &&
        largest?.width === crop.width;
      return ok ? [] : [thumbnail];
    });
    assert.deepEqual(wrong, []);
  });

  test('曲のサムネイルの切り出したコピーの端には、黒や平らな帯が残っていない', async () => {
    const banded = [];
    for (const source of framed) {
      const { data, info } = await sharp(publicDir + images[source].src)
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const inside = framedCrop(data, info.width, info.height);
      if (inside.width < info.width - 2 || inside.height < info.height - 2) banded.push(images[source].src);
    }
    assert.deepEqual(banded, []);
  });
});

describe('リンク先のプレビュー', () => {
  const works = baseWorks as { id: string; url: string; image?: string }[];

  test('リポジトリのページの作品は GitHub のアイコンを使わない', () => {
    assert.deepEqual(
      works.filter((w) => previews[w.url]?.icon?.startsWith('https://github.githubassets.com/')).map((w) => w.id),
      [],
    );
  });

  test('Marketplace の作品は cp20 が公開した拡張だけで、画像は works.json に書いたものか cp20 の配信元から取る', () => {
    const listed = works.filter((w) => new URL(w.url).hostname === 'marketplace.visualstudio.com');
    assert.deepEqual(
      listed
        .filter((w) => {
          const image = previews[w.url]?.image;
          return (
            new URL(w.url).searchParams.get('itemName')?.split('.')[0] !== 'cp20' ||
            (image && image !== w.image && new URL(image).hostname !== 'cp20.gallerycdn.vsassets.io')
          );
        })
        .map((w) => w.id),
      [],
    );
  });

  test('曲のリンクは、どれも素の https://youtu.be/<id>', () => {
    assert.deepEqual(
      tracks.map((t) => t.link).filter((link) => !/^https:\/\/youtu\.be\/[-_A-Za-z0-9]{11}$/.test(link)),
      [],
    );
  });
});
