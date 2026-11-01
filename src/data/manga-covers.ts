// Volume 1 covers of the featured manga, saved under public/images/covers.
// The series list itself comes from the 2026 edition; titles without a cover fall back to its thumbnail.
// spine / ink: the colours of each book's spine on the shelf, picked from its cover.
// Re-exported by editorial.ts, and shared with scripts/sync/images.ts, which caches only the series thumbnails actually shown: a
// publisher's key visual behind a cover is never fetched.
export const mangaCovers: Record<
  string,
  { image: string; source: string; url: string; spine: string; ink: string }
> = {
  放課後帰宅びより: {
    image: '/images/covers/houkago-kitaku-biyori.jpg',
    spine: '#f3a6b8',
    ink: '#5b3a86',
    source: 'webアクション（双葉社）',
    url: 'https://comic-action.com/episode/4856001361584756651',
  },
  やめろ好きになってしまう: {
    image: '/images/covers/yamesuki.jpg',
    spine: '#f27aa6',
    ink: '#2d2a33',
    source: '集英社',
    url: 'https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-893745-8',
  },
  妹は知っている: {
    image: '/images/covers/imouto-wa-shitteiru.jpg',
    spine: '#f08a3c',
    ink: '#2d2a33',
    source: 'BOOK☆WALKER',
    url: 'https://bookwalker.jp/series/513981/list/',
  },
  没落令嬢の悪党賛歌: {
    image: '/images/covers/botsuraku-reijou.jpg',
    spine: '#3b1f2b',
    ink: '#e8c66a',
    source: 'BOOK☆WALKER',
    url: 'https://bookwalker.jp/de6a461693-6f23-466a-8db4-99ade8de468f/',
  },
  寿司ガキ: {
    image: '/images/covers/sushi-gaki.jpg',
    spine: '#d63e31',
    ink: '#ffffff',
    source: 'カドコミ（KADOKAWA）',
    url: 'https://comic-walker.com/detail/KC_000933_S',
  },
  ざこのみなさんお大事に: {
    image: '/images/covers/zako-no-minasan.jpg',
    spine: '#5fc9cf',
    ink: '#2d2a33',
    source: 'BOOK☆WALKER',
    url: 'https://bookwalker.jp/de29709146-f9fd-4e74-979a-8c178c167f77/',
  },
};

/** The series.json thumbnail the bookshelf shows for `series`: only for a title without its own cover. */
export const shownSeriesThumbnail = (series: { title: string; thumbnail?: string | null }) =>
  mangaCovers[series.title]?.image ? null : series.thumbnail;
