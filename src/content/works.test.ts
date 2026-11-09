// How the works are listed and labelled, and that works.json states only what the pages can show.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { access, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import baseWorks from '../data/works.json' with { type: 'json' };
import manual from '../data/manual.json' with { type: 'json' };
import { editions, featuredIds } from '../data/editorial.ts';
import { mergeWorks } from '../site/pages.ts';
import {
  SOLO_ROLE,
  kindLabel,
  longPeriod,
  neighbours,
  membersSite,
  openLink,
  period,
  publicRepositories,
  startYear,
  statusLabel,
  workSections,
  type Work,
} from './works.ts';

const works = mergeWorks(baseWorks as Work[], manual as { projects?: Work[] });
const editionIds = editions.map((e) => `${e.year}-portfolio`);
const publicDir = fileURLToPath(new URL('../../public', import.meta.url));
const work = (fields: Partial<Work>): Work => ({
  id: 'x',
  title: 'x',
  description: 'x',
  url: 'https://example.com/',
  repositories: [],
  productionTime: '2024/01',
  techStack: [],
  tags: [],
  comments: [],
  relatedArticles: [],
  ...fields,
});

describe('制作時期', () => {
  test('始めた年で並べる', () => {
    assert.equal(startYear({ productionTime: '2023/12 ～ 2026/04' }), 2023);
    assert.equal(startYear({ productionTime: '2023/01/05～2023/01/11' }), 2023);
  });

  test('now は「現在」に、区切りの前後をそろえる', () => {
    assert.equal(period('2024/05 ～ now'), '2024/05 〜 現在');
    assert.equal(period('2023/01/05～2023/01/11'), '2023/01/05 〜 2023/01/11');
  });

  test('一覧に添えるのは、何か月も続いたものだけ', () => {
    assert.equal(longPeriod('2023/06 ～ 2024/03'), '2023/06〜2024/03');
    assert.equal(longPeriod('2024/05 ～ now'), '2024/05〜現在');
    // Within a month, or into the next one: the year heading is enough.
    assert.equal(longPeriod('2026/09/28 ～ 2026/10/05'), undefined);
    assert.equal(longPeriod('2024/08/19 ～ 2024/09/22'), undefined);
    assert.equal(longPeriod('2026/09'), undefined);
  });
});

describe('ボタンの行き先と文言', () => {
  test('行き先の名前で呼ぶ', () => {
    assert.equal(openLink(work({ url: 'https://github.com/cp-20/c-compiler' }))?.label, 'GitHub で見る');
    assert.equal(
      openLink(work({ url: 'https://marketplace.visualstudio.com/items?itemName=cp20.foodmoji-vscode' }))
        ?.label,
      'VS Code Marketplace で見る',
    );
    assert.equal(openLink(work({ url: 'https://dicespec.app' }))?.label, 'サイトを開く');
    assert.equal(openLink(work({ url: 'https://trap.jp/post/1/', kind: 'event' }))?.label, '開催記を読む');
  });

  test('公開を終えたサイトにはボタンを出さず、ほかのページがあればそれを出す', () => {
    assert.equal(openLink(work({ status: 'ended' })), undefined);
    assert.deepEqual(
      openLink(work({ status: 'ended', links: [{ label: '成果ページ', url: 'https://example.org/' }] })),
      { href: 'https://example.org/', label: '成果ページ', short: '成果ページ' },
    );
  });

  // Outside traP these sites end at a login page that says "Not authorized".
  test('部員向けのサイトは主ボタンにせず、記事かリポジトリを開く。サイトは部員向けと書いて添える', () => {
    const repo = 'https://github.com/traP-jp/a';
    const article = 'https://trap.jp/post/1/';
    const members = (fields: Partial<Work>) => work({ status: 'members-only', ...fields });
    assert.equal(openLink(members({ repositories: [repo], relatedArticles: [article] }))?.href, article);
    assert.deepEqual(openLink(members({ repositories: ['private', repo] })), {
      href: repo,
      label: 'GitHub で見る',
      short: 'GitHub',
    });
    assert.equal(openLink(members({})), undefined);
    assert.deepEqual(membersSite(members({})), { href: 'https://example.com/', label: 'サイト（部員向け）' });
    assert.equal(membersSite(work({})), undefined);
    for (const w of works.filter((w) => w.status === 'members-only')) {
      assert.notEqual(openLink(w)?.label, 'サイトを開く', w.id);
      assert.notEqual(openLink(w)?.href, w.url, w.id);
    }
  });

  test('主ボタンが開くリポジトリは、2つ目のボタンにしない', () => {
    const repo = 'https://github.com/traP-jp/a';
    const w = work({ status: 'members-only', repositories: [repo] });
    assert.deepEqual(publicRepositories(w, openLink(w)?.href), []);
  });

  test('作品の説明は、何なのかを1文で言い切る', () => {
    for (const w of works) assert.ok(w.description.endsWith('。'), `${w.id}: ${w.description}`);
  });

  test('ボタンと同じリポジトリは2つ目のボタンにしない', () => {
    const url = 'https://github.com/cp-20/a';
    assert.deepEqual(publicRepositories(work({ url, repositories: [url, 'private'] })), []);
    assert.deepEqual(publicRepositories(work({ repositories: [url] })), [{ url, name: 'cp-20/a' }]);
  });

  test('部員向けと公開終了は、開く前に分かるように書く', () => {
    assert.equal(statusLabel({ status: 'members-only' }), 'traP 部員向け（ログインが必要）');
    assert.equal(statusLabel({ status: 'ended' }), '終了');
    assert.equal(statusLabel({}), undefined);
  });

  test('一緒につくったものと主催したものだけ、種類を添える', () => {
    assert.equal(kindLabel({ tags: ['チーム開発', 'traP'] }), 'traP のチーム開発');
    assert.equal(kindLabel({ tags: ['traP'], kind: 'event' }), '主催したイベント');
    assert.equal(kindLabel({ tags: ['個人開発'] }), undefined);
  });
});

describe('/works の並び', () => {
  const sections = workSections(works, featuredIds, editionIds);

  test('代表作、年ごと（新しい順）、イベント、歴代の cp20.dev の順に、どの作品も1回だけ', () => {
    assert.deepEqual(
      sections.featured.map((w) => w.id),
      featuredIds,
    );
    const years = sections.years.map((y) => y.year);
    assert.deepEqual(
      years,
      [...years].sort((a, b) => b - a),
    );
    assert.ok(sections.events.every((w) => w.kind === 'event'));
    assert.deepEqual(
      sections.editions.map((w) => w.id),
      editionIds,
    );
    assert.deepEqual([...sections.order.map((w) => w.id)].sort(), works.map((w) => w.id).sort());
  });

  test('前後の作品は一覧の並びで、端では反対の端につながる', () => {
    const ids = sections.order.map((w) => w.id);
    assert.deepEqual(
      neighbours(sections.order, ids[0]).map((w) => w.id),
      [ids.at(-1), ids[1]],
    );
    assert.deepEqual(neighbours([{ id: 'a' }, { id: 'b' }], 'a'), [{ id: 'b' }]);
  });
});

describe('works.json', () => {
  test('状態と種類は決まった値だけ', () => {
    const bad = works.filter(
      (w) =>
        (w.status && !['active', 'ended', 'members-only'].includes(w.status)) ||
        (w.kind && w.kind !== 'event'),
    );
    assert.deepEqual(
      bad.map((w) => w.id),
      [],
    );
  });

  test('どの作品にも役割があり、1人でつくったものは同じ言い方', () => {
    assert.deepEqual(
      works.filter((w) => !w.role?.trim()).map((w) => w.id),
      [],
    );
    const solo = works.filter((w) => w.tags.includes('個人開発'));
    assert.deepEqual(
      solo.filter((w) => w.role !== SOLO_ROLE).map((w) => w.id),
      [],
    );
  });

  test('公開を終えた作品は、サイトの代わりに出すページを持つか、ボタンなし', () => {
    for (const w of works.filter((w) => w.status === 'ended'))
      assert.ok(!w.links || w.links.every((l) => l.url.startsWith('https://')), w.id);
  });

  test('スクリーンショットは撮った画像と WebP の縮小版がある', async () => {
    const shots = works.flatMap((w) => (w.screenshots ?? []).map((s) => ({ id: w.id, ...s })));
    const names = await readdir(`${publicDir}/images/screenshots`);
    for (const s of shots) {
      assert.equal(s.src, `/images/screenshots/${s.id}-${s.device}.png`);
      assert.ok(s.alt.trim(), `${s.src} has no alt text`);
      await access(publicDir + s.src);
      const stem = s.src.split('/').at(-1)!.replace('.png', '');
      assert.ok(
        names.some((n) => new RegExp(`^${stem}-\\d+w\\.webp$`).test(n)),
        `${s.src} has no WebP copies`,
      );
    }
    // Every file in the directory belongs to a screenshot that is shown.
    const stems = shots.map((s) => s.src.split('/').at(-1)!.replace('.png', ''));
    assert.deepEqual(
      names.filter((n) => !stems.some((stem) => n === `${stem}.png` || n.startsWith(`${stem}-`))),
      [],
    );
  });

  // The figures the owner gave (2026-11-09): the old monthly 6,000 users is over a year old.
  test('ダイススペックの利用者数は今の数字だけ', () => {
    const dice = works.find((w) => w.id === 'dice-spec-v2')!;
    assert.equal(dice.outcome, '月2,000〜3,000人ほどが利用');
    assert.ok(![dice.description, dice.summary, ...dice.comments].join().includes('6000'));
  });
});
