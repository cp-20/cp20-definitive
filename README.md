# cp20.dev — definitive edition

「しーぴーのスタンプ帳」（クローバー色の机に置いたルーズリーフ）をモチーフにした、Cloudflare Workers向けのポートフォリオ。SolidJS 2.0.0-rc.10 のコンポーネントから全ページを静的HTMLに生成し、訪問者がページにシールを貼れるFirebase Realtime Databaseを組み合わせています。

## 開発

Node.js 24以上。

```sh
npm ci
npm run build
npm run dev:worker
```

`http://localhost:8787` はCloudflare Static Assetsの本番相当プレビュー。`npm run dev` で `http://localhost:4321` の編集用サーバーを起動できます。シールは開発中も専用Firebase DBへ接続し、閲覧者間で共有されます。テスト用に貼ったシールははがしてください。

```sh
npm run sync   # 記事・GitHub・おすすめ曲/漫画・サムネイルを取得
npm test       # 振る舞いのテスト（収集・OG解析・画像・シールの楽観的更新と保存・配置計算など）とビルド結果の検査
npm run cache:images # 画像キャッシュだけ更新（通常はsyncが実行）
npm run check  # Solidの型検査
npm run rules  # database.rules.json をページ一覧から再生成（--check で差分の検査のみ）
npm run build
```

初期データを同梱しているため、収集なしでもビルドできます。

## 本番公開の初期設定

**公開はCloudflare Workers Builds（CloudflareのGit連携）で行います。`main` へのpushごとにCloudflare上でビルドしてデプロイします。GitHub Actionsは記事などの定期収集とスナップショットのコミット、PR・`main` の検証（`CI`）、Firebaseルールのデプロイ（専用DBのみ。下記「ルールの更新」）を担当します。Cloudflareの認証情報は持ちません。**

2026-10-06に `cp-20/cp20-definitive` の `main` とWorkerの接続を設定済みです。公開URLは [cp20-definitive.cp20.workers.dev](https://cp20-definitive.cp20.workers.dev/)。ルートディレクトリは `/`、ビルド・デプロイコマンドは下記のとおりです。非本番ブランチの自動ビルドは無効です。

1. このフォルダをGitHubリポジトリの `main` に配置。
2. Actionsにスナップショットを書き戻す権限を許可。ブランチ保護を使う場合も更新経路を確保。
3. Cloudflareダッシュボードの **Workers & Pages → Create → Import a repository** で `cp-20/cp20-definitive` を接続し、次のように設定。
   - Worker名：`cp20-definitive`（`wrangler.jsonc` の `name` と一致させる。違うとビルドが失敗します）
   - Production branch：`main`
   - Build command：`npm run verify`（`npm run check`・`npm run build`・`npm test` を順に実行。テストはビルド結果も検査するためビルドの後。ViteのビルドはTypeScriptの型を検査しないため、`npm run build` だけだと型やテストが壊れた変更も公開されます。2026-10-06の接続時は `npm run build` で設定したため、ダッシュボードの Settings → Build で変更してください）
   - Deploy command：`npx wrangler deploy`
   - Node.js：`.node-version` の 24（Workers Buildsの既定も24）
   - 任意：Non-production branch builds を有効にすると、ブランチごとのプレビューURLで確認できます。
4. workers.devで確認後、CloudflareのCustom Domainsで `cp20.dev` を接続。

ドメイン・既存本番サイト・みんなのものさしリポジトリの公開設定は変更していません。canonical / sitemap / robots / RSSは本番予定の `https://cp20.dev` を指します。

### traPブログ

traPの記事は公開の著者ページ `https://trap.jp/author/cp20/` から、各ページの `<link rel="next">` をたどって最後のページまで読み、タイトル・URL・公開日だけを取得します（1ページ12件、2026-11時点で3ページ・34件）。途中のページの取得失敗、記事のない・想定外の次ページ、取得中の新規投稿で同じ記事が2ページに出た場合は、一部だけの一覧を保存せずに失敗とし、次回の定期実行で取り直します。キーは不要です。公開時刻は著者RSS（最新15件）から補い、RSSにない古い記事は著者ページに出る日付（日本時間）を使います。カードの形式が変わった場合も失敗として前回のスナップショットを維持し、正常な全件取得後は一覧から消えた記事を除去します（作品の関連記事に指定した記事は保持）。

以前は Ghost Admin API を使っていましたが、管理APIは traP SSO の内側にあり（Ghostに届く前にHTTP 307でログインへ転送）、定期収集では一度も成功していなかったため廃止しました。

ローカルで収集する場合は `npm run sync`。GitHub APIの上限を増やしたいときだけ `.env.example` を `.env.sync` にコピーして `GITHUB_TOKEN` を設定します。

### 自動更新

6時間ごとにGitHub Actionsで取得し、公開はCloudflareのGit連携が行います。普段は元のサービスへ記事を投稿するだけです。

| 対象                             | 取得元 / 動作                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Zenn・Qiita                      | 公開APIを全ページ取得                                                                                                  |
| note・sizu.me・blog.cp20.dev     | RSS。配信範囲から外れた過去記事を保持                                                                                  |
| traP                             | 公開の著者ページを全ページ取得（公開時刻は著者RSSで補完）                                                              |
| 公開コード                       | GitHub API。fork・archived以外の最近更新したリポジトリ                                                                 |
| 好きな曲・漫画                   | 2026版の公開 `featured-tracks` / `featured-series` データ                                                              |
| 漫画のサムネイル                 | 公式掲載ページの `og:image`。失敗時は前回URLを保持                                                                     |
| 作品・記事のOG画像と作品アイコン | 元の公開ページから取得し、画像本体をダウンロード。実画像の寸法を記録。正常取得は週1回、新規・失敗分は6時間ごとに再取得 |
| YouTubeのサムネイル              | おすすめ曲の動画IDに対応したYouTube画像                                                                                |

ネットワークの部分障害では前回データを保持し、全記事ソース失敗時は処理を失敗させます。公開データに差分がある場合は型検査とビルドで確認してから `main` にコミットし、そのpushでCloudflareが再デプロイします。チェック日時だけの更新は `[skip ci]` を付けてコミットし、長期無活動でのActionsスケジュール停止を避けます。収集・テスト・ビルドは読み取り専用のジョブで行い（`npm ci --ignore-scripts`、認証情報を `.git/config` に残さない）、検証済みの生成物だけを書き込み権限のある別ジョブがコミットします。actions はコミットSHAで固定しています。traPの記事が前回の半分未満に減った取得は失敗扱いにして前回データを保持します。意図した削除なら手動実行で `allow_trap_shrink` を有効にしてください。RSSの不正な記事は1件だけ除外し、XMLで使えない制御文字はタイトルから除去します。OG解析は `<head>` 内を先頭1MBまでしか読みません。スケジュールの遅延・外部サービス障害まで保証するものではありません。

自動取得できない経歴や説明を推測して更新することはしません。学年は各経歴の発生時点の値を保存しています。曲・漫画の「好き」は2026版に本人が選定したものです。視聴履歴を推測しません。

## フォルダ構成

- `src/site`：ページ一覧・ルーティング・ページ内遷移・タブ（`Shell.tsx`）。
- `src/content`：記事・作品・画像の整形（クライアントに渡す形）。
- `src/components` / `src/pages`：共有コンポーネントと各ページ。
- `src/stamps`：シール機能一式（UI・Firebaseクライアント・純粋なロジック・型・テスト）。
- `src/data`：JSONのデータと内容の定義（経歴・漫画の表紙）。
- `scripts/build`：ビルド後の静的HTML・RSS・sitemap・フォント・ライセンス表示。
- `scripts/sync`：定期収集（記事・trap.jp・リンクのプレビュー・画像キャッシュ・収集の健全性）。
- `scripts/firebase`：DBルールの生成とエミュレーターでの検証。
- `scripts/qa`：手元のブラウザ検証。

scripts はNodeの型除去でTypeScriptをそのまま実行します（tsx等は不要）。

## 内容の構成

- トップの3作品：ダイススペック、自作Cコンパイラ、みんなのものさし。
- 残りは作品一覧から閲覧。歴代サイトはトップ末尾に年代別リンク。
- 作品：`src/data/works.json`。新作の説明はユーザー指定の公開サイトとREADMEを確認。
- 経歴：`src/data/editorial.ts`。月と学年を併記。各項目の詳しい説明（`detail`）は参加記や主催の発表にあることだけを書き、項目を押すとダイアログで開く。資格は非掲載。
- 手動追加・除外・上書き：`src/data/manual.json`。
- スナップショット：`src/data/generated.json`。
- OG画像・アイコン・寸法：`src/data/previews.json`。全54記事と18作品中13作品のOGを収録。OGがない作品にはテキストの代替を表示し、別の画像を捏造しません。
- 音楽・漫画：`tracks.json` / `series.json`（定期処理が更新）。選定は2026版の元データで変更できます。
- 画像：`public/images/`、自動取得分は `public/media/`。92個の元URLを89ファイルに集約。`src/data/image-cache.json` が元URLとローカルファイルを対応付けます。漫画・YouTubeも事前保存し、ページに出典と著者・制作者を掲載。

画像は収集時に形式と15MB上限を検査し、内容ハッシュをファイル名に使用。新規取得に失敗した場合（新しいOG画像がSVG・15MB超・一時的な取得失敗など）は、前回の画像URL・寸法・ファイルを維持します。画像を含めてActionsからコミットし、ブラウザは同一サイトのStatic Assetsを参照。`/media/*` は長期キャッシュし、画像が変わるとURLも変わります。OG画像と音楽・漫画のサムネイルには幅320/640/960pxのWebP（元より2割以上狭いもののみ。縮小と再エンコードだけ）を、作品アイコンには幅96pxのWebPを `<元ファイル名>-<幅>w.webp` で作ります（元ファイルより小さくならないものは捨てる）。`public/images/covers` の表紙には幅240pxと原寸のWebPを作ります。いずれも `srcset`/`sizes`（アイコンは小さいWebPを直接）で配信します（`node scripts/sync/images.ts --variants-only` で取得なしに再生成。表紙を追加したら実行）。クライアントには `virtual:cp20-media`（`vite.config.ts`）としてローカルパスと寸法だけを渡します。SVGやHTMLを外部画像として保存しません。

`manual.json` の `articles` はURLで自動取得と合成、`overrides` はタイトル等を上書き、`exclude` は対象URLを非掲載、`projects` は作品を追加します。作品には `works.json` と同じフィールドを指定してください。

**作品の追加方法**

1. `src/data/works.json`（または `manual.json` の `projects`）に作品を追加します。フィールドは既存の作品と同じです。`comments` の中のリンクは `[ラベル](https://…)` や `[ラベル](/works/<id>)` の形で書くとリンクになります（URLをそのまま書くと `npm test` が失敗します）。`id` はURL（`/works/<id>`）とシールの保存先（`pages/works--<id>`）になるため、英小文字・数字を1つずつのハイフンでつないだ形（例 `my-app-2`）にしてください。大文字・`.`・`--`・重複は `npm run build` と `npm run rules` がエラーで止めます。
2. `npm run rules` で `database.rules.json` を再生成し、作品の追加と一緒にコミットします。忘れると `npm test` とPRの `Firebase rules` ワークフローが失敗します（新しいページではシールを保存できないため）。
3. `main` にマージすると、サイトはCloudflareが、ルールは `Firebase rules` ワークフローが自動でデプロイします。

ページの一覧（固定ページの順番・タイトル・インデックスタブの順・URLの正規化・シールのページキー）は `src/site/pages.ts` にまとめてあり、ルーティング・ページ内遷移・タブ・プリレンダー・sitemap・DBルールはここから作られます。

## ページに貼れるシール

画面の右下にシール帳（6種類のシール）があります。閉じると右下の小さな「シール」タブになります（スマートフォンでは最初は閉じた状態）。シールを見るのは誰でもできますが、貼るには Google アカウントでのログインが必要です。

- 貼り方：シールをドラッグして好きな場所に落とす、またはクリック・タップで持ち上げてから貼りたい場所をクリック・タップ。シールにフォーカスしてEnter→矢印キー（Shiftを押しながらで大きく移動）→Enterでも貼れます。手に持ったシールはばねのように指・カーソルを追い、動く向きに傾き、離した位置からそのまま紙に貼り付きます。
- 自分のシール：クリック・タップで持ち上げ、もう一度クリック・タップした場所へ貼り直せます（ドラッグでも移動可）。持ち上げたままシール帳（閉じているときは右下のタブ）を押すか、シール帳へドラッグするとはがれます。マウスではホバーで出る×、キーボードでは×にフォーカスしてもはがせます。キーボードではシールにフォーカスしてEnter→矢印キー→Enterで動かせます（同じシールの位置だけを書き換えます）。Escapeで元の位置に戻ります。
- アイコン：貼ったシールにはその人の [Gravatar](https://gravatar.com/) アイコンが添えられ、シールにホバー（タッチではタップ）すると表示されます。DBに保存・公開されるのはGoogleアカウントのメールアドレスから作るSHA-256ハッシュ（Gravatarの仕様）だけで、メールアドレスや名前は保存しません。Gravatar未登録の人は自動生成の模様になります。シール帳には説明文を置かず、未ログイン時は「Google でログイン」ボタンと薄く表示したシール、ログイン中は自分のアイコン（Gravatarの設定へのリンク）と、このページで貼れる残り枚数を表す5つの丸を表示します。エラーのときだけ文章で知らせます。
- 他の人のシールはポインタを受け取らないので、上に重なっていてもその下のリンクやボタンへのクリック（Ctrl・中クリック、右クリックのメニュー、セレクトを含む）はそのまま届きます。誰が貼ったかはホバー（タッチではタップ）で表示。右のインデックスタブにかかる位置のシールはページ内側に寄せて描きます。
- 取り消し（最後に貼ったものをはがす）・非表示（初期状態は表示）・シール帳の開閉ができます。削除は保存待ちでも即時反映します。

- Firebaseプロジェクト：**general**（ID `cp20-platform`）。
- 専用Realtime Database：`cp20-platform-portfolio-stamps`（`asia-southeast1`）。
- URL：`https://cp20-platform-portfolio-stamps.asia-southeast1.firebasedatabase.app`。
- 専用Webアプリ：`cp20.dev definitive`。設定は `src/data/firebase.json`。ブラウザ用の公開設定であり、管理キーではありません。
- 既存の他のDBは変更していません。

**公開前に必要な設定（Firebase Console）**

1. Authentication → Sign-in method で **Google** を有効化。
2. Authentication → Settings → 承認済みドメインに `cp20-definitive.cp20.workers.dev` と `cp20.dev`（開発時は `localhost`）を追加。
3. Actionsの `Firebase rules` ワークフロー（`main` へのマージで自動、または Run workflow）で `database.rules.json` をデプロイ（Google ログインのみ書き込み可・`avatar` 項目の検証を含む）。ファイルがページ一覧や `main` と食い違っている、またはエミュレーターでの検証に失敗したときはデプロイせずに止まります（手動の `npm run firebase:rules` も同じ。下記「ルールの更新」）。

Firebase Auth（Googleのポップアップログイン）でログインしたUIDの領域だけ書き込み・削除を許可します。ルールで `auth.token.firebase.sign_in_provider == 'google.com'` を必須にしているため、匿名認証などでは書き込めません。1ページ・1人あたり5つ、6つ目から古いものを置き換え（貼り直しは同じ枠の位置だけを書き換えるので、ほかのシールは消えません）。表示は更新が新しい100人分（最大500個）に制限し、絞り込みなしの公開読込は拒否します。座標・種類・角度・タイムスタンプ・Gravatarハッシュ（64桁の16進数）・項目をDBルールで検証し、1秒未満の連続更新を拒否。間隔は削除しても残る `throttle/$uid` で数え、レコードの書込はその更新と同時（`updatedAt` も毎回サーバー時刻）でなければ拒否するため、子パスへの部分書込や削除→再作成でも回避できません。古いUIDのレコードは自動削除しません。

Web標準のEventSourceでFirebase RESTストリームへ直接接続。非表示タブでは購読を休止し、再表示時に最新データへ接続します。Auth SDKはシール帳に触れたとき（以前ログインした人はページ表示後）に遅延読込し、ログインのポップアップがクリック内で開けるようにしています。保存はレコードと `throttle/$uid`（最終書込時刻）を同時に更新するRESTのマルチパスPATCHで、`throttle` の前回値を照合（compare-and-swap）して同時編集を検出します。受信したストリームの描画は最大で毎秒4回にまとめ、シールの位置は基準要素ごとに1回だけ測ります。貼る・動かす・はがすはネットワーク応答を待たず即時反映し（楽観的更新、`src/stamps/optimistic.ts`）、保存は1件ずつ、前の保存の完了から1.1秒あけて送ります（DBの1秒間隔制限に合わせた直列のPromiseチェーン）。保存に失敗した操作はその場で取り消して「保存できませんでした」と表示し、再試行はしません。別タブと同時に書いた場合も、compare-and-swapで拒否された側が取り消されます。購読を休止しても保存は独立して完了し、各リクエストに15秒の通信タイムアウトを設けています。ネットワークの切断はブラウザ自身が再接続し、ブラウザが諦めたとき（HTTPエラーなど）だけ「シールに接続できません」と伝えて5秒後に開き直します。ページ遷移・記事の絞り込み・作品切替はブラウザ内、定期収集はGitHub Actions、HTML/CSS/JSはStatic Assetsで完結し、サイト独自のWorker APIはありません。

ルールの更新：`database.rules.json` は手で編集せず、`npm run rules` で生成してコミットします（元は `scripts/firebase/rules.ts`・`src/site/pages.ts`・`src/stamps/limits.ts`。生成結果とのずれは `npm test` で検出）。`main` で `database.rules.json` が変わると、Actionsの `Firebase rules` がエミュレーターで検証してから専用DBへデプロイします（PRでは検証のみ）。リポジトリのSecretsに `FIREBASE_SERVICE_ACCOUNT`（cp20-platformの「Firebase Realtime Database 管理者」ロールを持つサービスアカウントのJSONキー）を登録しておきます。手元からは、Firebase CLIでログインして `npm run firebase:rules`。サイト（Cloudflare）とルールは別々にデプロイされるため、書込形式が変わる変更ではマージ直後の数分間、シールの保存が失敗することがあります。`.firebaserc` は専用DBだけを指します。レコードの管理・削除はFirebase Consoleの専用DBから行えます。

## UI / Web標準

SolidJS 2の `createSignal`、ドラフト形式の `createStore`、派生値の `createMemo`、Context、`For` / `Show`、2引数の `createEffect`、`onSettled` を使用。全UIをTSXで記述し、公式 `@solidjs/vite-plugin` のSSR出力をビルド時にHTML化します。配信対象は `dist/client` のみです。

Lucide公式のSVGノードをSolidで描画。CSS Grid、transitions / keyframes、`:has()`、`color-mix()`、`@layer`、`scrollbar-gutter`、History API、View Transition API、SVG、Intl、CSS mask、prefers-reduced-motionを使用しています。

作品タブは全パネルを同じGrid領域に重ね、最も高い内容の高さを常に確保。記事は結果領域、スタンプは状態メッセージの領域を確保し、スクロールバー分の幅も保持します。本文と見出しは丸ゴシックの Zen Maru Gothic、コード・技術名は IBM Plex Mono（`font-display: optional`）。記事画像の枠は16:9で統一し、元画像は切り抜かず収めます。画像は切手の白い余白と目打ちで囲み、元の色と比率を保持します。

内部リンクはドキュメントを再読込せずSolidのページを更新します。ヘッダーとナビは維持し、戻る・進むでスクロール位置と記事の絞り込みを復元。対応ブラウザでは本文だけ短いView Transitionを適用します。検索機能はありません。作品タブと本棚は矢印キー・Home/End対応。JS無効でも記事・作品詳細を読め、トップに3作品へのリンクを表示。狭い画面ではナビを画面下に移動。スタンプは矢印キー・Enter・Escでも操作できます。

デザインのテーマは「しーぴーのスタンプ帳」。クローバー色の机に置いたルーズリーフ（方眼・綴じ穴・余白線）として全ページを描き、Webらしいカードの並びを避けています。紙の世界観に合わせてダークモードは用意していません。ホーム・作品・記事・プロフィールはそれぞれ緑・ピンク・青・黄の紙で、ページの右端にあるインデックスタブと対応します。今いるページのタブは紙と継ぎ目なくつながり、ほかのタブは紙の後ろからのぞきます。タブを移動すると、ページが綴じ穴を軸にめくれて次の紙が現れます（前のタブへ戻るときは紙がめくれて戻ってきます。作品の詳細へ進む・戻るも同じ）。画像はすべて目打ちのある切手として貼り、作品と記事の切手には日付入りの消印（作品は制作開始日、記事は公開日）が押されます。アイコンは丸い切手、「cp20」は朱色のはんこ、プロフィールは付箋、所属は名札、経歴と主な3作品はスタンプラリーの点です。文字は Zen Maru Gothic（500/700）。ビルド時に `scripts/build/fonts.ts` が、全ページのHTMLとクライアントJSに含まれる文字だけで `fonts/zen-maru-gothic/`（SIL OFL）の各ウェイトを1つのWOFF2にサブセット化します（開発サーバーでは `@fontsource/zen-maru-gothic` を使用）。動きは基本的にtransitionで連続させ、途中で操作しても滑らかに向きを変えます。主な作品の切替は左右へのクロスフェード（タッチでは指に追従し、短く払ってもめくれるスワイプ）、ホバーはタイトルに蛍光ペンが引かれるだけで、切手（画像）を浮かせたり動かしたりはしません。漫画は背表紙を並べた本棚で、背表紙を選ぶとその1冊が引き出されて表紙が見えます（幅の変化だけで切り替わります）。最近更新したリポジトリは、名前・説明・言語・更新日の列がそろった台帳形式です。記事の絞り込み・並べ替えは何度も使う操作なので動かさずにすぐ反映し、下方の切手は対応ブラウザでスクロールに合わせて表示されます。入場の動きは訪問の最初のページだけで、以降のページはめくりだけで現れます。`prefers-reduced-motion` では動き（めくり・入場・ばね・スクロール出現）を止め、シート帳とタブの開閉、主な作品の切り替えだけを短いフェードで残します。

## 検証と素材

`npm test`（`vitest run`）は外から観測できる振る舞いだけを検査します。純粋なロジックは使う機能のフォルダ（`src/stamps` など）に置き、テストはその隣（`foo.ts` の隣に `foo.test.ts`）に置きます。、fetch・時計・EventSource は小さなテストダブルに差し替えるので、テストは速く決定的です。ソースコードの文字列を照合するテストは置かず、見た目や操作は下記のブラウザ検証で、生成物はビルド結果（`dist/client`）で確かめます。テスト名は仕様として読める文で、1テストにつき1つの関心だけを検査します。CSSの約束事（px指定のfont-sizeを使わない、印刷用スタイル、シールの層の解放）はソース照合のテストをやめた際に自動検査から外し、レビューで見ます。ビルド結果を読むテストは `dist/client` がなければスキップするため、`npm run verify` の中で走らせてください。シールの保存失敗の取り消し（`store.ts` の配線）はブラウザ検証でだけ確かめており、`npm run verify` には含まれません。

`node scripts/qa/browser-check.ts` は8787（`CHECK_ORIGIN` で変更可）のサイトを検証し、`.qa/` に結果と画面を保存します。初回は `npx playwright install chromium`。Googleログインはヘッドレスブラウザでは行えないため、シールの操作は `scripts/qa/firebase-mock.ts`（ログイン済みユーザーを注入し、DBをメモリ上で同じ所有者ルールで再現）に対して検証し、実際のDBには書き込みません。`STAMPS_RULES_EMULATOR=127.0.0.1:9000 node scripts/firebase/rules-check.ts` はローカルのRealtime Databaseエミュレーターにルールを読み込み、署名なしのGoogleトークンで書込の検証（連続更新・子パス書込・削除→再作成・同時編集の拒否を含む）を行います。`STAMPS_LIVE_TEST=1 node scripts/firebase/rules-check.ts` は実際のDBで公開読込の制限と、未ログイン・匿名アカウントの書き込み拒否を検証します。`STAMPS_GOOGLE_ID_TOKEN`（Googleログインしたブラウザで取得したIDトークン）を渡すと、項目の検証と自分の領域への書き込み・削除も確認します。

`RESEARCH.md` にリファレンス、`VALIDATION.md` に検証内容を記載。アイコンのキャラクターは空どうふさん、UIアイコンはLucide（ISC）、サービスのロゴは Simple Icons（CC0）と各サービスのファビコン（`public/images/brands/`）、フォントはZen Maru Gothic / IBM Plex Mono（SIL OFL）。スタンプの絵柄はTwemoji（© Twitter, Inc and other contributors、CC BY 4.0、`public/stamps/LICENSE-GRAPHICS.txt` に対象ファイルと出典）および本人のアイコン。ビルド時に `scripts/build/licenses.ts` が、クライアントJSとHTMLに入る npm パッケージ（Firebase・Solid・Lucide など）とフォント・シール素材のライセンス全文を `/third-party-licenses.txt` に書き出し、フッターから開くクレジットのダイアログからリンクします（LICENSE を同梱しないパッケージには `licenses/` の本文と各ソースの著作権表示を使用）。Zen Maru Gothic のサブセットはフォント内の著作権・ライセンス表示（name ID 0〜6, 8, 9, 11〜14）を残します。作品アイコンとOG画像は元の画像を保存して配信し、図柄や配色は変更しません。第三者画像の権利は各権利者に帰属し、クレジット表記によって新たな利用許諾を付与するものではありません。
