# MVP実装・検証報告

## 最新: クックパッド材料取込・調味料除外（2026-10-15）

クックパッドのHTMLの材料欄から、名前と分量を分離して読み取る処理を追加。「材料だけを取り込む」を初期状態で有効にし、調味料もレシピに保存する。設定の「買い物の集計」で除外カテゴリを選べ、初期値は調味料。登録済み食材の共通カテゴリ修正も同じ設定から行う。

買い物の除外は生成・開始前の明示的な再集計だけに反映する。在庫の使用予定には残し、直接追加した調味料、開始後/完了後の品目・数量・チェックを保護する。DB/バックアップはv2へ更新。旧v1は検証・移行して保持/復元する。DB名と既存のレシピ・在庫・購入チェックは維持する。

| 検証 | 結果 |
| --- | --- |
| `npm run typecheck` | 成功 |
| `npm test` | 7ファイル・80件成功 |
| `BASE_PATH=/otsukai/ npm run build` | 成功。manifest・Service Worker・404.htmlを生成 |
| `BASE_PATH=/otsukai/ PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` | 13件すべて成功 |
| 実際の公開ページを一時保存したHTMLの追加画面確認 | 7食材を抽出、作り方なし、元URL保持、保存成功、解析中の外部リクエスト0件 |

追加の単体検証: 材料名/分量の分離、グループ記号除去、調味料の候補と部分一致の誤除外防止、材料だけのJSON/AI回答取込、調味料除外と在庫予定の両立、直接購入品の保護、開始後/完了後の設定変更保護、除外カテゴリ参照、v1バックアップ移行/v2往復、実際のv1 IndexedDBからのv2アップグレードと再起動時の設定保持。

追加画面検証: 自作Cookpad構造fixtureのオフライン取込→名前/数量/出典確認→保存→献立→調味料の除外→設定解除→開始前の再集計→購入チェック→設定再変更→再読込。不正な材料欄や欠落行の保存防止、URLにslugがあるHTML断片、v1バックアップ復元後の調味料チェック保護も確認。HTMLのスクリプト・画像・CSS・iframeを実行/読込せず、モバイル幅も確認した。入力更新後も正しい名前で操作できるよう、HTML欄のaria-labelを明示した。

実ページのHTML構造・CORSヘッダーは[公開レシピ](https://cookpad.com/jp/recipes/20843981)で確認した。CORS許可ヘッダーはなく、PWAからの直接取得を保証しない。保存HTMLは一時ファイルのみで、GitHub/fixtureに実レシピ本文・写真を含めない。サーバー/AI API/解析ライブラリを追加していない。

ビルドは成功するが、既存Zodコードの注釈警告に加え、単一JSバンドルが約502KBで500KBの目安を超える警告がある（gzip約157KB）。将来の機能追加時に分割を検討する。iOS実機でのHTML準備・貼付・ファイル選択・更新時のデータ保持、すべてのCookpad HTML版、有料/ログインページは未確認。食材単位・レシピ材料単位の除外フラグは未実装。

今回の変更ファイル:

- 追加: `src/domain/ingredient-category.ts`, `src/domain/ingredient-category.test.ts`, `src/services/cookpad-import.ts`, `src/persistence/database.test.ts`, `src/ui/ShoppingPreferences.tsx`, `tests/fixtures/cookpad-ingredients.html`, `docs/cookpad-import.md`。
- 変更: `src/domain/models.ts`, `src/domain/calculations.ts`, `src/domain/calculations.test.ts`, `src/domain/recipe-import.ts`, `src/domain/recipe-import.test.ts`, `src/persistence/database.ts`, `src/persistence/backup.ts`, `src/persistence/repository.ts`, `src/persistence/repository.test.ts`, `src/services/ai.ts`, `src/ui/RecipeImport.tsx`, `src/ui/SettingsPage.tsx`, `src/ui/ShoppingPage.tsx`, `src/ui/styles.css`, `tests/app.spec.ts`, `README.md`, `docs/architecture.md`, `docs/ai-import.md`, `docs/roadmap.md`, `docs/backlog.md`, `docs/verification.md`。

詳細は[cookpad-import.md](cookpad-import.md)。次は実使用するHTML・iOS操作と除外設定の使い勝手を確認する。以下は以前の実装・公開時点の記録。

実装日: 2026-10-14。作業先: `/workspace/otsukai`。既存ソース・リポジトリがなかったため、mainブランチのローカルGitリポジトリを新規作成した。

名称を「おつかい」に変更。画面・ブラウザタイトル・PWA・共有タイトル・バックアップファイル名・ドキュメントとnpmパッケージ名（otsukai）へ反映し、プロジェクトのディレクトリ名も`otsukai`に変更した。データ形式v1の識別子とIndexedDB名は`kosaji`を保持し、既存データとバックアップを引き続き利用できる。

## 実装した範囲

日本語の献立・レシピ・買い物・在庫・設定の5タブ。レシピCRUDと検索・人数換算、週間朝昼夜献立の追加・移動・削除・日別人数、単位換算と在庫控除、買い物の直接追加・数量調整・カテゴリ別チェック、チェック保存、購入分の一度だけの在庫反映。

IndexedDB自動保存、形式バージョン付きJSON、ファイル共有/ダウンロード、検証と確認の後の復元、最終バックアップ操作日時と画面内リマインダー、Storage APIの安全な機能検出・要求・状態表示。復元したファイルのexportedAtを最終バックアップ日時として記録する。

PWAのオフラインキャッシュと更新通知、iOS向けメタ情報/アイコン、Pagesサブパス対応、GitHub Actions、README、開発ガイド、GPLv3。AIProvider契約・ChatGPTプロンプトコピー・JSON手動取込。

## 初回MVPの自動検証

環境: Node.js 24.19.0 / npm 11.9.0、Linux、システムChromium。実機iOSではない。

| 検証 | 結果 |
| --- | --- |
| `npm run typecheck` | 成功。strict / noUncheckedIndexedAccess / 未使用チェック |
| `npm test` | 3ファイル、38件成功 |
| `npm run build` | 成功。静的ファイル、manifest、Service Workerを生成 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` | 5件成功 |
| `BASE_PATH=/kosaji/ npm run build` | 成功。manifestのid/start_url/scopeが`/kosaji/` |
| `BASE_PATH=/kosaji/ PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` | 5件成功。サブパスでオフライン再読込も確認 |

単体テスト: 単位互換性・非互換性、人数換算、適量、在庫の一度だけの割当、期限順割当、使用日の期限判定、前週の未到来需要、過去日の除外、予定残量、保存失敗のロールバック、リストの再集計保護、数量上書きと手動品目保持、並行した買い物完了での二重反映防止、バックアップの参照/形式/サイズ検証、復元途中の書込エラー時の全テーブルロールバック、Storage APIの未対応・例外、共有キャンセル。

画面テスト: レシピ→献立→在庫控除→購入量調整→チェック→再読込→献立変更によるチェック保護→購入反映→ダウンロード→確認付き復元の一連の流れ。production Service Worker下でのオフライン再読込・新規レシピ保存、不正バックアップ拒否、人数換算・食材検索、5タブの画面幅、デスクトップ幅、ChatGPT JSONの検証/内容確認/取込。

Playwrightは専用4180番ポートにテスト用の静的サーバーを起動して終了時に停止する。GitHub Pagesと同じ404応答を再現し、既存のpreviewを再利用しない。

モバイルのレシピ詳細と1280px幅の週間カレンダーをスクリーンショットで目視確認した。テスト中に見つけた初回Service Worker制御と隠しファイル入力による画面幅超過を修正した。

ビルド時にZod依存コードのコメント注釈に関するRollup警告が出るが、ビルドは成功する。実行時のアプリコードのエラーではない。

## GitHub Pages設定の追加検証（公開作業前）

公開先: `https://github.com/ha-newbie/otsukai`（公開リポジトリ、接続時点では空）。デプロイ成功後のURL: `https://ha-newbie.github.io/otsukai/`。

- `.github/workflows/deploy.yml`を作成し、以前の`pages.yml`を削除した。mainのpushで検証→公開、PRでは検証だけを行う。全体の権限は空、buildは`contents: read`、deployは`pages: write`と`id-token: write`。YAMLの構文とジョブ権限もローカルで確認した。
- `npm ci`、`npm run typecheck`、`npm test`が成功。単体テストは38件すべて成功。
- `GITHUB_REPOSITORY=ha-newbie/otsukai npm run build`が成功。リポジトリ名からbaseが`/otsukai/`になり、manifestのid/start_url/scope、アイコン、SWのスクリプトURLとscopeが一致することを確認した。
- 起動HTMLと同じ`404.html`、`.nojekyll`を出力した。初回404でもJavaScriptとCSSをbase配下から読み込んで起動し、クエリとハッシュを維持する。
- `BASE_PATH=/otsukai/ PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`が成功。既存の5件に、初回404→SW登録→同じURLをオフライン再読込→保存データ保持、およびmanifest・iOS設定・アイコンの取得を加えた7件すべて成功。
- 既存のアプリ・データ・依存関係の24ファイルを前回の配布ソースと比較し、変更がないことを確認した。IndexedDB名・スキーマ・バックアップ形式・アプリのタブ機能は維持している。

今回変更したファイル: `vite.config.ts`、`playwright.config.ts`、`tests/app.spec.ts`、`README.md`、`docs/architecture.md`、`docs/verification.md`。追加: `.github/workflows/deploy.yml`、`tests/pages-server.mjs`。削除: `.github/workflows/pages.yml`。

この設定検証の時点ではGitHubへのpush・実際のActions実行・実公開は未実施。iOS Safari実機でのホーム画面追加とオフライン起動は別途確認が必要。READMEにGitHubの手動設定・初回push・更新・確認手順を記載した。

## GitHub公開結果

- 全42ファイルをmainに反映し、GitHub上の各ファイルのSHAとローカルの内容を照合した。
- アプリ公開コミット: `60830deb90f4af1b46bd5d06034682724b5082a9`。
- [初回公開のActions](https://github.com/ha-newbie/otsukai/actions/runs/38647924000)のbuild・deployがともに成功。GitHub上でもnpm ci、型チェック、単体テスト、production build、7件の画面テスト、Pages公開が成功した。
- https://ha-newbie.github.io/otsukai/ のHTTP 200を確認。JavaScript・CSS・manifest・Service Worker・3種のPNGアイコンを公開先から正常に取得できることを確認した。
- 直接URLの404.htmlが同じ起動HTMLを返すことと、manifestのid/start_url/scopeが`/otsukai/`であることを公開先で確認した。
- ローカルmainを公開先と同期し、origin/mainを追跡するよう設定した。以後はソース変更のcommit・pushで更新できる。

## 外部レシピ取込・AI支援の追加検証

2026-10-14、ユーザー指示で認証調査と取込を先行。Sign in with ChatGPTは公式の契約枠フロー・Web本人認証・利用条件を確認し、現行iOS PWA単体での直接認証は実装できると確認できなかった。方式・根拠・次の判断を[ai-import.md](ai-import.md)へ記録した。認証が完成したとは扱わない。

実装: 通常のCORS通信によるHTTPSページ取得、HTML/JSON-LD/Recipe解析、HTML/JSONの貼付・ファイル取込、複数候補、推測しない数量解析、元表記と注意の表示、ChatGPT用プロンプト・回答コードブロック対応、検証・編集後の保存。保存には既存のrepositoryを使う。新しい依存なし。DB名・スキーマ・バックアップv1は変更なし。

| 検証 | 結果 |
| --- | --- |
| `npm run typecheck` | 成功 |
| `npm test` | 5ファイル・69件成功（既存38件＋取込31件） |
| `BASE_PATH=/otsukai/ npm run build` | 成功。manifest・Service Worker・404.htmlを出力 |
| `BASE_PATH=/otsukai/ PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` | モバイルChromium・10件すべて成功 |
| `git diff --check` | 成功 |

取込単体検証: 日本語の全角・分数・対応単位、非対応単位/範囲/負値/曖昧量の保留、HTMLの非実行、@graph/複数Recipe/節ごとの手順、出典優先、未知の人数の注意、不正JSON・ID/トークン混入・過剰サイズ/深さの拒否、通常CORS設定、HTTP/通信失敗、実受信サイズ制限、12秒のタイムアウト。

追加/更新E2E: AI回答の検証→元出典保持→編集→保存→再読込、オフラインHTMLファイル解析→複数候補選択→編集→献立→買い物集計、HTML内の外部画像/スクリプトが読み込まれないこと、モバイル画面幅、CORS取得成功、取得失敗時の保存防止と本文/AIへの切替。外部URL応答は合成データのモックで検証しており、実サイトの対応保証ではない。取込プレビューのモバイルスクリーンショットも目視確認した。既存のバックアップ復元・オフライン・Pagesの404/manifest検証も成功。

最初の追加E2Eでは、テストが「2 個」を期待し、既存表示「2個」と不一致になった。既存の表示を維持してテストを修正し、全件を再実行して成功した。実行環境の制限でローカルサーバー起動にはネットワーク権限指定が必要だった。iOS実機・実ChatGPTの応答・対象サイト固有の利用条件/CORSは未確認。

今回の変更ファイル:

- 追加: `src/domain/recipe-input.ts`, `src/domain/recipe-import.ts`, `src/domain/recipe-import.test.ts`, `src/services/recipe-import.ts`, `src/services/recipe-import.test.ts`, `src/ui/RecipeImport.tsx`, `src/ui/RecipeFields.tsx`, `docs/ai-import.md`。
- 変更: `src/persistence/repository.ts`（入力型/スキーマの移動と再export）、`src/services/ai.ts`, `src/ui/RecipesPage.tsx`, `src/ui/SettingsPage.tsx`, `src/ui/styles.css`, `tests/app.spec.ts`, `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/backlog.md`, `docs/verification.md`。

## 未確認・未実装

- ホーム画面へのアプリ保存はユーザーから完了報告あり。機種・OSバージョンは未記録。オフライン起動・データ保持・共有/復元・永続ストレージ・更新、他の端末でのインストールは引き続き確認が必要。
- ChatGPT直接認証・自動献立提案、外部サイト固有の取得・利用条件の実地検証、店舗ごとの売り場/通路マップ/経路最適化、クラウド同期。汎用のRecipe解析と条件付きURL取得は上記のとおり実装済み。
- 調理時の自動在庫消費。同じ週の複数回の買い物リスト。

現在の範囲は買い物リスト1週1件・同時進行1件。完了済みリストは変更できない。実在庫の調理消費は手動更新。バックアップは10MB以下。これらはREADMEとUIで説明している。

次のタスク: 対象レシピサイトを選び、利用条件・CORS・実データを検証する。iOSでChatGPTとの切替・取込を確認し、直接認証には別実行環境を追加するかを決める。その後、購入チェック連続タップ・複数回の買い物・在庫消費を進める。

残件の最新の優先度と完了条件は[backlog.md](backlog.md)を参照。ホーム画面への保存完了報告を維持し、ユーザーの新しい優先順位を反映した。取込機能を追加し、保存データ形式は維持している。

## 初回MVPの変更ファイル（すべて新規）

| 用途 | ファイル |
| --- | --- |
| プロジェクト | `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `index.html`, `vite.config.ts`, `playwright.config.ts` |
| ドメイン | `src/domain/models.ts`, `src/domain/dates.ts`, `src/domain/calculations.ts`, `src/domain/calculations.test.ts` |
| 永続化 | `src/persistence/database.ts`, `src/persistence/repository.ts`, `src/persistence/backup.ts`, `src/persistence/repository.test.ts` |
| サービス | `src/services/storage.ts`, `src/services/storage.test.ts`, `src/services/ai.ts` |
| UI | `src/main.tsx`, `src/ui/App.tsx`, `src/ui/hooks.ts`, `src/ui/components.tsx`, `src/ui/PlanPage.tsx`, `src/ui/RecipesPage.tsx`, `src/ui/ShoppingPage.tsx`, `src/ui/PantryPage.tsx`, `src/ui/SettingsPage.tsx`, `src/ui/styles.css` |
| PWA資産 | `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`, `scripts/generate-icons.py` |
| E2E/CI | `tests/app.spec.ts`, `tests/pages-server.mjs`, `.github/workflows/deploy.yml` |
| 文書/ライセンス | `README.md`, `AGENTS.md`, `LICENSE`, `docs/architecture.md`, `docs/roadmap.md`, `docs/backlog.md`, `docs/verification.md` |

node_modules、dist、テスト結果、ローカルDBや認証情報はソース配布に含めない。

## 指定URLの取得不具合と診断の修正（2026-10-15）

対象: `https://cookpad.com/jp/recipes/18472521`。通常のHTTPS GETと、公開アプリのOriginを付けたGETでHTTP 200・HTML 250,629バイトを確認した。応答に`Access-Control-Allow-Origin`がなく、クックパッドの本文を別オリジンのPWAへ渡せないことが主因。サーバーから取得できたことを、PWAからの取得成功とは扱っていない。

URL直接取得では通常のCORS対応転送を許可するよう修正した。クックパッドはURL入力時に制約とSafariのページ取込を案内する。初回のショートカット設定、元ページでの実行、ホーム画面アプリへ戻す手順を画面内に追加した。URLだけの自動取得は未対応のままで、プロキシ・`no-cors`・アクセス制限回避は追加していない。

固定エラーコード29種、処理段階、対処、診断コピーを実装した。URL取得・HTTPエラー・取得後の解析・ページ実行・入力検証・DB読込を区別する。診断はビルドID・時刻・オンライン/表示状態・URLのorigin/path・観測できたHTTP状態/型のみで、query/fragment・認証情報・入力本文・自由文・stackを含めず、自動送信もしない。ブラウザから応答が見えないだけでCORSやHTTP状態を断定しない。

| 検証 | 結果 |
| --- | --- |
| `npm run typecheck` | 成功 |
| `npm test` | 9ファイル・91件成功 |
| `BASE_PATH=/otsukai/ npm run build` | 成功。manifest・SW・404.htmlを生成 |
| `BASE_PATH=/otsukai/ PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` | モバイルChromium・18件すべて成功 |
| `git diff --check` | 成功 |

今回追加した画面検証:

- 指定Cookpad URLで読取不可を模擬し、`IMP-2003`と処理段階を表示する。HTTP状態を捏造せず、手順へ移動できる。
- 本番ビルドから配布用JavaScriptを取り出し、合成したクックパッドページで実行する。`completion`は1回、DOM変更・追加通信は0件。実行結果の検証→編集→保存→再読込まで確認する。グループ記号「◯」もこの経路で確認する。
- 別ポートの実HTTPサーバーを使い、HTTP 200でもCORSヘッダーなしでは本文が読めないことと、CORSを許可した302転送後の読取成功をブラウザで確認する。Playwrightの応答差替だけをCORSの実証には使わない。
- 読めるHTTP 403と、HTTP 200受信後の材料欠落を別コード・段階として表示し、診断からquery/fragmentを除く。
- IndexedDBを開けない状態を注入し、`DATA-2002`と再読込操作を表示する。

追加の実ページ検証では、対象ページの保存済みHTMLをUTF-8の正しいHTTP型でブラウザへ読み込み、**本番配布用コードで材料11件を抽出**した。6件が調味料の候補になり、元URLと出典を保持し、作り方は空欄で保存・再読込できた。人数「２～３人分」、半分・適量などは既存の注意/保留仕様を維持した。記号「◯」を除去する対象へ追加した。取得済みの実HTML・実レシピ本文はリポジトリやテストfixtureへ含めていない。回帰用fixtureは合成データ。

既存の買い物チェック、在庫差引、バックアップv1→v2復元、オフライン再起動、Pagesのサブパス/直接URL/manifestも同じ18件で成功した。今回DB名・DBスキーマ・バックアップv2・保存項目・依存パッケージは変更していない。

変更ファイル:

- 追加: `src/domain/errors.ts`, `src/services/diagnostics.ts`, `src/services/diagnostics.test.ts`, `src/services/page-capture.ts`, `src/services/page-capture.test.ts`, `src/ui/ErrorBanner.tsx`, `src/ui/PageCaptureHelp.tsx`, `docs/import-errors.md`。
- 変更: `src/domain/ingredient-category.ts`, `src/domain/ingredient-category.test.ts`, `src/domain/recipe-import.ts`, `src/domain/recipe-import.test.ts`, `src/services/cookpad-import.ts`, `src/services/recipe-import.ts`, `src/services/recipe-import.test.ts`, `src/ui/App.tsx`, `src/ui/RecipeImport.tsx`, `src/ui/SettingsPage.tsx`, `src/ui/components.tsx`, `src/ui/styles.css`, `tests/app.spec.ts`, `tests/pages-server.mjs`, `vite.config.ts`, `AGENTS.md`, `README.md`, `docs/ai-import.md`, `docs/architecture.md`, `docs/backlog.md`, `docs/cookpad-import.md`, `docs/roadmap.md`, `docs/verification.md`。

実機iOSのショートカット作成・Safari共有・実行許可・クリップボード・ホーム画面アプリとの切替は未確認。Chromium上のJavaScript実行と保存の成功で、これらの実機操作まで保証しない。次の確認はiPhone上で初回設定から材料貼付までを通し、診断のビルドIDとエラーコードを記録すること。詳細手順と全コードは[import-errors.md](import-errors.md)を参照。

## Safari共有からの自動取込（2026-10-15）

ユーザーの追加指示により、無料・サーバー不要・CORSを回避しない条件で、共有後の受渡しと解析を自動化した。Safariで表示中のページに対してショートカットを実行すると、材料を抽出しておつかいの受取リンクを返す。ショートカットの「URLを開く」で確認画面まで進む。ホーム画面版は、明示した受取ボタンでコピー済みリンク/旧JSONの読取・解析を続けて行う。初回設定、OSの貼付許可、保存先の違いは[automatic-import.md](automatic-import.md)へ記録した。

| 検証 | 結果 |
| --- | --- |
| `npm run typecheck` | 成功 |
| `npm test` | 10ファイル・98件成功 |
| `BASE_PATH=/otsukai/ npm run build` | 成功。PWAとPages設定を維持 |
| `BASE_PATH=/otsukai/ PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` | 24件成功 |
| `git diff --check` | 成功 |

追加した確認内容:

- UTF-8/日本語のfragment受渡し、origin/path一致、query/認証情報/別アプリ/未知版/壊れたUTF-8/サイズ超過の拒否。
- 解析前のfragment除去とhistory stateの保持。通常のアプリURL・既存hashを変更しないこと。
- 本番配布コードの実行→受取リンク→オフラインでの自動確認画面表示。元ページの変更・追加通信は0件、`completion`は1回。受取リンクの材料はHTTP要求へ送られず、元サイトへの再取得もない。
- キャンセルで未保存、確認後の保存、再読込で保存結果が残ることと、受取画面が再出現しないこと。
- 元ページのデータがリンク上限を超えた場合に、生成コードが`IMP-4007`を返すこと。
- リンクと従来JSONの両方を受取ボタンから解析。起動時・再読込時にはクリップボードを読まない。未対応時は`IMP-4003`を表示し、手動pasteイベントから自動解析できること。
- 不正な受渡しで既存レシピを変更しないこと。編集中に届いた材料は確認待ちにし、入力と受信通知が同じダイアログで見えること。

初回の追加E2Eでは、既存の取込フォームを開いたまま同一URLのhashだけを変えたため、意図した入力保護が働いて確認待ちになった。自動起動の検証は新しいナビゲーションへ修正し、開いているフォームの保護は独立したテストで確認した。

2026-10-16のGitHub Actionsでは、受取リンクの保存テスト1件が失敗した。traceで保存クリック完了の約2ms後にテストが再読込を開始しており、非同期のIndexedDB保存完了を待っていなかった。アプリはトランザクション完了後に成功通知を表示して確認画面を閉じるため、その2つを確認してから再読込するようテストを修正した。固定時間の待機や保存処理の変更は加えていない。

指定レシピ`18472521`の保存済み実HTMLでも、本番の生成コード→受取リンク→自動確認画面→保存→再読込を追加検証した。材料11件、調味料候補6件、手順なし、元URL保持を確認。受取リンクは1,489文字で、抽出中の追加通信/ページ変更は0件、`completion`は1回だった。これは実HTMLを使ったブラウザ検証であり、iOS実機の共有操作ではない。実HTMLはリポジトリへ含めていない。

変更ファイル:

- 追加: `src/services/import-handoff.ts`, `src/services/import-handoff.test.ts`, `docs/automatic-import.md`。
- 変更: `src/domain/errors.ts`, `src/main.tsx`, `src/services/page-capture.ts`, `src/services/page-capture.test.ts`, `src/ui/App.tsx`, `src/ui/RecipeImport.tsx`, `src/ui/RecipesPage.tsx`, `src/ui/PageCaptureHelp.tsx`, `src/ui/components.tsx`, `tests/app.spec.ts`, `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/backlog.md`, `docs/cookpad-import.md`, `docs/import-errors.md`, `docs/roadmap.md`, `docs/verification.md`。

DB/バックアップv2・買い物スナップショット・依存関係は変更なし。URL入力だけの直接取得、iOSホーム画面版への自動起動/無操作での貼付は実装していない。初回ショートカット設定、実際のSafari共有と実行許可、URLを開く際の遷移、クリップボード許可はiOS実機で未確認。次の作業は実機での一連の操作確認。
