# ChatGPT認証・外部レシピ取込

調査・実装日: 2026-10-14。ユーザー指示により、Sign in with ChatGPTと外部レシピ取込を次の優先開発へ変更した。

## Sign in with ChatGPTの調査結果

**直接認証は未実装。現在のGitHub Pages上のiOS PWA単体では、確認できた公式フローを満たせない。**

| 公式の方式 | 前提 | おつかいへの影響 |
| --- | --- | --- |
| オープンソースアプリでのChatGPT契約枠利用 | 端末のローカル実行環境でHTTP loopback callback listenerを起動し、`127.0.0.1`へ認証結果を受け取る。初回は動的登録し、そのアプリ・アカウントに発行されたclient IDを以後利用する。 | ブラウザのPWAにはHTTP listenerを起動するAPIがない。GitHub PagesのHTTPS URLへcallbackを置き換える方法は公式仕様として確認できない。ネイティブアプリ等の別の実行環境が必要になると判断した。 |
| Webサイトでの本人認証 | 現在は選定されたパートナー向けの試行。承認されたclient ID・登録済みcallbackと、コード交換・ID token検証・セッション作成を行うbackendが前提。 | 静的Pagesだけでは満たせない。本人認証だけではChatGPT契約枠でのAI実行権限にもならない。 |

出典: [OpenAI Quickstart](https://developers.openai.com/siwc/quickstart)、[Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)、[On your website](https://developers.openai.com/siwc/website)。PWAへの適合性の結論は、この公式仕様とブラウザの実行制約からの判断。

ChatGPT契約を利用できる公式のオープンソース向け方式自体は存在する。通常の課金APIと混同しない。ただしアカウント/プランの対象条件・利用上限があり、すべての契約で利用できるとは扱わない。今回、他アプリのclient ID流用、セッションCookie取得、ユーザーのトークン貼り付け、非公式認証は実装していない。

直接連携の次の判断では、**iOS PWAを維持して手動連携を続けるか、別の実行環境を追加するか**を先に決める。Web本人認証の承認・backend追加だけで契約枠のAI実行まで解決するとは仮定しない。公式対応が変わった際も再調査する。

採用する方式が決まった後の必須条件:

- OAuth Code + PKCE(S256)、state/nonceの照合、署名・issuer・audience・有効期限を含むID token検証、一回限りのcallback消費。
- アプリ固有の登録情報とアカウント/ワークスペースを正しく関連付け、権限不足・失効・キャンセル・切断を扱う。
- 認証情報をIndexedDB/localStorage/バックアップ/ログへ保存しない。別の実行環境を追加する場合も、ユーザー管理下の安全な保存方法を選定する。
- ユーザーが依頼した用途だけに利用し、通常の課金APIを必須にしない。プラン枠の不足を別の課金へ自動切替しない。
- 契約枠のResponsesでは公式の`store:false`・`stream:true`等の制限を確認する。

出典: [SIWC利用条件](https://openai.com/policies/sign-in-with-chatgpt-terms/)、[Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)。まだ認証コード・トークン保持・API呼出はない。

## 今回実装した取込

レシピ →「レシピを取り込む」から利用する。新しい依存ライブラリは追加していない。

1. **URL**: ユーザー操作時のみHTTPSページを通常のCORS fetchで読む。HTML内の`application/ld+json`、または直接返されたJSONからschema.orgのRecipeを探す。
2. **本文・AI**: 元URL・出典・本文を含む日本語プロンプトをコピーし、ChatGPTを開く。回答のJSONを貼り付け、Zod検証後に内容を編集する。単一のJSONコードブロックも受け入れる。コピーだけでは通信しない。
3. **HTML・JSON**: 貼り付けまたはファイル選択。解析は端末内なのでオフラインで利用できる。2026-10-15にクックパッドの材料欄への対応を追加。HTMLを表示中のDOMへ挿入せず、接続しないtemplateだけを使う。スクリプト・画像等を実行/読込しない。
4. **確認・保存**: 複数Recipeから1件を選択し、料理名・人数・材料・数量・カテゴリ・手順・出典・URLを編集して保存する。解析だけではDBを書き換えない。保存には既存のトランザクションを使う。

`@graph`・ネスト・配列のRecipe、HowToStep/HowToSectionの手順に対応。材料は明示された対応単位と数量だけを読み取る。例: `２００ｇ`→200 g、`1/2個`→0.5個、`大さじ1と1/2`→1.5大さじ。分数は既存計算方針と同じ小数第3位へ丸める。

`1〜2個`・`1カップ`・`1枚(約250g)`・少々などは確定しない。単一文字列からの解析では元表記を食材名に残して適量にし、HTMLで名前/分量が分離している場合は名前を保って分量を適量にする。原表記と注意を確認画面に表示する。人数不明なら仮人数を明示する。既知の調味料はseasoning候補、それ以外はotherとする。登録済み食材は現在の共通カテゴリを優先し、設定で修正できる。AI回答は指定された有効カテゴリを使う。入力欄の出典・URLをAI回答より優先する。

## 通信・サイズ・対応範囲

- URL通信は`mode:cors`・`credentials:omit`・`referrerPolicy:no-referrer`。Cookieや認証情報を添付しない。URL不具合の修正で`redirect:follow`に変更し、CORS制約内の通常転送を扱う。応答を読めない原因の詳細はブラウザから判別できない場合がある。
- 制限回避のプロキシやno-cors取得はしない。通常のCORS許可は転載・再利用の許諾を意味しない。利用条件上認められたページで使う。
- ページ/HTML/構造化JSONは2MBまで、通信は12秒で中断。実受信バイト数も制限する。候補は20件まで、深い入れ子や過剰な項目も拒否する。
- AI回答は100KBまで、本文入力は20,000文字。JSONを厳格に検証し、ID・トークン・未知のキーは拒否する。
- URL取得はオンラインが必要。サイトのCORS、ログイン、転送、構造化データ、利用条件に依存する。取得できない場合は本文・HTMLの手動取込を使う。
- クックパッドはアプリ内でSafari共有からのページ取込へ案内する。元ページで実行するコードと受け渡しを実装し、設定手順・iOS実機の未確認範囲・固定エラーコードは[import-errors.md](import-errors.md)にまとめた。URL入力だけで自動取得できるとは表示しない。
- ChatGPTで処理するにはユーザーがChatGPTへ貼り付ける。アプリはレシピ/在庫/個人情報を自動送信しない。
- クックパッドの公開ページ1件でHTML構造・JSON-LD・CORSと利用規約を確認し、材料欄アダプターを追加した。確認範囲と残件は[cookpad-import.md](cookpad-import.md)参照。全HTML版の対応保証、画像/PDF解析、JSON-LDの参照解決はない。名前・値・単位が明示されたPropertyValueは対応する。

形式の出典: [schema.org/Recipe](https://schema.org/Recipe)。JSON-LD一般の完全な実装ではなく、Recipe取込に必要な限定的な解析。

## 保存形式

初回拡張ではRecipeInputとmanualRecipeSchemaをドメインへ移し、既存v1を維持した。2026-10-15の除外設定追加でDB/バックアップをv2へ移行した。旧v1の移行・復元に対応し、DB名、レシピモデル、在庫・チェックは維持する。元HTMLや認証情報を保存するテーブルは作らない。

## 次の作業

1. クックパッドの実使用するレシピでHTML取込を確認する。別サイトはURLを選び、利用条件・CORS・構造化データを確認してから対応する。
2. 実機SafariでChatGPTへの切替・コピー/貼り付け・元アプリ復帰・取込保存を確認する。入力は取込画面を閉じるまでのメモリ上なので、OSによる終了に備えて原文/回答は元の場所にも残す。
3. 直接認証を進める場合は、別実行環境の追加方針と公式の登録要件を決定する。現在のPWA単体で対応済みとは表示しない。
