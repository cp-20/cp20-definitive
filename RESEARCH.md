# Research & design decisions

調査日：2026-09-27

## 歴代のcp20.dev

| 出典 | 確認した内容 | 引き継ぎ方 |
| --- | --- | --- |
| https://2023.cp20.dev | Next.jsによる情報量のある初期ポートフォリオ | プロフィール・作品アーカイブの網羅性 |
| https://2024.cp20.dev | Qwik、作品・経歴・受賞歴・資格 | 受賞歴と制作の事実。過去の「now」を現在と誤認しない |
| https://2025.cp20.dev | SolidJS、趣味の選書と音楽、作品画像 | 個人サイトらしさ。ブラウザでは一時的にClient Exceptionのため公開ソースを照合 |
| https://2026.cp20.dev | ターミナル、curl、公開JSON、最新所属・選書 | 現在のプロフィール、全17作品と作者のコメント |

ソース： [2024](https://github.com/cp-20/2024.cp20.dev)、[2025](https://github.com/cp-20/2025.cp20.dev)、[2026](https://github.com/cp-20/2026.cp20.dev)。

2026版の `/articles?raw=true` は調査時にHTTP 500。依存を引き継がず、配信元単位の取得と失敗時の保持を実装。プロフィール・作品・曲・漫画の公開JSONは取得成功。

## デザインの軸

個人のワークステーション。薄いグレーグリーンの筐体、作品を切り替える画面、索引としての記事、画像付きの音楽・漫画の棚を一つの操作系にまとめた。大きなキャッチコピーや比喩を使わず、作品名・所属・制作内容を優先する。モバイルは下部ナビゲーションと縦組みの画面へ変形する。

新たに調べたコンセプトの参考：

| サイト | 確認した要素と採用した考え方 |
| --- | --- |
| [Henry Heffernan](https://henryheffernan.com/) / [本人のソース](https://github.com/henryjeff/portfolio-website) | PCとその中のOSで統一した世界。3D画面は今回の自動ブラウザで完全表示されず、公開ソース・説明で構造を確認。全面3Dは採用せず、操作盤という一貫した枠組みを参考にした |
| [Poolsuite](https://poolsuite.net/) | 音楽とアプリの操作部が一体になった画面。実画面を確認 |
| [yui540](https://yui540.com/) | UI単位のCSSモーション。実画面を確認し、クリックに反応する動きの参考にした |
| [Lynn Fisher](https://lynnandtonic.com/) | 画面幅で見せ方が変わるポートフォリオ。実画面を確認 |
| [Bruno Simon](https://bruno-simon.com/) | 車を操作する世界と、訪問者のWhispers。共有の痕跡というアイデアをページ上のスタンプに応用 |
| [Maggie Appleton](https://maggieappleton.com/) | 継続して増える個人の活動とアーカイブ |
| [Robin Sloan](https://www.robinsloan.com/) | 個人の作品・文章を独自の見せ方でまとめるサイト |

参考サイトのアセットやコードは移植していない。CSSの作品切替・ボタン・サムネイルの反応を独自に実装。

## 参考にした13サイト

| サイト | 観察・採用する原則 |
| --- | --- |
| [Rauno Freiberg](https://rauno.me/) | 一貫した操作感、細部の完成度 |
| [Paco Coursey](https://paco.me/) | 文字中心の情報設計、静かな余白 |
| [Emil Kowalski](https://emilkowal.ski/) | 目的がある動き、即座の操作フィードバック |
| [Anthony Fu](https://antfu.me/) | OSS・記事・趣味がつながる個人サイト |
| [Lynn Fisher](https://lynnandtonic.com/) | 年ごとの実験とレスポンシブ表現 |
| [Jhey Tompkins](https://www.jhey.dev/) | Web標準を触れる実験として見せる |
| [Hakim El Hattab](https://hakim.se/) | 小さな技術実験の入口 |
| [Josh W. Comeau](https://www.joshwcomeau.com/) | 触って理解できる小さなデモ |
| [Brittany Chiang](https://brittanychiang.com/) | 経歴と仕事の読みやすさ、アクセシビリティ |
| [Nic Chan](https://www.nicchan.me/) | 手触りのある個性とWebのアクセシビリティ |
| [Bruno Simon](https://bruno-simon.com/) | 個人の世界に入る楽しさ。全面3Dを移植せず小さな遊びとして採用 |
| [Brad Woods](https://garden.bradwoods.io/) | 知識と実験が積み重なるデジタルガーデン |
| [The Pudding](https://pudding.cool/) | スクロールに沿って変化する編集のリズム |

レイアウト・画像・コードの複製はしていない。本人の作品画像とアイコンを除き、参考サイトからアセットを取り込んでいない。

## 技術一次資料

- [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare Static Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [Solid 2 RC](https://github.com/solidjs/solid/discussions/2995)
- [公式 Vite プラグイン](https://github.com/solidjs/solid-vite-plugin)
- [Solid 2 移行資料](https://github.com/solidjs/solid/tree/next/documentation/solid-2.0)
- [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [MDN View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [MDN animation-timeline](https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline)

## Content boundaries

古いサイトの在籍中・年次・ユーザー数は現在の事実として使わない。経歴は年月とイベントに変換。プロフィールは2026版の公開所属を明記。作品詳細には制作当時の記録であることを表示。音楽は2026版のおすすめ一覧であり、再生履歴ではない。サムネイルはYouTubeおよび漫画の公式掲載元が提供する画像を事前保存して配信し、制作者・著者・画像出典とリンクを表示。音声の自動再生は行わない。

## 追加した作品と出典

- [みんなのものさし](https://minna-no-monosashi.lolipop-now.app/)：ユーザー指定のURL。公開画面と指定リポジトリのREADMEを確認。紹介画像には公開サイトのOG画像を使用。privateリポジトリの公開設定は変更していない。
- 曲：`https://2026.cp20.dev/featured-tracks?raw=true`、動画のサムネイルは `i.ytimg.com`。
- 漫画：`https://2026.cp20.dev/featured-series?raw=true`。webアクション、ヤンジャン！、ヤンマガWeb、ニコニコ漫画、カドコミの各作品ページの `og:image` を確認。
- 経歴の年月：2024版 `src/personal-data/awards.ts` など。2023年4月の大学入学から、各イベント時点の学年を対応付けた。

追加の技術一次資料：

- [Ghost Admin API / JWT / pagination](https://docs.ghost.org/admin-api)
- [Workers selective routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
- [D1 Database / transactional batch](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Lucide icon node data](https://lucide.dev/guide/packages/lucide)

## 情報設計と参加体験

名前・紹介・所属をまとめ、経歴と関連作品を近接させた。趣味は大きな区切りで切り替え、作品・記事のタイトルを強く、日付・出典・技術情報は小さく抑える。共有ボードを廃止し、全ページの好きな場所に置けるスタンプへ変更。本文のアンカーに相対位置を結び、スマホとPCで同じ対象に追従させる。

日常的な操作の位置を固定し、作品切替のフェード、タブの線、アイコン、画像、パレットの開閉、スタンプの押印に動きを加える。日本語本文と欧文・数字用フォントは分離し、アプリのアイコンとOG画像の色・比率を保持する。

## Firebaseと画像の一次資料

- [Realtime Database: Webでの読み書き](https://firebase.google.com/docs/database/web/read-and-write)
- [複数DBの作成](https://firebase.google.com/docs/database/usage/sharding)
- [Google ログイン（Web）](https://firebase.google.com/docs/auth/web/google-signin)
- [Gravatar: SHA-256 ハッシュでのアバター取得](https://docs.gravatar.com/general/hash/)
- [Realtime Database security rules](https://firebase.google.com/docs/database/security)
- [ルールの条件とクエリ](https://firebase.google.com/docs/database/security/rules-conditions)
- [Twemoji / graphics license](https://github.com/jdecked/twemoji)
- [Open Graph protocol](https://ogp.me/)

D1・ピクセルAPIは削除し、Cloudflareは静的配信のみ。公開記事54件・作品13件の元OGを取得済み。画像の実寸を読み取り、比率をメタデータに保存する。OGのない作品は画像を作り込まず、テキストの代替を表示する。

- [Firebase REST streaming](https://firebase.google.com/docs/database/rest/retrieve-data#section-rest-streaming)
- [REST conditional requests / ETags](https://firebase.google.com/docs/database/rest/save-data#section-conditional-requests)


## ページ遷移と写真の扱い

ABOUT MEの写真を基準に、作品画像には白い縁とテープ、記事には16:9の小さな写真枠を用いた。本文の基準線は固定し、装飾の角度は画像だけに限定。元画像の色・アイコンは変更しない。紹介コピーは事実に絞り、サイト側で追加した比喩的な文章は削除した。

内部ページはHistory APIとSolidの状態で切り替え、ヘッダーを再生成しない。履歴のスクロール復元、ページタイトル・canonical更新、見出しのフォーカス、reduced-motionと通常リンクの挙動を維持する。スタンプは選択モードを開くとすぐ配置でき、通信待ちでも即時表示・取り消しができる。

画像は収集時にダウンロードし、内容ハッシュ付きのStatic Assetsとして配信する。画像の新規取得・更新に失敗しても前回ファイルを保持。閲覧時の外部画像リクエストは不要になった。

- [MDN History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API)
- [MDN Same-document view transitions](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using#basic_spa_view_transition)

## スタンプ帳への再設計（2026-09-29）

一般的なカード並びのUIから離れ、本人の歴代サイトの要素を引き継いで独自の見た目にした。

| 出典 | 引き継いだ要素 |
| --- | --- |
| 2024版（ソース） | エメラルドの名前、「しーぴーくんのお手製サイト」の手作り感、趣味の並び |
| 2025版（ソース） | ゆるい雰囲気、アニメ調の背景イラスト、見出しの点線下線、ポップインの動き |
| 2026版（ソース） | 1つの道具（ターミナル）でサイト全体を表す一貫した世界観 |
| definitive | 訪問者のスタンプ、🍀、アイコン |

テーマは「スタンプ帳」。訪問者がスタンプを押す機能を中心に据え、ページ全体をルーズリーフ、ナビをインデックスタブ、主な作品と経歴をスタンプラリー、歴代サイトを切手として表現した。
外部サイト（yui540、Lynn Fisher、Poolsuite など）は今回の実行環境のネットワーク制限で閲覧できなかったため、前回の調査記録を参照した。

### 画像と細部もスタンプ帳に統一（2026-09-29）

紙の世界観に合わないためダークモードを廃止。画像はすべてCSS maskの目打ちを持つ切手とし、作品（制作開始日）と記事（公開日）には日付入りの消印を重ねた。アイコンは丸い目打ちの切手、訪問者のスタンプは絵柄ごとの色の二重枠でゴム印の押し跡にした。訪れたセクションのタブに「済」を押すスタンプラリーを追加。
参考サイトの閲覧は、今回の環境ではブラウザのTLS検証（プロキシ証明書）とWebFetchのドメイン制限により行えなかった。
