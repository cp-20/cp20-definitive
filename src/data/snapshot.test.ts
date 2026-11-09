// The data the site is built from, as committed: the snapshot the scheduled refresh collects
// (previews, image cache, music and manga) and the data edited by hand (works, the history, the
// covers and screenshots). Each check lists everything that breaks it, so one run shows all there
// is to fix.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { clientMedia, coverSrcsets, type CacheEntry, type Preview } from '../content/media.ts';
import { splitLinks } from '../content/inline-links.ts';
import { splitEmphasis } from '../content/emphasis.ts';
import { SOLO_ROLE, openLink, type Work } from '../content/works.ts';
import { mergeWorks, sitePaths } from '../site/pages.ts';
import { highlightIds, milestones, speedups } from './editorial.ts';
import { mangaCovers } from './manga-covers.ts';
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
import manual from './manual.json' with { type: 'json' };

const cache: Record<string, CacheEntry> = cacheJson;
const previews = previewsJson as Record<string, Preview>;
const publicDir = fileURLToPath(new URL('../../public', import.meta.url));
const works = mergeWorks(baseWorks as Work[], manual as { projects?: Work[] });
const width = async (file: string) => `${(await sharp(publicDir + file).metadata()).width}w`;
/** `<name>: <rule>` for every rule (named by what it requires) that an item breaks. */
const brokenRules = <T>(
  items: readonly T[],
  name: (item: T) => string,
  rules: Record<string, (item: T) => unknown>,
) =>
  items.flatMap((item) =>
    Object.entries(rules)
      .filter(([, holds]) => !holds(item))
      .map(([rule]) => `${name(item)}: ${rule}`),
  );

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

  test('表示するサムネイルとアイコン（GIF・ICO を除く）には幅が記録され、幅 400px 以上なら縮小版がある', () => {
    const shown = entries([
      ...Object.values(previews).flatMap((p) => [p.image, p.icon]),
      ...[...tracks, ...series].map((i) => i.thumbnail),
    ]).filter((e) => !/\.(gif|ico|svg)$/.test(e.file));
    assert.deepEqual(
      brokenRules(shown, (e) => e.file, {
        幅が記録されている: (e) => (e.width ?? 0) > 0,
        '幅 400px 以上なら縮小版がある': (e) => (e.width ?? 0) < 400 || e.variants?.length,
      }),
      [],
    );
  });

  // The pages show only the 16:9 picture cut out of the YouTube thumbnails' bands.
  const framed = framedSources(tracks);
  const { images } = clientMedia({}, cache, [...framed]);

  test('曲のサムネイルはどれも 16:9 の切り出しを記録し、切り出したコピーだけを候補にする', () => {
    assert.deepEqual(
      brokenRules(
        tracks.map((t) => t.thumbnail),
        (source) => source,
        {
          'YouTube のサムネイル': (source) => framed.has(source),
          '16:9 の切り出しが記録されている': (source) => {
            const crop = cache[source]?.crop;
            return crop && Math.abs(crop.width / crop.height - 16 / 9) < 0.01;
          },
          '元の画像は候補にしない': (source) => !images[source]?.srcset?.includes(cache[source]?.file),
          '原寸の切り出しを src にする': (source) => {
            const largest = cache[source]?.variants?.at(-1);
            return images[source]?.src === largest?.file && largest?.width === cache[source]?.crop?.width;
          },
        },
      ),
      [],
    );
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
  test('リポジトリのページの作品は GitHub のアイコンを使わない', () => {
    assert.deepEqual(
      works.filter((w) => previews[w.url]?.icon?.startsWith('https://github.githubassets.com/')).map((w) => w.id),
      [],
    );
  });

  test('Marketplace の作品は cp20 が公開した拡張だけで、画像は works.json に書いたものか cp20 の配信元から取る', () => {
    const listed = works.filter((w) => new URL(w.url).hostname === 'marketplace.visualstudio.com');
    assert.deepEqual(
      brokenRules(listed, (w) => w.id, {
        'cp20 が公開した拡張': (w) => new URL(w.url).searchParams.get('itemName')?.startsWith('cp20.'),
        '画像は works.json に書いたものか cp20 の配信元のもの': (w) => {
          const image = previews[w.url]?.image;
          return !image || image === w.image || new URL(image).hostname === 'cp20.gallerycdn.vsassets.io';
        },
      }),
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

describe('作品（works.json）', () => {
  test('説明は何なのかを1文で言い切り、役割を書き、1人でつくったものは同じ言い方をする', () => {
    assert.deepEqual(
      brokenRules(works, (w) => w.id, {
        '説明は「。」で終わる': (w) => w.description.endsWith('。'),
        役割がある: (w) => w.role?.trim(),
        [`個人開発の役割は「${SOLO_ROLE}」`]: (w) => !w.tags.includes('個人開発') || w.role === SOLO_ROLE,
      }),
      [],
    );
  });

  test('状態と種類は決まった値だけで、公開を終えたものの代わりのページは https', () => {
    assert.deepEqual(
      brokenRules(works, (w) => w.id, {
        'status は active・ended・members-only のどれか': (w) =>
          !w.status || ['active', 'ended', 'members-only'].includes(w.status),
        'kind は event だけ': (w) => !w.kind || w.kind === 'event',
        '公開を終えたものの代わりのページは https': (w) =>
          w.status !== 'ended' || (w.links ?? []).every((l) => l.url.startsWith('https://')),
      }),
      [],
    );
  });

  // Outside traP these sites end at a login page that says "Not authorized".
  test('部員向けのサイトは主ボタンにしない', () => {
    assert.deepEqual(
      works.filter((w) => w.status === 'members-only' && openLink(w)?.href === w.url).map((w) => w.id),
      [],
    );
  });

  test('説明文のリンクは [label](url) で書き、サイト内へのリンクは実在するページを指す', () => {
    const paths = new Set(sitePaths(works));
    const wrong = works.flatMap((w) =>
      w.comments.flatMap((comment) => {
        const parts = splitLinks(comment);
        const bare = /https?:\/\/|\(\/|\]\(/.test(parts.map((p) => ('text' in p ? p.text : '')).join(''));
        const broken = parts.flatMap((p) => ('href' in p && p.href.startsWith('/') && !paths.has(p.href) ? [p.href] : []));
        return [...(bare ? [`${w.id}: URL がむき出し`] : []), ...broken.map((href) => `${w.id}: ${href}`)];
      }),
    );
    assert.deepEqual(wrong, []);
  });

  test('スクリーンショットは撮った画像と説明と WebP の縮小版がそろい、ほかのファイルはない', async () => {
    const shots = works.flatMap((w) => (w.screenshots ?? []).map((s) => ({ id: w.id, ...s })));
    const names = await readdir(`${publicDir}/images/screenshots`);
    const stem = (src: string) => src.split('/').at(-1)!.replace('.png', '');
    assert.deepEqual(
      {
        wrong: brokenRules(shots, (s) => s.src, {
          'パスは /images/screenshots/<作品の id>-<device>.png': (s) =>
            s.src === `/images/screenshots/${s.id}-${s.device}.png`,
          説明がある: (s) => s.alt.trim(),
          画像がある: (s) => names.includes(`${stem(s.src)}.png`),
          'WebP の縮小版がある': (s) => names.some((n) => new RegExp(`^${stem(s.src)}-\\d+w\\.webp$`).test(n)),
        }),
        stray: names.filter(
          (n) => !shots.some((s) => n === `${stem(s.src)}.png` || n.startsWith(`${stem(s.src)}-`)),
        ),
      },
      { wrong: [], stray: [] },
    );
  });
});

test('表紙とスクリーンショットにはどれも WebP の候補があり、srcset の幅は実際の幅で、最大の候補は原寸', async () => {
  const srcsets: Record<string, string> = {};
  for (const directory of ['/images/covers/', '/images/screenshots/'])
    Object.assign(srcsets, coverSrcsets(await readdir(publicDir + directory), directory));
  const shown = [
    ...Object.values(mangaCovers).map((c) => c.image),
    ...works.flatMap((w) => (w.screenshots ?? []).map((s) => s.src)),
  ];
  const wrong = shown.filter((file) => !srcsets[file]);
  for (const [file, srcset] of Object.entries(srcsets)) {
    const candidates = srcset.split(', ').map((c) => c.split(' '));
    if (candidates.at(-1)?.[1] !== (await width(file))) wrong.push(file);
    for (const [copy, descriptor] of candidates) if ((await width(copy)) !== descriptor) wrong.push(copy);
  }
  assert.deepEqual(wrong, []);
});

describe('漫画の表紙（manga-covers.ts）', () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  test('背表紙の文字は 4.5:1 以上のコントラストで読める', () => {
    assert.deepEqual(
      Object.entries(mangaCovers)
        .filter(([, { spine, ink }]) => contrast(spine, ink) < 4.5)
        .map(([title]) => title),
      [],
    );
  });

  // The spine's picture shows 1/zoom of the cover's width around the face (and as much of its
  // height); a face nearer the edge than that would leave the frame partly empty.
  test('背表紙の絵は表紙の内側から切り出す', () => {
    const outside = Object.entries(mangaCovers).filter(([, { face, zoom }]) => {
      const half = 1 / zoom / 2;
      const halfDown = (half * 480) / 682;
      return zoom < 1 || face[0] < half || face[0] > 1 - half || face[1] < halfDown || face[1] > 1 - halfDown;
    });
    assert.deepEqual(
      outside.map(([title]) => title),
      [],
    );
  });
});

describe('経歴（editorial.ts）', () => {
  // Units written two ways (17.5 秒 / 17.5秒, 35ms / 35ミリ秒) compare as the same.
  const normalize = (s: string) => s.replace(/\s+/g, '').replace(/ミリ秒/g, 'ms');
  const detailOf = (id: string) => normalize(milestones.find((m) => m.id === id)!.detail.join(''));

  test('id は重複せず URL の # にそのまま書け、作品とトップの実績はある経歴と作品を指す', () => {
    const ids = milestones.map((m) => m.id);
    const workIds = new Set(works.map((w) => w.id));
    assert.deepEqual(
      [
        ...brokenRules(milestones, (m) => m.id, {
          'id は1つだけ': (m) => ids.indexOf(m.id) === ids.lastIndexOf(m.id),
          'id は小文字の単語をハイフンでつないだもの': (m) => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(m.id),
          'work は works.json の id': (m) => !m.work || workIds.has(m.work),
        }),
        ...highlightIds.filter((id) => !ids.includes(id)).map((id) => `${id}: トップの実績にあるが経歴にない`),
      ],
      [],
    );
  });

  test('1行で強調した数字と「速くしてきたもの」の数字は、その経歴の詳しい説明にも書いてある', () => {
    const missing = [
      ...milestones.flatMap((m) =>
        splitEmphasis(m.text)
          .flatMap((p) => ('strong' in p ? (p.strong.match(/[\d,.]+/g) ?? []) : []))
          .filter((figure) => !detailOf(m.id).includes(figure))
          .map((figure) => `${m.id}: ${figure}`),
      ),
      ...speedups.flatMap((s) =>
        [s.from, s.to].filter((v) => v && !detailOf(s.id).includes(normalize(v))).map((v) => `${s.id}: ${v}`),
      ),
    ];
    assert.deepEqual(missing, []);
  });
});
