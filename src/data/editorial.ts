export const featuredIds = ['dice-spec-v2', 'c-compiler', 'minna-no-monosashi'];
/**
 * One entry per line of the history on /about. `detail` is what its dialog says, from the linked
 * write-ups and official pages; an entry with no detail and no links is not clickable.
 */
export type Milestone = {
  year: string;
  grade: string;
  title: string;
  text: string;
  detail: string[];
  links: { label: string; url: string }[];
};
export const milestones: Milestone[] = [
  {
    year: '2026.09',
    grade: '大学4年',
    title: 'LayerX インターン',
    text: 'バクラクの Enabling チーム。プロダクト横断で開発基盤を支える。',
    detail: [
      '約1ヶ月、バクラクの Enabling チームで働いた。社内の AI エージェント基盤 haro の v2 で、チャットから登録できるカスタムスキルと、PR の自動レビューやコンフリクト解消をする GitHub 連携をつくった。',
      'CI ではチェックアウトを 65.9 秒から 17.5 秒に縮め、フロントエンドのビルドとテストも Vitest の設定見直しと TypeScript 7 への移行で約2割速くした。',
    ],
    links: [
      { label: 'LayerX を1ヶ月楽しんできました！', url: 'https://blog.cp20.dev/posts/layerx-internship/' },
    ],
  },
  {
    year: '2026.03',
    grade: '大学3年',
    title: 'フィックスターズ インターン',
    text: '株式会社フィックスターズでのインターンシップ。',
    detail: [],
    links: [],
  },
  {
    year: '2025.09',
    grade: '大学3年',
    title: 'M3 エンジニアインターン',
    text: 'フロントエンド・バックエンド・インフラの開発。',
    detail: [
      'エムスリーのデジスマチームで2週間。請求画面の遅いクエリを EXPLAIN ANALYZE で調べて PostgreSQL の Materialized View にキャッシュし、いちばん重い医院で約4秒かかっていた応答を約35ミリ秒にした。',
      'ほかにログインの流れと並び順の改修（API の変更を含む）や、マイクロサービスごとの Redis を1つにまとめる移行に取り組んだ。',
    ],
    links: [
      {
        label: 'フロントエンドからインフラまで全部触ってきました！！！',
        url: 'https://www.m3tech.blog/entry/2025/09/26/170000',
      },
    ],
  },
  {
    year: '2024.12',
    grade: '大学2年',
    title: 'MIXI Bug Shooting Challenge 優勝',
    text: 'バグ修正を競うハッカソン。',
    detail: [
      '1日のイベントに1人で申し込み、当日組んだペアで出た。架空のサービスに届いた問い合わせを BigQuery のログとコードから調べて、コードを直し、サポートへの回答と修正の PR を出す形式で、1位（MVP）になった。',
    ],
    links: [{ label: 'MIXI Bug Shooting Challenge で優勝しました', url: 'https://trap.jp/post/2228/' }],
  },
  {
    year: '2024.04',
    grade: '大学2年',
    title: 'Flatt Security インターン',
    text: 'Shisho Cloud Team / Software Engineering（2024.04〜2025.09）',
    detail: ['クラウドセキュリティ製品 Shisho Cloud のチームで、ソフトウェアエンジニアとして働いた。'],
    links: [],
  },
  {
    year: '2024.03',
    grade: '大学1年',
    title: 'Web Speed Hackathon 2024 優勝',
    text: 'Webアプリケーションのパフォーマンス改善。',
    detail: [
      '重い Web アプリを2日間で速くする競技に初めて出た。題材は漫画サイトで、jQuery や重い依存の削除、画像の縮小と AVIF 化、SSR の修正、ReDoS になる正規表現の修正などをした。',
      '最終スコア 542.85 で5位だったが、上位のチームが E2E テストに通らず、繰り上がって優勝した。',
    ],
    links: [{ label: 'Web Speed Hackathon 2024に初出場して優勝しました', url: 'https://trap.jp/post/2170/' }],
  },
  {
    year: '2023.08',
    grade: '大学1年',
    title: 'LINE インターン',
    text: 'チームでのアプリケーション開発。',
    detail: [
      '京都で13日間のハッカソン形式のインターン。4人チームでクイックコマースの配達員向けアプリをつくり、バックエンドを Go（Gin・gorm）と Redis で担当した。',
      '2週目は性能改善を主導し、負荷試験で約2,000 RPS を出せるようにして、完成度賞とパフォーマンス賞をもらった。',
    ],
    links: [
      {
        label: 'LINEのインターンで好き勝手やって成長した話',
        url: 'https://zenn.dev/trap/articles/line-summer-intern-2023',
      },
    ],
  },
  {
    year: '2023.05',
    grade: '大学1年',
    title: 'SecHack365 採択',
    text: '技術記事の未読消化をサポートするReadStackを開発。',
    detail: [
      'NICT の若手セキュリティイノベーター育成プログラム。開発駆動コースで、元の記事を読むだけで未読管理が半自動で進む ReadStack を、ブラウザ拡張とスマホアプリとしてつくった。',
      '2024年3月に修了し、2024年度はアシスタントとして関わった。',
    ],
    links: [{ label: '2023年度の成果物', url: 'https://sechack365.nict.go.jp/achievement/2023/#area_24dn' }],
  },
  {
    year: '2023.04',
    grade: '大学1年',
    title: '東京工業大学 入学',
    text: '東京工業大学（現 東京科学大学）情報理工学院。',
    detail: [
      '一般選抜で情報理工学院に入った。2024年10月に東京医科歯科大学と統合して東京科学大学になり、いまは情報工学系に所属している。',
    ],
    links: [
      {
        label: '東京工業大学 情報理工学院 一般選抜 合格体験記',
        url: 'https://note.com/cp20/n/n3be2d294a6f3',
      },
    ],
  },
  {
    year: '2022.03',
    grade: '高校2年',
    title: 'Imagine Cup アジア教育部門優勝',
    text: 'Microsoft Imagine Cup 2022',
    detail: [
      'Microsoft の学生向け国際コンテスト。同じ高校の2人で Laze Project Team として、英語以外の言語でも書けて環境構築なしにブラウザで動く初心者向けのプログラミング言語 Laze を出し、アジアの教育部門で優勝した。',
    ],
    links: [
      {
        label: 'Microsoft の発表（アジアの部門優勝チーム）',
        url: 'https://news.microsoft.com/apac/2022/04/08/team-nana-shilpa-from-sri-lanka-crowned-asia-winner-for-microsofts-2022-imagine-cup-world-finals/',
      },
      {
        label: '高校生がImagine Cupで賞取ってきた体験記',
        url: 'https://speakerdeck.com/cp20/gao-xiao-sheng-gaimagine-cupdeshang-qu-tutekitati-yan-ji',
      },
    ],
  },
  {
    year: '2021.12',
    grade: '高校2年',
    title: 'JSEC 優秀賞',
    text: '第19回 高校生・高専生科学技術チャレンジ',
    detail: [
      '高校生・高専生の科学技術研究のコンテスト。「ブラウザ上で実行可能な多言語対応のコンパイラ言語 Laze と簡単に Laze を実行できるウェブサイトの開発」を2人で出した。',
      '英語が苦手だったり環境構築でつまずいたりしてプログラミングをやめてしまう人のために、何も入れずにブラウザで書き始められるようにした。',
    ],
    links: [
      { label: 'JSEC2021 受賞研究', url: 'https://manabu.asahi.com/jsec/2021/award/index.html' },
      {
        label: '自作プログラミング言語Lazeで超級積分を解いてみた話',
        url: 'https://qiita.com/cp20/items/65d473ecc1318544300a',
      },
    ],
  },
];
export const editions = [
  { year: '2023', tech: 'Next.js', image: '2023-portfolio' },
  { year: '2024', tech: 'Qwik', image: '2024-portfolio' },
  { year: '2025', tech: 'SolidJS', image: '2025-portfolio' },
  { year: '2026', tech: 'Hono + xterm.js', image: null },
];
export { mangaCovers, shownSeriesThumbnail } from './manga-covers.ts';
