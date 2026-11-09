// How the works are listed and labelled. works.json itself is checked in src/data/snapshot.test.ts.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
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
  });

  test('主ボタンが開くリポジトリは、2つ目のボタンにしない', () => {
    const repo = 'https://github.com/traP-jp/a';
    const w = work({ status: 'members-only', repositories: [repo] });
    assert.deepEqual(publicRepositories(w, openLink(w)?.href), []);
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
  // One featured work, works started in two years, an event and an edition of this portfolio.
  const list = [
    work({ id: 'old', productionTime: '2022/04' }),
    work({ id: 'star', productionTime: '2021/01' }),
    work({ id: 'meetup', kind: 'event', productionTime: '2025/05' }),
    work({ id: 'spring', productionTime: '2024/03/01 ～ 2024/03/20' }),
    work({ id: '2024-portfolio', productionTime: '2024/09' }),
    work({ id: 'autumn', productionTime: '2024/10 ～ now' }),
  ];
  const sections = workSections(list, ['star'], ['2024-portfolio']);

  test('代表作、始めた年の新しい順、イベント、歴代の cp20.dev の順に、どの作品も1回だけ並べる', () => {
    assert.deepEqual(
      sections.order.map((w) => w.id),
      ['star', 'autumn', 'spring', 'old', 'meetup', '2024-portfolio'],
    );
  });

  test('代表作・イベント・歴代の cp20.dev のほかは、始めた年の見出しの下に分ける', () => {
    assert.deepEqual(
      sections.years.map((y) => [y.year, y.works.map((w) => w.id)]),
      [
        [2024, ['autumn', 'spring']],
        [2022, ['old']],
      ],
    );
  });

  test('ない作品を代表作に挙げたら失敗にする', () => {
    assert.throws(() => workSections(list, ['gone'], []), /No work "gone"/);
  });

  test('前後の作品は一覧の並びで、端では反対の端につながる', () => {
    const around = (id: string) => neighbours(sections.order, id).map((w) => w.id);
    assert.deepEqual(around('star'), ['2024-portfolio', 'autumn']);
    assert.deepEqual(around('2024-portfolio'), ['meetup', 'star']);
  });

  test('2作品しかなければ、前後は同じ1作品', () => {
    assert.deepEqual(neighbours([{ id: 'a' }, { id: 'b' }], 'a'), [{ id: 'b' }]);
  });
});
