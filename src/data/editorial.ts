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
  /** Featured award stamp on /about. */
  awardCard?: { event: string; result: string };
  /** Internship summary card on /about. */
  internCard?: { company: string; period: string; summary: string };
};
export const milestones: Milestone[] = [
  {
    id: 'isucon2026',
    kind: 'award',
    year: '2026.10',
    grade: '大学4年',
    title: 'ISUCON2026 学生2位',
    text: 'Webアプリ高速化競技に2人で出場し、AIエージェントを並列活用して最終 **211,213点**。',
    detail: [
      'Webサービスの負荷耐性や応答速度を8時間で競う ISUCON に、pirosiki と2人チーム [object\u00a0Object] として出場した。お題の BeReal 風 SNS「ISUReal」を高速化し、最終スコア 211,213点で学生2位になった。',
      '当日は複数の AI エージェントを並列に動かせるよう、ベンチマーク実行の排他制御や共有タスクボードを事前に自作して投入。アプリ・DB のボトルネック解消を並行で進めた。',
    ],
    links: [
      { label: 'ISUCON2026 に AI Agent と出て学生2位でした', url: 'https://blog.cp20.dev/posts/isucon2026/' },
    ],
    awardCard: { event: 'ISUCON2026', result: '学生2位' },
  },
  {
    id: 'deploynow2026',
    kind: 'award',
    year: '2026.10',
    grade: '大学4年',
    title: 'デプロイナウコンテスト 月間賞',
    text: 'みんなの感覚を数字で比べるWebアプリ「みんなのものさし」が**9月の月間賞**を受賞。',
    detail: [
      'GMOペパボが主催する Web アプリコンテスト「デプロイナウコンテスト byGMOペパボ」で、自作アプリ「みんなのものさし」が9月の月間賞に選ばれた。',
      '「『ちょっと』って何分？」のような曖昧な感覚を数字で答えて分布を比べられるアプリで、運営からは「数字で答えると、みんなとのズレが見える。PCでもスマホでも、答える操作まで気持ちいい。」と講評をもらった。',
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
    text: 'バクラクの開発基盤チームで、社内AIエージェント開発や CI 高速化 (チェックアウト **65.9秒→17.5秒**) を担当。',
    detail: [
      '2026年9月から1ヶ月の短期インターンでバクラク事業部の開発基盤 (Enabling) チームに参加し、その後も継続して働いている。',
      '社内向け AI エージェント基盤「haro」の開発に参加し、チャットから手順や観点を登録・共有できるカスタムスキル機能や、GitHub の PR から自動レビュー・コンフリクト解消を動かせる連携、UI・UX の改善などを実装した。',
      'あわせて開発体験の改善として、CI のコード取得時間を 65.9秒から 17.5秒へ短縮。Vitest の設定見直しや TypeScript 7 への移行で、フロントエンドのビルド・テストも約2割速くした。',
    ],
    links: [
      { label: 'LayerX を1ヶ月楽しんできました！', url: 'https://blog.cp20.dev/posts/layerx-internship/' },
    ],
    internCard: {
      company: 'LayerX',
      period: '2026.09〜',
      summary: 'バクラク開発基盤・社内AIエージェントとCI高速化',
    },
  },
  {
    id: 'fixstars',
    kind: 'intern',
    year: '2026.03',
    grade: '大学3年',
    title: 'フィックスターズ インターン',
    text: '深層学習ライブラリ oneDNN の RISC-V 向け推論処理を高速化し、行列積を**約114倍**に改善。',
    detail: [
      'オープンソースの深層学習向け演算ライブラリ oneDNN で、RISC-V CPU 上の量子化 (int8) 演算を高速化した。本来は省メモリ・高速なはずの int8 処理が通常精度 (fp32) より遅い課題に対し、CPU のベクトル命令 (RVV) を使う実装へ書き換えた。',
      '実機 (Milk-V Jupiter) で計測しながらメモリアクセス効率を詰め (キャッシュブロッキングなど)、最終的に行列積を約114倍、畳み込みを約14.5倍 (1×1 畳み込みは約1,450倍) まで高速化した。',
    ],
    links: [],
    internCard: {
      company: 'フィックスターズ',
      period: '2026.03',
      summary: '深層学習ライブラリ oneDNN の RISC-V 向け高速化',
    },
  },
  {
    id: 'mixi-git-challenge',
    kind: 'award',
    year: '2025.08',
    grade: '大学3年',
    title: 'MIXI Git Challenge #15 2位',
    text: 'Git の操作力やトラブル対応力を競う1日イベントにペアで出場し、**2位**に入賞。',
    detail: [
      'MIXI グループのエンジニアが出題する Git リポジトリ上の課題 (issue) を、2人1組のチームで制限時間内に解決して得点を競う1日の競技イベント。',
      '2025年8月30日に渋谷の MIXI 本社で開かれた #15 に出場し、2位に入賞した。',
    ],
    links: [],
  },
  {
    id: 'm3',
    kind: 'intern',
    year: '2025.08',
    grade: '大学3年',
    title: 'M3 エンジニアインターン',
    text: 'クリニック向けサービスの請求画面を高速化し、最も重い医院の応答を**約4秒→約35ms**に短縮。',
    detail: [
      'エムスリーの医療機関向けサービス「デジスマ診療」のチームに2週間参加した。',
      '請求画面の表示が遅い原因を DB の実行計画 (EXPLAIN ANALYZE) から特定し、PostgreSQL の Materialized View で集計結果を事前キャッシュする構成に変更。最もデータ量の多い医院で約4秒かかっていた応答を約35msまで縮めた。',
      'そのほか、API の変更を伴うログイン導線・一覧の並び順改修や、複数サービスに分かれていた Redis の統合移行も担当した。',
    ],
    links: [
      {
        label: 'フロントエンドからインフラまで全部触ってきました！！！',
        url: 'https://www.m3tech.blog/entry/2025/09/26/170000',
      },
    ],
    internCard: { company: 'M3', period: '2025.08', summary: 'デジスマ診療・請求画面の高速化と Redis 統合' },
  },
  {
    id: 'cyberagent',
    kind: 'intern',
    year: '2025.02',
    grade: '大学2年',
    title: 'CyberAgent CA Tech JOB',
    text: 'ABEMA の Web TV チームで、約10日間の就業型インターンに参加し既存画面の改善などを担当。',
    detail: [
      'ABEMA のテレビ・Web 向け開発チーム (Web TV チーム) に配属され、約10日間の実務に参加した。既存画面の改善や機能追加、コード品質を保つ静的解析 (Lint) ルールの修正などに取り組んだ。',
    ],
    links: [],
    internCard: {
      company: 'CyberAgent',
      period: '2025.02',
      summary: 'ABEMA Web TV チーム・既存画面の改善など',
    },
  },
  {
    id: 'mixi-bug-shooting',
    kind: 'award',
    year: '2024.12',
    grade: '大学2年',
    title: 'MIXI Bug Shooting Challenge 優勝',
    text: 'サービスの障害調査とバグ修正を競う1日イベントにペアで出場し、**1位 (MVP)** を獲得。',
    detail: [
      '架空の Web サービスに届いたユーザー問い合わせをもとに、原因調査から修正までを制限時間内で競う1日イベント。個人応募で当日組んだペアとして出場した。',
      'BigQuery のアクセスログやアプリコードから不具合の原因を特定し、サポート向けの調査報告と修正 PR を提出する形式で、1位 (MVP) を獲得した。',
    ],
    links: [{ label: 'MIXI Bug Shooting Challenge で優勝しました', url: 'https://trap.jp/post/2228/' }],
    awardCard: { event: 'MIXI Bug Shooting Challenge', result: '優勝・MVP' },
  },
  {
    id: 'flatt-security',
    kind: 'intern',
    year: '2024.04',
    grade: '大学2年',
    title: 'Flatt Security インターン',
    text: 'クラウドセキュリティ製品 Shisho Cloud の開発に**1年半**携わり、Azure 連携などを実装。',
    detail: [
      'クラウド環境のセキュリティ対策を支援する製品「Shisho Cloud」の開発チームに、2024年4月から2025年9月までの1年半、ソフトウェアエンジニアとして学業と並行して参加した。',
      '最も大きなタスクとして、OIDC フェデレーションを用いた認可基盤による Azure 連携 (Azure サポート) を実装。そのほか、デザインシステムの導入などプロダクト全体の基盤整備にも携わった。',
    ],
    links: [],
    internCard: {
      company: 'Flatt Security',
      period: '2024.04〜2025.09',
      summary: 'Shisho Cloud の Azure 連携・プロダクト開発',
    },
  },
  {
    id: 'wsh2024',
    kind: 'award',
    year: '2024.03',
    grade: '大学1年',
    title: 'Web Speed Hackathon 2024 優勝',
    text: '意図的に重く作られたWebアプリ (漫画サイト) を2日間で高速化する競技に**初出場で優勝**。',
    detail: [
      '極端に遅い Web アプリを2日間でどこまで軽くできるか競う大会に初出場した。題材は電子漫画サイトで、不要なライブラリの削除、画像の軽量化 (縮小・AVIF 変換)、サーバー側レンダリング (SSR) の不具合修正、処理が極端に重くなる正規表現 (ReDoS) の修正などを行った。',
      '計測スコアは 542.85 で全体5位だったが、表示崩れや機能壊れを検証する E2E テストを確実に通したことで繰り上がり優勝となった。',
    ],
    links: [{ label: 'Web Speed Hackathon 2024に初出場して優勝しました', url: 'https://trap.jp/post/2170/' }],
    awardCard: { event: 'Web Speed Hackathon 2024', result: '優勝' },
  },
  {
    id: 'line',
    kind: 'intern',
    year: '2023.08',
    grade: '大学1年',
    title: 'LINE インターン',
    text: 'ハッカソン型インターンで配達員アプリのバックエンドと負荷対策を担当し、**完成度賞・パフォーマンス賞**を受賞。',
    detail: [
      '京都で開催された13日間のハッカソン形式インターン。4人チームで即配サービスの配達員向けアプリを開発し、Go (Gin・gorm) と Redis を使ったバックエンドを担当した。',
      '2週目には性能改善を主導して、負荷試験で毎秒約2,000リクエスト (約2,000 RPS) をさばける状態まで引き上げ、完成度賞とパフォーマンス賞の2冠を受賞した。',
    ],
    links: [
      {
        label: 'LINEのインターンで好き勝手やって成長した話',
        url: 'https://zenn.dev/trap/articles/line-summer-intern-2023',
      },
    ],
    internCard: {
      company: 'LINE',
      period: '2023.08',
      summary: '配達員アプリ開発・完成度賞 / パフォーマンス賞',
    },
  },
  {
    id: 'sechack365',
    kind: 'school',
    year: '2023.05',
    grade: '大学1年',
    title: 'SecHack365 採択',
    text: 'NICTの若手育成プログラムに参加し、技術記事の積読を消化するアプリ「ReadStack」を開発。',
    detail: [
      '情報通信研究機構 (NICT) が主催する1年間の若手セキュリティイノベーター育成プログラム。ものづくりを通じて学ぶ開発駆動コースに採択された。',
      '「あとで読む」記事が溜まり続ける課題を解決するため、普段どおり記事を読むだけで既読管理が半自動で進む「ReadStack」をブラウザ拡張とスマホアプリで開発した。2024年3月に修了し、翌年度はアシスタントとして運営に関わった。',
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
    text: '東京工業大学 (現・東京科学大学) 情報理工学院に入学。',
    detail: [
      '総合型選抜には不合格となったものの、一般選抜で東京工業大学 情報理工学院に入学した。2024年10月に東京医科歯科大学との統合で東京科学大学となり、現在は情報工学系で学んでいる。',
    ],
    links: [
      {
        label: '東京工業大学 情報理工学院 一般選抜 合格体験記',
        url: 'https://note.com/cp20/n/n3be2d294a6f3',
      },
      {
        label: '東京工業大学 情報理工学院 総合型選抜 ”不”合格体験記',
        url: 'https://note.com/cp20/n/n84d2de414f5e',
      },
    ],
  },
  {
    id: 'imagine-cup',
    kind: 'award',
    year: '2022.03',
    grade: '高校2年',
    title: 'Imagine Cup アジア教育部門優勝',
    text: 'Microsoft の学生向け国際大会に、母語で書けてブラウザで動く自作言語「Laze」を2人で出品し優勝。',
    detail: [
      'Microsoft が主催する学生向けの国際技術コンテスト。同じ高校の同級生と2人 (Laze Project Team) で出場し、アジアの教育部門で優勝した。',
      '英語の壁や環境構築の難しさで挫折しがちな初心者向けに、日本語などの母語で書けてブラウザだけで動かせるプログラミング言語「Laze」を開発して出品した。',
    ],
    links: [
      {
        label: 'Microsoft の発表 (アジアの部門優勝チーム)',
        url: 'https://news.microsoft.com/apac/2022/04/08/team-nana-shilpa-from-sri-lanka-crowned-asia-winner-for-microsofts-2022-imagine-cup-world-finals/',
      },
      {
        label: '高校生がImagine Cupで賞取ってきた体験記',
        url: 'https://speakerdeck.com/cp20/gao-xiao-sheng-gaimagine-cupdeshang-qu-tutekitati-yan-ji',
      },
    ],
    awardCard: { event: 'Imagine Cup', result: 'アジア教育部門優勝' },
  },
  {
    id: 'jsec',
    kind: 'award',
    year: '2021.12',
    grade: '高校2年',
    title: 'JSEC 優秀賞',
    text: '高校生・高専生の科学技術コンテストで、多言語対応の自作言語「Laze」とWeb実行環境の研究が受賞。',
    detail: [
      '朝日新聞社などが主催する高校生・高専生向けの科学技術研究コンテスト。同級生と2人で「ブラウザ上で実行可能な多言語対応のコンパイラ言語 Laze と簡単に Laze を実行できるウェブサイトの開発」を応募し、優秀賞を受けた。',
      '英語が苦手だったり環境構築でつまずいたりしてプログラミングを諦めてしまう人のために、ソフトをインストールせずブラウザだけですぐ書き始められる仕組みを研究・制作した。',
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
/** The featured awards on /about, newest first, each with the history entry it opens. */
export const awardCards = /* @__PURE__ */ milestones.flatMap((m) =>
  m.awardCard ? [{ ...m.awardCard, id: m.id, year: m.year }] : [],
);
/** The internships on /about, newest first, each with the history entry it opens. */
export const internCards = /* @__PURE__ */ milestones.flatMap((m) =>
  m.internCard ? [{ ...m.internCard, id: m.id, ongoing: m.ongoing }] : [],
);
export const editions = [
  { year: '2023', tech: 'Next.js', image: '2023-portfolio' },
  { year: '2024', tech: 'Qwik', image: '2024-portfolio' },
  { year: '2025', tech: 'SolidJS', image: '2025-portfolio' },
  { year: '2026', tech: 'Hono + xterm.js', image: null },
];
export { mangaCovers, shownSeriesThumbnail } from './manga-covers.ts';
