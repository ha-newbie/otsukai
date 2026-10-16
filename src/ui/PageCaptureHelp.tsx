import { useState } from 'react';
import type { ImportedRecipe, ImportContext } from '../domain/recipe-import';
import { copyImportText, parsePageCapture, readSharedCapture, safariCaptureScript } from '../services/page-capture';
import { currentAppUrl, sharedCaptureText } from '../services/import-handoff';
import type { Action } from './components';

export function PageCaptureHelp({ context, pageUrl, action, onResult }: { context: ImportContext; pageUrl: string; action: Action; onResult: (value: ImportedRecipe[]) => void }) {
  const [input, setInput] = useState('');
  const [destination, setDestination] = useState<'link' | 'clipboard'>('link');
  const appUrl = currentAppUrl();
  const script = safariCaptureScript(destination === 'link' ? appUrl : undefined);
  const accept = (value: string) => { setInput(value); onResult(parsePageCapture(sharedCaptureText(value, appUrl), context)); };
  return <section><h3>Safariの共有から材料を自動取込</h3>
    <p className="help-text">iPhone標準の「ショートカット」を一度設定します。表示中の材料を自動抽出し、おつかいの確認画面を開きます。サーバーやAPIキーは不要です。</p>
    <ol className="import-steps"><li>{pageUrl ? <a href={pageUrl} target="_blank" rel="noopener noreferrer">元ページを開く ↗</a> : 'Safariでクックパッドのレシピを開く'}。材料欄を表示します。</li><li>Safariの共有 →「おつかいに取り込む」を実行します。</li><li>おつかいが材料を検証して確認画面を開きます。内容を確認して保存します。</li></ol>
    <p className="help-text">ホーム画面版を使っている場合は、そちらへ戻り「レシピ」→「共有した材料を取り込む」を押します。Safariとホーム画面版のデータは別になることがあります。iOSが貼付の許可を求める場合があります。</p>
    <details><summary>初回だけ：ショートカットの作り方</summary>
      <fieldset className="capture-destination"><legend>取込後の動作</legend><label className="checkbox-label"><input type="radio" name="capture-destination" checked={destination === 'link'} onChange={() => setDestination('link')} />確認画面を自動で開く</label><label className="checkbox-label"><input type="radio" name="capture-destination" checked={destination === 'clipboard'} onChange={() => setDestination('clipboard')} />ホーム画面版へコピー</label></fieldset>
      <ol className="import-steps"><li>iPhoneの「ショートカット」で新規作成し、「おつかいに取り込む」と命名します。既存のショートカットも更新できます。</li><li>「共有シートに表示」を有効にし、受け取る入力を「SafariのWebページ」にします。</li><li>「WebページでJavaScriptを実行」を追加。入力を「ショートカットの入力」にし、下のコードで既定のコード全体を置き換えます。</li><li>次に「クリップボードにコピー」を追加。コピーする内容はJavaScriptの実行結果にします。</li>{destination === 'link' ? <li>最後に「URLを開く」を追加。開くURLにもJavaScriptの実行結果を指定します。これで材料の確認画面が自動で開きます。</li> : <li>この方式では「URLを開く」を使いません。実行後、ホーム画面のおつかいで「共有した材料を取り込む」を押します。</li>}<li>Safariの共有メニューから実行します。URL文字列や、このPWA内では実行できません。スクリプト実行の許可が必要な場合はAppleの案内に従ってください。</li></ol>
      <button type="button" className="button secondary full" onClick={() => void action(() => copyImportText(script), 'Safariショートカット用コードをコピーしました')}>実行用JavaScriptをコピー</button>
      <label>Safariショートカット用コード<textarea aria-label="Safariショートカット用コード" readOnly rows={6} value={script} /></label>
      <a className="source-link" href="https://support.apple.com/ja-jp/guide/shortcuts/apdb71a01d93/ios" target="_blank" rel="noopener noreferrer">Appleの設定・実行手順 ↗</a>
      <p className="help-text">iOS実機での初回設定・共有操作は未検証です。初回は上記の手動設定が必要です。材料は端末内で受け渡し、公開サーバーには送信しません。</p>
    </details>
    <button type="button" className="button primary full" onClick={() => void action(async () => accept(await readSharedCapture(appUrl)), '内容を確認して保存してください')}>共有した材料を取り込む</button>
    <label>ページで取得したデータ<textarea aria-label="ページで取得したデータ" rows={4} maxLength={100000} value={input} onChange={event => setInput(event.target.value)} onPaste={event => {
      const value = event.clipboardData.getData('text/plain');
      if (value) { event.preventDefault(); void action(async () => accept(value), '内容を確認して保存してください'); }
    }} placeholder="共有でコピーされたリンク、または以前の材料JSONを貼り付けます" /></label>
    <button type="button" className="button secondary full" disabled={!input.trim()} onClick={() => void action(async () => accept(input), '内容を確認して保存してください')}>ページの材料を解析する</button>
    <p className="help-text">貼付が許可されない場合は入力欄を長押しして貼り付けます。その操作でも自動解析します。取得だけでは保存されません。URLを入力しただけで元サイトへ自動アクセスする方式ではありません。</p>
  </section>;
}
