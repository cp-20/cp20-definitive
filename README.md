# cp20.dev — definitive edition

「個人のワークステーション」をモチーフにした、Cloudflare Workers向けのポートフォリオ。SolidJS 2.0.0-rc.10 のコンポーネントから全ページを静的HTMLに生成し、任意の場所にスタンプを残せるFirebase Realtime Databaseを組み合わせています。

## 開発

Node.js 24以上。

```sh
npm ci
npm run build
npm run dev:worker
```

`http://localhost:8787` はCloudflare Static Assetsの本番相当プレビュー。`npm run dev` で `http://localhost:4321` の編集用サーバーを起動できます。スタンプは開発中も専用Firebase DBへ接続し、閲覧者間で共有されます。テスト用に置いたスタンプは取り消してください。

```sh
npm run sync   # 記事・GitHub・おすすめ曲/漫画・サムネイルを取得
npm test       # Ghost公開範囲、データ保持、OG解析、画像形式、スタンプ即時反映
npm run cache:images # 画像キャッシュだけ更新（通常はsyncが実行）
npm run check  # Solidの型検査
npm run build
```

初期データを同梱しているため、Ghostキーなしでもビルドできます。キーがないとtraPの取得状態は「前回のデータを表示」になります。

## 本番公開の初期設定

**Firebase専用DBとセキュリティルールは公開済みです。GitHub Actionsで定期収集します。CloudflareのSecretsが未設定の場合は公開だけをスキップし、収集・必要なビルド・データの保存を実行します。**

1. このフォルダをGitHubリポジトリの `main` に配置。
2. GitHub Actions Secretsに `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`（対象アカウントのWorkers Scripts編集権限）、`TRAP_GHOST_ADMIN_KEY` を登録。
3. Actionsにスナップショットを書き戻す権限を許可。ブランチ保護を使う場合も更新経路を確保。
4. **Refresh content and deploy** を実行。静的ビルド→デプロイ→成功データのコミットを実行します。
5. workers.devで確認後、CloudflareのCustom Domainsで `cp20.dev` を接続。

ドメイン・既存本番サイト・みんなのものさしリポジトリの公開設定は変更していません。canonical / sitemap / robots / RSSは本番予定の `https://cp20.dev` を指します。

### Ghost Admin API

ローカルで収集する場合は `.env.example` を `.env.sync` にコピーし、キーを設定して `npm run sync`。チャットやソースにキーを書かないでください。`.env.sync` はWranglerが自動ロードするファイル名を避けており、収集用Nodeプロセスだけが読みます。`.env*` はGitと配布ZIPから除外します（空の `.env.example` のみ同梱）。

- 接続先：`https://blog-admin.trap.jp/ghost/api/admin/posts/`
- HS256 JWT、有効期限5分、`aud: /admin/`。キーは収集時だけ使用し、Workerやクライアントには渡しません。
- `authors.slug:cp20+status:published+visibility:public`、`include=authors`、100件ずつ全ページ取得。
- レスポンスでも著者・公開状態・公開範囲を再確認し、タイトル・URL・公開日・出典だけを保存。記事本文、著者メールなどは保存しません。
- 正常な全件取得後はtraP記事を置き換え、削除・非公開の記事を一覧から除去。途中失敗・認証失敗では以前の公開スナップショットを維持。
- キーを設定して実接続した結果、管理APIがGhostに到達する前にtraP SSOへHTTP 307で転送されることを確認（2026-09-27）。2026版と同じ形式でも同様です。キーの有効性・全件取得はまだ確認できず、正式なバッチ用API経路またはSSOサービス認証が必要です。認証先への転送には追従せずキーを別ホストへ送らない構成です。JWT、ページネーション、公開範囲、削除反映、障害時保持はテストで確認。

### 自動更新

6時間ごとにGitHub Actionsで取得します。普段は元のサービスへ記事を投稿するだけです。

| 対象 | 取得元 / 動作 |
| --- | --- |
| Zenn・Qiita | 公開APIを全ページ取得 |
| note・sizu.me | RSS。配信範囲から外れた過去記事を保持 |
| traP | Ghost Admin API。RSSは使用しない |
| 公開コード | GitHub API。fork・archived以外の最近更新したリポジトリ |
| 好きな曲・漫画 | 2026版の公開 `featured-tracks` / `featured-series` データ |
| 漫画のサムネイル | 公式掲載ページの `og:image`。失敗時は前回URLを保持 |
| 作品・記事のOG画像と作品アイコン | 元の公開ページから取得し、画像本体をダウンロード。実画像の寸法を記録。正常取得は週1回、新規・失敗分は6時間ごとに再取得 |
| YouTubeのサムネイル | おすすめ曲の動画IDに対応したYouTube画像 |

ネットワークの部分障害では前回データを保持し、全記事ソース失敗時は処理を失敗させます。公開データに差分がある場合だけ再デプロイ。チェック日時はコミットして、長期無活動でのActionsスケジュール停止を避けます。スケジュールの遅延・外部サービス障害まで保証するものではありません。

自動取得できない経歴や説明を推測して更新することはしません。学年は各経歴の発生時点の値を保存しています。曲・漫画の「好き」は2026版に本人が選定したものです。視聴履歴を推測しません。

## 内容の構成

- トップの3作品：ダイススペック、自作Cコンパイラ、みんなのものさし。
- 残りは作品一覧から閲覧。歴代サイトはトップ末尾に年代別リンク。
- 作品：`src/data/works.json`。新作の説明はユーザー指定の公開サイトとREADMEを確認。
- 経歴：`src/data/editorial.ts`。月と学年を併記。資格は非掲載。
- 手動追加・除外・上書き：`src/data/manual.json`。
- スナップショット：`src/data/generated.json`。
- OG画像・アイコン・寸法：`src/data/previews.json`。全54記事と18作品中13作品のOGを収録。OGがない作品にはテキストの代替を表示し、別の画像を捏造しません。
- 音楽・漫画：`tracks.json` / `series.json`（定期処理が更新）。選定は2026版の元データで変更できます。
- 画像：`public/images/`、自動取得分は `public/media/`。92個の元URLを89ファイルに集約。`src/data/image-cache.json` が元URLとローカルファイルを対応付けます。漫画・YouTubeも事前保存し、ページに出典と著者・制作者を掲載。

画像は収集時に形式と15MB上限を検査し、内容ハッシュをファイル名に使用。新規取得に失敗した場合は前回のファイルを維持します。画像を含めてActionsからコミットし、ブラウザは同一サイトのStatic Assetsを参照。`/media/*` は長期キャッシュし、画像が変わるとURLも変わります。SVGやHTMLを外部画像として保存しません。

`manual.json` の `articles` はURLで自動取得と合成、`overrides` はタイトル等を上書き、`exclude` は対象URLを非掲載、`projects` は作品を追加します。作品には `works.json` と同じフィールドを指定してください。

## ページに置けるスタンプ

ヘッダーのスタンプボタンを押すと、前回の絵柄で配置モードになります。次のクリック・タップで配置でき、6種類の絵柄は道具パネルで変更できます。連続配置も可能です。矢印キーで位置を調整してEnterでも配置できます。スタンプは本文の操作を遮らず、「消す」に切り替えて自分のスタンプを直接選んで削除できます。最後の1つの取り消しや、全スタンプを自分だけ非表示にする操作も用意しています。削除は保存待ちでも即時反映します。

- Firebaseプロジェクト：**general**（ID `cp20-platform`）。
- 作成済みDB：`cp20-platform-portfolio-stamps`、asia-southeast1。
- URL：`https://cp20-platform-portfolio-stamps.asia-southeast1.firebasedatabase.app`。
- 専用Webアプリ：`cp20.dev definitive`。設定は `src/data/firebase.json`。ブラウザ用の公開設定であり、管理キーではありません。
- 既存の他のDBは変更していません。プロジェクトで既に有効な匿名認証を使用しています。

配置時のみFirebase Anonymous Authを使い、認証UIDの領域だけ書き込み・削除を許可します。1ページ・1UIDあたり5つ、6つ目から古いものを置き換え。表示は更新が新しい100人分（最大500個）に制限し、絞り込みなしの公開読込は拒否します。座標・種類・角度・タイムスタンプ・項目をDBルールで検証し、1秒未満の連続更新を拒否。匿名IDは再作成できるため、厳密な1人5個制限や完全な荒らし防止ではありません。古いUIDのレコードは自動削除しません。

本文の見出し・作品・記事に安定したアンカーを付け、その範囲内の相対座標で保存します。画面幅が変わっても同じコンテンツに追従し、表示していない作品タブや絞り込まれた記事のスタンプは隠れます。名前・自由入力テキストは保存しません。保存前にスタンプと位置が公開されることを表示します。

Web標準のEventSourceでFirebase RESTストリームへ直接接続。非表示タブでは購読を休止し、再表示時に最新データへ接続します。Auth SDKは配置時に遅延読込。保存はRESTのETag条件付きPUTで同時編集を検出します。配置と取り消しはネットワーク応答を待たず即時反映し、書き込みはDBの間隔制限に合わせて順番に送信。遷移中もキューを維持し、保存失敗時は該当操作を戻して再試行を表示します。購読を休止しても保存は独立して完了し、15秒の通信タイムアウトを設けています。ページ遷移・記事の絞り込み・作品切替はブラウザ内、定期収集はGitHub Actions、HTML/CSS/JSはStatic Assetsで完結し、サイト独自のWorker APIはありません。

ルールの更新：Firebase CLIで対象アカウントにログイン後、`npm run firebase:rules`。`.firebaserc` は専用DBだけを指します。レコードの管理・削除はFirebase Consoleの専用DBから行えます。

## UI / Web標準

SolidJS 2の `createSignal`、ドラフト形式の `createStore`、派生値の `createMemo`、Context、`For` / `Show`、2引数の `createEffect`、`onSettled` を使用。全UIをTSXで記述し、公式 `@solidjs/vite-plugin` のSSR出力をビルド時にHTML化します。配信対象は `dist/client` のみです。

Lucide公式のSVGノードをSolidで描画。CSS Grid、transitions / keyframes、`:has()`、`color-mix()`、`@layer`、`scrollbar-gutter`、History API、View Transition API、SVG、Intl、prefers-color-scheme、prefers-reduced-motionを使用しています。

テーマ変更は色だけを更新し、ページ遷移や文字の移動アニメーションを適用しません。作品タブは全パネルを同じGrid領域に重ね、最も高い内容の高さを常に確保。記事は結果領域、スタンプは状態メッセージの領域を確保し、スクロールバー分の幅も保持します。日本語本文は和文対応のシステムフォント、欧文Webフォントはロゴ・日付・番号・コード表記に限定。Webフォントは `font-display: optional` で遅い読込時の差し替えを避けます。記事画像の枠は16:9で統一し、元画像は切り抜かず収めます。作品や趣味の画像は白い写真の縁と控えめな角度でまとめ、元の色と比率を保持します。

内部リンクはドキュメントを再読込せずSolidのページを更新します。ヘッダーとナビは維持し、戻る・進むでスクロール位置と記事の絞り込みを復元。対応ブラウザでは本文だけ短いView Transitionを適用します。検索機能はありません。作品タブは矢印キー・Home/End対応。JS無効でも記事・作品詳細を読め、トップに3作品へのリンクを表示。狭い画面ではナビを画面下に移動。スタンプは矢印キー・Enter・Escでも操作できます。

作品切替、タブの下線、ボタンの押下、アイコン、画像のホバー、スタンプの押印、パレットの開閉にCSSモーションを追加。対応ブラウザでは趣味の画像にスクロール連動を適用し、非対応でも内容を隠しません。`prefers-reduced-motion` で停止します。記事の掲載先は直接選べるボタン、並び順は通常のネイティブselectを使用。ラベル・選択欄・矢印の寸法と位置を指定し、独自のselect拡張には依存しません。

## 検証と素材

`node scripts/browser-check.mjs` は8787のサイトを検証し、`.qa/` に結果と画面を保存します。初回は `npx playwright install chromium`。このテストは実際の専用DBにスタンプを置いて別ブラウザへの同期を確認し、最後にテスト用レコードと匿名アカウントを削除します。`STAMPS_LIVE_TEST=1 node scripts/stamps-rules.mjs` は一時的な匿名アカウントでDBルールを検証し、レコードとアカウントを削除します。

`RESEARCH.md` にリファレンス、`VALIDATION.md` に検証内容を記載。アイコンのキャラクターは空どうふさん、UIアイコンはLucide（ISC）、フォントはSpace Grotesk / IBM Plex Mono（欧文用途）。スタンプの絵柄はTwemoji（CC BY 4.0、`public/stamps/LICENSE-GRAPHICS.txt`、フッターに出典）および本人のアイコン。作品アイコンとOG画像は元の画像を保存して配信し、図柄や配色は変更しません。第三者画像の権利は各権利者に帰属し、クレジット表記によって新たな利用許諾を付与するものではありません。
