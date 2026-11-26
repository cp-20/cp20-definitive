// Volume 1 covers of the featured manga, saved under public/images/covers.
// The series list itself is series.json; a title without a cover falls back to its thumbnail.
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
    source: 'webアクション (双葉社)',
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
  寿司ガキ: {
    image: '/images/covers/sushi-gaki.jpg',
    spine: '#d63e31',
    ink: '#ffffff',
    face: [0.785, 0.597],
    zoom: 3.8,
    source: 'カドコミ (KADOKAWA)',
    url: 'https://comic-walker.com/detail/KC_000933_S',
  },
  今朝も揺られてます: {
    image: '/images/covers/kesamo-yuraretemasu.jpg',
    spine: '#5a3d8c',
    ink: '#ffffff',
    face: [0.31, 0.285],
    zoom: 3,
    source: 'BOOK☆WALKER',
    url: 'https://bookwalker.jp/de1843e290-4140-4fec-8556-1ef81fe81308/',
  },
  'ドリーム☆ジャンボ☆ガール': {
    image: '/images/covers/dream-jumbo-girl.jpg',
    spine: '#bfe3c8',
    ink: '#2d2a33',
    face: [0.42, 0.36],
    zoom: 3.2,
    source: '講談社',
    url: 'https://www.kodansha.co.jp/comic/products/0000417019',
  },
  'なーんもうまくいかん！': {
    image: '/images/covers/naanmo-umaku-ikan.jpg',
    spine: '#a8c4e8',
    ink: '#2d2a33',
    face: [0.46, 0.33],
    zoom: 4.4,
    source: 'BOOK☆WALKER',
    url: 'https://bookwalker.jp/de8c4d0ecd-f357-438c-8d72-d4917d9974f4/',
  },
  '#ギャルとギャルの百合': {
    image: '/images/covers/gal-to-gal-no-yuri.jpg',
    spine: '#f7c6dc',
    ink: '#2d2a33',
    face: [0.48, 0.37],
    zoom: 2.2,
    source: '小学館',
    url: 'https://www.shogakukan.co.jp/books/09854389',
  },
  極悪令嬢の勘違い救国記: {
    image: '/images/covers/gokuaku-reijou.jpg',
    spine: '#4a3566',
    ink: '#ffffff',
    face: [0.61, 0.31],
    zoom: 3.2,
    source: '主婦と生活社',
    url: 'https://www.shufu.co.jp/bookmook/detail/9784391165210/',
  },
};

/** The series.json thumbnail the bookshelf shows for `series`: only for a title without its own cover. */
export const shownSeriesThumbnail = (series: { title: string; thumbnail?: string | null }) =>
  mangaCovers[series.title]?.image ? null : series.thumbnail;
