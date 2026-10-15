# 開発ガイド

このリポジトリは「おつかい」のクライアント専用PWAです。ユーザーの明示指示を優先します。

- React + TypeScript strict。`src/domain`はUIとDBに依存させない。`src/persistence`経由で永続化し、整合性が必要な操作はDexieトランザクションを使う。
- サーバー、広告、解析SDK、トラッキング、アカウント必須化を追加しない。フォント・アイコンを含め静的資産をローカルに置く。
- ID参照、g/kg・ml/Lの互換性を守る。個数・重量・体積を推測で換算しない。適量はnull。
- 買い物開始後のスナップショットとチェック状態を壊さない。購入完了は一度だけ在庫に反映する。
- DBスキーマ変更はDexieの新バージョンで移行する。バックアップ形式のバージョンと移行・検証を独立して扱う。復元は検証・ユーザー確認・単一トランザクション。
- iCloud Driveへの自動保存やStorage APIの必ず許可される動作を仮定しない。
- AI直接認証は未実装。ユーザー指示で認証調査・外部取込を優先した。公式要件・現構成での制約は`docs/ai-import.md`に記録。未対応のPWAフローを捏造せず、トークンをIndexedDB/localStorageに保存しない。有料APIを必須にせず、CORS・利用規約を回避しない。
- 日本語UI、44px以上の操作対象、16px以上の入力文字、safe-area、キーボード操作を維持する。
- 計算や保存処理の変更では対応する単体テストを実行する。主要フローの変更ではproduction buildのPlaywrightテストも実行する。
- 検証コマンド: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`。必要なブラウザは`npx playwright install chromium`で用意する。システムChromiumは`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`で指定できる。
- `BASE_PATH=/otsukai/ npm run build`でPagesサブパスを確認する。E2Eにも同じBASE_PATHを指定する。
- 実装内容や制約をREADMEとdocsに反映する。実機未確認・未実装・未公開の項目を完成済みと記載しない。
- 取込エラーは`src/domain/errors.ts`の固定コードを使い、文言から原因を推定しない。ブラウザの読取不可だけでCORS/DNS/TLSやHTTP状態を断定しない。実行場所・対処・診断の規約は`docs/import-errors.md`を参照し、本文・query・トークンを診断へ含めない。
- 依存追加は必要性を確認し、package-lock.jsonも更新する。生成物・ローカルデータ・認証情報をコミットしない。
