// Volume 1 covers of the featured manga, saved under public/images/covers.
// The series list itself comes from the 2026 edition; titles without a cover fall back to its thumbnail.
// spine / ink: the colours of each book's spine on the shelf, picked from its cover.
// face: the middle of the little picture at the head of the spine, on the cover (0-1 across,
// 0-1 down), and how far to zoom in (the picture is 1/zoom of the cover's width square), as real
// volumes print a character on the spine. Chosen book by book on the cover and on the shelf: the
// main character's face whole across, its eyes a little above the middle (the picture's lower part
// fades into the spine), and the cut clear of the cover's lettering, speech balloons and hands
// that would show only in part. The zoom is per book so every face comes out about as large.
// Re-exported by editorial.ts, and shared with scripts/sync/images.ts, which caches only the series thumbnails actually shown: a
// publisher's key visual behind a cover is never fetched.
export const mangaCovers: Record<
  string,
  {
    image: string;
    source: string;
    url: string;
    spine: string;
    ink: string;
    face: [number, number];
    zoom: number;
  }
> = {
  放課後帰宅びより: {
    image: '/images/covers/houkago-kitaku-biyori.jpg',
    spine: '#f3a6b8',
    ink: '#5b3a86',
    face: [0.62, 0.31],
    zoom: 2.8,
    source: 'webアクション（双葉社）',
    url: 'https://comic-action.com/episode/4856001361584756651',
  },
  やめろ好きになってしまう: {
    image: '/images/covers/yamesuki.jpg',
    spine: '#f27aa6',
    ink: '#2d2a33',
    face: [0.335, 0.332],
    zoom: 3,
    source: '集英社',
    url: 'https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-893745-8',
  },
  妹は知っている: {
    image: '/images/covers/imouto-wa-shitteiru.jpg',
    spine: '#f08a3c',
    ink: '#2d2a33',
    face: [0.23, 0.593],
    zoom: 4,
    source: 'BOOK☆WALKER',
    url: 'https://bookwalker.jp/series/513981/list/',
  },
  没落令嬢の悪党賛歌: {
    image: '/images/covers/botsuraku-reijou.jpg',
    spine: '#3b1f2b',
    ink: '#e8c66a',
    face: [0.66, 0.24],
    zoom: 3,
    source: 'BOOK☆WALKER',
    url: 'https://bookwalker.jp/de6a461693-6f23-466a-8db4-99ade8de468f/',
  },
  寿司ガキ: {
    image: '/images/covers/sushi-gaki.jpg',
    spine: '#d63e31',
    ink: '#ffffff',
    face: [0.785, 0.597],
    zoom: 3.8,
    source: 'カドコミ（KADOKAWA）',
    url: 'https://comic-walker.com/detail/KC_000933_S',
  },
  ざこのみなさんお大事に: {
    image: '/images/covers/zako-no-minasan.jpg',
    spine: '#5fc9cf',
    ink: '#2d2a33',
    face: [0.53, 0.35],
    zoom: 2.2,
    source: 'BOOK☆WALKER',
    url: 'https://bookwalker.jp/de29709146-f9fd-4e74-979a-8c178c167f77/',
  },
};

/** The series.json thumbnail the bookshelf shows for `series`: only for a title without its own cover. */
export const shownSeriesThumbnail = (series: { title: string; thumbnail?: string | null }) =>
  mangaCovers[series.title]?.image ? null : series.thumbnail;
