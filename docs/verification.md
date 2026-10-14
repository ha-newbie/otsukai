# MVP実装・検証報告

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

## 未確認・未実装

- GitHubリポジトリへのpush、ソースの公開、実際のActions実行、Pagesへの公開。公開先は`ha-newbie/otsukai`。ローカル実装とワークフローを用意した。
- iPhone/Android実機のインストール、iOS Safariの共有メニューとiCloud Driveへの保存、永続ストレージ許可、Safari固有のデータ保持/更新。
- ChatGPT直接認証・自動献立提案、外部レシピの自動解析、店舗ごとの売り場/通路マップ/経路最適化、クラウド同期。
- 調理時の自動在庫消費。同じ週の複数回の買い物リスト。

現在の範囲は買い物リスト1週1件・同時進行1件。完了済みリストは変更できない。実在庫の調理消費は手動更新。バックアップは10MB以下。これらはREADMEとUIで説明している。

次のタスク: 公開先GitHubでPagesを有効化し、iOS実機でインストール→オフライン→iCloudへの手動バックアップ→復元を検証する。その後、在庫消費UXと同じ週の複数回の買い物を改善する。AI直接接続・マップ・同期は独立した後続タスク。

## 変更ファイル（すべて新規）

| 用途 | ファイル |
| --- | --- |
| プロジェクト | `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `index.html`, `vite.config.ts`, `playwright.config.ts` |
| ドメイン | `src/domain/models.ts`, `src/domain/dates.ts`, `src/domain/calculations.ts`, `src/domain/calculations.test.ts` |
| 永続化 | `src/persistence/database.ts`, `src/persistence/repository.ts`, `src/persistence/backup.ts`, `src/persistence/repository.test.ts` |
| サービス | `src/services/storage.ts`, `src/services/storage.test.ts`, `src/services/ai.ts` |
| UI | `src/main.tsx`, `src/ui/App.tsx`, `src/ui/hooks.ts`, `src/ui/components.tsx`, `src/ui/PlanPage.tsx`, `src/ui/RecipesPage.tsx`, `src/ui/ShoppingPage.tsx`, `src/ui/PantryPage.tsx`, `src/ui/SettingsPage.tsx`, `src/ui/styles.css` |
| PWA資産 | `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`, `scripts/generate-icons.py` |
| E2E/CI | `tests/app.spec.ts`, `tests/pages-server.mjs`, `.github/workflows/deploy.yml` |
| 文書/ライセンス | `README.md`, `AGENTS.md`, `LICENSE`, `docs/architecture.md`, `docs/roadmap.md`, `docs/verification.md` |

node_modules、dist、テスト結果、ローカルDBや認証情報はソース配布に含めない。
