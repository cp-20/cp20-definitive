export const featuredIds = ['dice-spec-v2', 'c-compiler', 'minna-no-monosashi'];
/** The history entries the home page shows first, each opening its dialog on /about. */
export const highlightIds = ['isucon2026', 'wsh2024', 'layerx'];
/**
 * One entry per line of the history on /about. `id` is its dialog's id, so /about#<id> opens it
 * (the home page links its achievements this way). `text` is the line under the title: what came
 * of it, with its figures as `**…**` (a name is written as it is, in the printed text: the ISUCON
 * team [object Object] has a no-break space, so it stays on one line). `detail` is what its dialog
 * says, from the linked write-ups and official pages; an entry with no detail and no links is not
 * clickable. `work` is the /works page of what was made there.
 */
export type Milestone = {
  id: string;
  kind: 'award' | 'intern' | 'school';
  year: string;
  grade: string;
  title: string;
  text: string;
  detail: string[];
  links: { label: string; url: string }[];
  work?: string;
  /** Still going on (shown as "<year>〜" where the title does not date it). */
  ongoing?: boolean;
  /** A speed-up for the strip above the history: what got faster, from what to what, and where. */
  speedup?: { what: string; from?: string; to: string; place: string };
};
export const milestones: Milestone[] = [
  {
    id: 'isucon2026',
    kind: 'award',
    year: '2026.10',
    grade: '大学4年',
    title: 'ISUCON2026 学生2位',
    text: 'pirosiki と2人のチーム [object\u00a0Object] で、最終 **211,213点**。',
    detail: [
      'チーム [object\u00a0Object] として pirosiki と2人で出場し、BeReal 風の SNS「ISUReal」を8時間かけて高速化した。複数の AI Agent を並列に動かすため、ベンチのロックやタスクボードなどの道具を事前に用意して臨み、最終 211,213点で学生2位になった。',
      '投稿画像の JPEG 検証は判定結果を変えずに最適化し、標準ライブラリを複製した検証器で、412KB の画像の検証を 27.6ms から 1.15ms（約24倍）にした。',
    ],
    links: [
      { label: 'ISUCON2026 に AI Agent と出て学生2位でした', url: 'https://blog.cp20.dev/posts/isucon2026/' },
    ],
    speedup: { what: '投稿画像の検証', from: '27.6ms', to: '1.15ms', place: 'ISUCON2026' },
  },
  {
    id: 'deploynow2026',
    kind: 'award',
    year: '2026.10',
    grade: '大学4年',
    title: 'デプロイナウコンテスト 月間賞',
    text: 'みんなのものさしが**9月の月間賞**に。',
    detail: [
      'GMOペパボの「デプロイナウコンテスト byGMOペパボ」は、ロリポップ！デプロイナウで公開した Web アプリ・Web サイトのコンテスト。9月から11月までは毎月、運営が選んだ作品に月間賞を贈る。',
      'みんなのものさしは、9月の月間賞の12作品の1つに選ばれた。運営のコメントは「『ちょっと』って何分？ 数字で答えると、みんなとのズレが見える。PCでもスマホでも、答える操作まで気持ちいい。」',
    ],
    links: [{ label: 'デプロイナウコンテスト byGMOペパボ', url: 'https://lolipop.jp/deploy-now/contest/' }],
    work: 'minna-no-monosashi',
  },
  {
    id: 'layerx',
    kind: 'intern',
    year: '2026.09',
    ongoing: true,
    grade: '大学4年',
    title: 'LayerX インターン',
    text: '社内の AI エージェント基盤 haro を開発。CI のチェックアウトを **65.9秒→17.5秒**に。',
    detail: [
      '2026年9月から約1ヶ月の短期インターンでバクラクの Enabling チームに入り、その後も継続している。社内の AI エージェント基盤 haro の v2 で、チャットから登録できるカスタムスキルと、PR の自動レビューやコンフリクト解消をする GitHub 連携をつくった。',
      'CI ではチェックアウトを 65.9 秒から 17.5 秒に縮め、フロントエンドのビルドとテストも Vitest の設定見直しと TypeScript 7 への移行で約2割速くした。',
    ],
    links: [
      { label: 'LayerX を1ヶ月楽しんできました！', url: 'https://blog.cp20.dev/posts/layerx-internship/' },
    ],
    speedup: { what: 'CI のチェックアウト', from: '65.9秒', to: '17.5秒', place: 'LayerX' },
  },
  {
    id: 'fixstars',
    kind: 'intern',
    year: '2026.03',
    grade: '大学3年',
    title: 'フィックスターズ インターン',
    text: 'oneDNN の int8 演算を RISC-V 向けに高速化し、行列積を**約114倍**に。',
    detail: [
      'オープンソースの DNN ライブラリ oneDNN で、RISC-V では fp32 より遅かった int8 の演算を、RISC-V のベクトル拡張（RVV）向けに高速化した。実機（Milk-V Jupiter）で測りながら、キャッシュブロッキングなどでハードウェアの限界近くまで詰めた。',
      '行列積は約114倍、畳み込みは約14.5倍（1x1 の畳み込みは約1450倍）速くなった。',
    ],
    links: [],
    speedup: { what: 'RISC-V の int8 行列積', to: '約114倍', place: 'フィックスターズ' },
  },
  {
    id: 'm3',
    kind: 'intern',
    year: '2025.08',
    grade: '大学3年',
    title: 'M3 エンジニアインターン',
    text: '請求画面の遅いクエリをキャッシュし、いちばん重い医院の応答を**約4秒→約35ミリ秒**に。',
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
    speedup: { what: '請求画面の応答', from: '約4秒', to: '約35ミリ秒', place: 'M3' },
  },
  {
    id: 'cyberagent',
    kind: 'intern',
    year: '2025.02',
    grade: '大学2年',
    title: 'CyberAgent CA Tech JOB',
    text: 'ABEMA の Web TV チームで約10日間。',
    detail: ['ABEMA の Web TV チームに配属され、約10日間働いた。Lint ルールの修正などに取り組んだ。'],
    links: [],
  },
  {
    id: 'mixi-bug-shooting',
    kind: 'award',
    year: '2024.12',
    grade: '大学2年',
    title: 'MIXI Bug Shooting Challenge 優勝',
    text: '当日組んだペアで出場し、**1位（MVP）**。',
    detail: [
      '1日のイベントに1人で申し込み、当日組んだペアで出た。架空のサービスに届いた問い合わせを BigQuery のログとコードから調べて、コードを直し、サポートへの回答と修正の PR を出す形式で、1位（MVP）になった。',
    ],
    links: [{ label: 'MIXI Bug Shooting Challenge で優勝しました', url: 'https://trap.jp/post/2228/' }],
  },
  {
    id: 'flatt-security',
    kind: 'intern',
    year: '2024.04',
    grade: '大学2年',
    title: 'Flatt Security インターン',
    text: 'Shisho Cloud の開発に、ソフトウェアエンジニアとして**1年半**。',
    detail: [
      'クラウドセキュリティ製品 Shisho Cloud のチームで、2024年4月から2025年9月まで学業と並行して働いた。ほかのインターン生がセキュリティ診断をするなか、1人だけソフトウェアエンジニアとして開発に入っていた。',
    ],
    links: [],
  },
  {
    id: 'wsh2024',
    kind: 'award',
    year: '2024.03',
    grade: '大学1年',
    title: 'Web Speed Hackathon 2024 優勝',
    text: '重い漫画サイトを2日間で速くし、**初出場で優勝**。',
    detail: [
      '重い Web アプリを2日間で速くする競技に初めて出た。題材は漫画サイトで、jQuery や重い依存の削除、画像の縮小と AVIF 化、SSR の修正、ReDoS になる正規表現の修正などをした。',
      '最終スコア 542.85 で5位だったが、上位のチームが E2E テストに通らず、繰り上がって優勝した。',
    ],
    links: [{ label: 'Web Speed Hackathon 2024に初出場して優勝しました', url: 'https://trap.jp/post/2170/' }],
  },
  {
    id: 'line',
    kind: 'intern',
    year: '2023.08',
    grade: '大学1年',
    title: 'LINE インターン',
    text: '4人チームでバックエンドと性能改善を担当し、**完成度賞とパフォーマンス賞**。',
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
    speedup: { what: '負荷試験', to: '約2,000 RPS', place: 'LINE' },
  },
  {
    id: 'sechack365',
    kind: 'school',
    year: '2023.05',
    grade: '大学1年',
    title: 'SecHack365 採択',
    text: '技術記事の未読消化を助ける ReadStack を、ブラウザ拡張とスマホアプリで開発。',
    detail: [
      'NICT の若手セキュリティイノベーター育成プログラム。開発駆動コースで、元の記事を読むだけで未読管理が半自動で進む ReadStack を、ブラウザ拡張とスマホアプリとしてつくった。',
      '2024年3月に修了し、2024年度はアシスタントとして関わった。',
    ],
    links: [{ label: '2023年度の成果物', url: 'https://sechack365.nict.go.jp/achievement/2023/#area_24dn' }],
    work: 'read-stack',
  },
  {
    id: 'titech',
    kind: 'school',
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
    id: 'imagine-cup',
    kind: 'award',
    year: '2022.03',
    grade: '高校2年',
    title: 'Imagine Cup アジア教育部門優勝',
    text: 'ブラウザで動く初心者向けのプログラミング言語 Laze を、高校の2人で出品。',
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
    id: 'jsec',
    kind: 'award',
    year: '2021.12',
    grade: '高校2年',
    title: 'JSEC 優秀賞',
    text: '多言語対応のコンパイラ言語 Laze と、その実行サイトの研究を2人で。',
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
/** The speed-ups in the strip on /about, newest first, each with the history entry it opens. */
export const speedups = milestones.flatMap((m) => (m.speedup ? [{ ...m.speedup, id: m.id }] : []));
export const editions = [
  { year: '2023', tech: 'Next.js', image: '2023-portfolio' },
  { year: '2024', tech: 'Qwik', image: '2024-portfolio' },
  { year: '2025', tech: 'SolidJS', image: '2025-portfolio' },
  { year: '2026', tech: 'Hono + xterm.js', image: null },
];
export { mangaCovers, shownSeriesThumbnail } from './manga-covers.ts';
