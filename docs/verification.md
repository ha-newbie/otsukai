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
