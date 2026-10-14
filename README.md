# おつかい

**アプリを開く: https://ha-newbie.github.io/otsukai/**

献立から買い物まで。無料・広告なし・アカウント不要の日本語PWAです。iPhoneを中心に、Android・PCブラウザでも使えるモバイルファーストのUIを採用しています。

レシピ保存 → 週間献立 → 材料集計 → 在庫差引 → 買い物チェック → 購入品を在庫に反映 → JSONバックアップ。

## 開発・起動

Node.js 22.12以上（または20.19以上）、npmが必要です。

```sh
npm ci
npm run dev
```

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run preview`でproduction buildを確認できます。Service Workerはproductionで有効です。開発モードではオフライン対応を検証できません。E2Eではテスト専用の静的サーバーを起動し、GitHub Pagesと同じ404レスポンスを含めて検証します。

システムChromiumを使う場合:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

## MVPの機能

- **レシピ**: 作成・編集・削除・料理名/材料/出典検索、材料・数量・単位・基本人数、任意の手順/URL/出典、表示人数による換算。材料だけでも登録可能。
- **献立**: 月曜起点の週間カレンダー、朝・昼・夜、複数レシピ、日付/時間帯への移動・削除、日別の人数。
- **買い物**: 献立から材料集計、在庫差引、直接追加、数量変更、カテゴリ別チェック、再読込後もチェック保持。チェック前だけ明示的な再集計が可能。
- **在庫**: ロット別の追加・編集・削除・検索、数量・単位・期限、献立使用後の予定残量、購入分の一度だけの反映。
- **保存**: IndexedDBへの自動保存、バージョン付きJSONバックアップ、共有/ダウンロード、検証/確認付き復元、最終保存操作日時、画面内リマインダー、永続ストレージ要求/状態表示。
- **PWA**: ローカルのアイコン、ホーム画面用manifest、静的ファイルのオフラインキャッシュ、更新通知。広告・アクセス解析・外部フォントはありません。
- **外部レシピ取込・AI支援**: CORS取得可能なURLのRecipe解析、HTML/構造化JSONの貼り付け・ファイル取込、ChatGPT用プロンプトコピー、回答JSONの検証、複数候補の選択・確認・編集・保存。直接認証は未対応。

## 使い方と計算ルール

1. レシピに料理名と材料を登録します。数量不明の場合は「適量」を選びます。
2. 献立タブで朝・昼・夜にレシピを追加します。人数ボタンでその日の人数を変更できます。
3. 家にある食材を在庫タブに登録します。同じ名前の食材はIDを共有し、最初に登録したカテゴリを使います。表記が違う食材名は手動で揃えてください。
4. 「買い物リストを作成」で必要量を集計します。g/kgはg、ml/Lはmlにまとめ、その他は同じ単位だけをまとめます。密度や1個の重さは推測しません。期限は献立の使用予定日に対して判定します。
5. 最初の購入チェックでリストを固定します。途中の献立編集で数量やチェックは変わりません。チェック前は再集計しても手動品目・数量上書きを保持します。
6. 「買い物を完了」でチェックした数値の品目だけを在庫に追加します。「適量」は数値がないため、別途在庫に登録します。未チェック品は追加されません。
7. 調理に使った在庫の実際の残量は手動更新します。予定残量は自動消費とは異なります。過去日の献立は新しい集計に含みません。

同時に進める買い物リストは1つ、1週につき1つです。完了した週はリストを変更・再生成できません。追加購入は完了前に登録してください。次週を集計する場合、今週の未到来の献立需要を先に在庫へ割り当て、重複して差し引きません。

## 外部レシピを取り込む

レシピ → **レシピを取り込む** を開き、元URL・出典を指定します。

- **URL**: HTTPSページを取得してschema.org/Recipeを読み取ります。元サイトのCORS・利用条件・構造化データに依存し、多くのサイトは直接取得できません。転送がある場合は元サイトで開いた後のURLを指定します。
- **本文・AI**: 材料・作り方を貼り付け、プロンプトをコピーして「ChatGPTを開く」。ChatGPTに貼り付けて得たJSONをアプリへ戻し、検証します。通常のAPIキーは不要です。単一のJSONコードブロックにも対応します。
- **HTML・JSON**: 元ページのHTMLまたはRecipe JSONを貼り付けるか、ファイルを選択します。端末内の解析なのでオフラインでも使えます。HTML内のスクリプトは実行しません。

解析した内容は**保存前に編集**できます。`1/2個`・`大さじ1と1/2`等を読み取り、`1〜2個`・`1カップ`等の曖昧な数量や非対応単位は元表記を残して適量とします。人数が不明なら仮人数の注意を表示します。元レシピと照合して修正し、「この内容で保存する」を押してください。解析だけでは保存されません。

HTML/ページ/構造化JSONは2MB、AI回答は100KBまで。CORSや利用規約を回避しません。元サイトの利用条件上認められる範囲で使ってください。URL取得時は元サイトへ通信します。プロンプトのコピーだけでは通信せず、ChatGPTに貼り付けた内容はChatGPT側で処理されます。ChatGPTとアプリを切り替える間の入力はメモリ上のため、OSによる終了に備えて原文や回答も残してください。

**Sign in with ChatGPTは未実装です。** 公式の契約枠用フローは端末のloopback listenerが必要で、iOS PWA単体では満たせません。Web本人認証も承認済みclientとbackendが前提です。ChatGPTを開く操作は、おつかいへの直接ログインではありません。契約枠を使う公式方式と今後の選択肢、未対応範囲は[調査・取込設計](docs/ai-import.md)に記録しています。

## iPhoneでの保存

Safariでアプリをオンラインで開き、共有メニュー → **ホーム画面に追加**。初回のオフライン準備完了後に主要機能をオフラインで使用できます。

設定 → **バックアップを保存**。ファイル共有に対応していれば共有メニューの「ファイルに保存」でiCloud Drive等を選択できます。非対応時はJSONのダウンロードになります。**PWAからiCloud Driveへの自動保存は行いません。** 「ダウンロード保存」も選べます。ダウンロード開始は実ファイル保存の保証ではないため、保存先を確認してください。共有のキャンセルは保存成功として記録しません。

バックアップはスキーマバージョン1、最大10MB。復元では形式・日付・ID重複・参照整合性等を検証し、内容確認後に現在の全データを置き換えます。復元前に現在のバックアップを保存してください。

`navigator.storage.persist()`の許可はブラウザが判断します。機能が未対応/不許可でも使えますが、ブラウザによるデータ削除に備えて定期的なバックアップが必要です。端末・ブラウザ・通常表示/ホーム画面などで保存領域が別になる場合があります。

## GitHub Pages

公開先リポジトリは [ha-newbie/otsukai](https://github.com/ha-newbie/otsukai)。**公開URLは https://ha-newbie.github.io/otsukai/ です。** 公開リポジトリのGitHub Pagesと標準のGitHubホストランナーを利用するため、アプリ用の有料サーバーは不要です。

### GitHub側の初回設定

1. [Settings → Pages](https://github.com/ha-newbie/otsukai/settings/pages) を開き、**Build and deployment → Source → GitHub Actions** を選択します。
2. Settings → Actions → General でActionsを有効にします。利用するアクションを制限している場合は、`actions/checkout`、`actions/setup-node`、`actions/upload-artifact`、`actions/upload-pages-artifact`、`actions/deploy-pages`を許可します。
3. Workflow permissionsを全体で書込許可に変更する必要はありません。ワークフローはビルドに`contents: read`、デプロイに`pages: write`と`id-token: write`だけを付与します。Personal Access Tokenや追加のSecretsは不要です。
4. このプロジェクトの全ソース（`.github/workflows/deploy.yml`を含む）をmainへpushします。既存の`pages.yml`は削除し、デプロイの二重実行を防ぎます。

ZIPを展開して空のリポジトリへ初めてpushする場合:

```sh
cd otsukai
git init -b main
git add .
git commit -m "Configure GitHub Pages deployment"
git remote add origin https://github.com/ha-newbie/otsukai.git
git push -u origin main
```

GitHubへpushできるGit認証を用意してください。すでに`origin`がある場合は`git remote -v`で確認し、必要に応じて`git remote set-url origin https://github.com/ha-newbie/otsukai.git`を使います。GitHub Desktopからのpushも利用できます。

### 自動公開と更新

[deploy.yml](.github/workflows/deploy.yml)はmainへのpushで **npm ci → 型チェック → 単体テスト → npm run build → モバイルChromium E2E → Pages公開** を実行します。検証に失敗した場合は公開せず、直前の公開版を維持します。PRは検証だけを実行します。

[Actions](https://github.com/ha-newbie/otsukai/actions)で「Deploy to GitHub Pages」のbuild/deployが両方成功したら公開URLを開いてください。その後も変更をmainへpushするだけで更新されます。手動の再実行はActions → Deploy to GitHub Pages → Run workflow → mainから行えます。アプリに更新通知が表示された場合は入力を保存し、「更新する」を押してください。

公開状況はActionsの最新のbuild・deploy結果で確認できます。mainへの更新が成功すると、公開URLから最新版を利用できます。

### base・PWA・直接URL

Actionsのリポジトリ名から`BASE_PATH=/otsukai/`を設定します。Viteも`GITHUB_REPOSITORY=ha-newbie/otsukai`から同じbaseを導出できます。ユーザー/組織Pages（`owner.github.io`）では`/`、ローカル開発では`/`です。カスタムドメインでルート配信する場合はワークフローのBASE_PATHを`/`に変更してください。

manifestの`id`・`start_url`・`scope`は`/otsukai/`。アイコン・JavaScript・CSSはこのbaseから参照し、Service Workerは`/otsukai/sw.js`、登録scopeは`/otsukai/`になります。iOSのホーム画面追加用の設定と、初回オンライン読込後のオフライン機能を維持しています。

ビルド時に`index.html`と同じ起動HTMLを`404.html`へ出力します。初回に`/otsukai/shared/menu`のような直接URLを開いても、GitHub Pagesの404応答からアプリが起動します。クエリとハッシュは維持します。HTTPステータス自体はPagesの制約で404ですが、起動後はService Workerがscope内のナビゲーションをキャッシュ済みのindexへ戻します。既存のタブはURLルーターを使っていないため、直接URLでも初期の献立画面を表示します。

サブパスを含めてローカルで確認する場合:

```sh
BASE_PATH=/otsukai/ npm run build
BASE_PATH=/otsukai/ npm run preview
# previewを停止してからE2Eを実行
BASE_PATH=/otsukai/ npm run test:e2e
```

Safariでは公開URLを開いて共有メニュー →「ホーム画面に追加」を選びます。オフライン準備完了後に機内モードで再起動して確認してください。iOS実機での検証は別途必要です。IndexedDBのDB名・スキーマ・バックアップ形式は変更していません。保存領域はオリジンごとに別なので、localhost等から公開URLへデータを移す場合はJSONバックアップを保存して公開URL側で復元します。

## 構成

```text
src/domain/       Zodモデル・日付・純粋な計算関数と単体テスト
src/persistence/  Dexie DB・書込操作・バックアップ検証/復元とテスト
src/services/     Storage/Web Share・CORSページ取得・AIプロンプト/契約
src/ui/           Reactの5タブ・フォーム・ダイアログ・Tailwind/CSS
tests/            production PWAを操作するPlaywrightテスト
docs/             アーキテクチャ・ロードマップ
.github/workflows/ 検証とPagesデプロイ
```

React、TypeScript strict、Vite、Tailwind CSS、Dexie、Zod、vite-plugin-pwaを使用。テストはVitest、fake-indexeddb、Playwrightです。ランタイム依存はReact/React DOM/Dexie/Zodに抑えています。

詳しい設計は[architecture.md](docs/architecture.md)、将来の計画は[roadmap.md](docs/roadmap.md)、優先度と完了条件を含む開発残件は[backlog.md](docs/backlog.md)、開発時の規約は[AGENTS.md](AGENTS.md)を参照してください。

実行済みチェックと変更ファイルの一覧は[verification.md](docs/verification.md)を参照してください。

## 未実装・確認が必要な事項

ChatGPT直接認証/自動献立提案、サイト固有の自動取得、店舗ごとの売り場設定・通路マップ・経路最適化、クラウド同期は未実装です。契約枠を利用する公式のオープンソース向け認証は存在しますが、現在の静的iOS PWAへの適合を確認できていません。API課金を要求せず、認証トークンも保存しません。特定サイトの対応可否と利用条件の実地検証は対象URLが決まってから行います。

GitHub Pagesでの配信とホーム画面へのアプリ保存（ユーザー報告）は確認済みです。実機のオフライン起動・データ保持、iCloud Driveへの共有/復元、永続ストレージ許可、Safariでの更新、他の端末でのインストールは別途確認が必要です。モバイルChromiumのE2EはiOS Safari実機の代替ではありません。

## ライセンス

Copyright (C) 2026 おつかい contributors. [GNU General Public License v3.0 only](LICENSE)。無料で利用・改変・再配布できます。再配布時はGPLv3の条件に従ってソースを提供してください。第三者ライブラリはそれぞれのライセンスに従います。
