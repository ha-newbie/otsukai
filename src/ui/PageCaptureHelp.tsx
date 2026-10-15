import { useState } from 'react';
import { AppError } from '../domain/errors';
import type { ImportedRecipe, ImportContext } from '../domain/recipe-import';
import { copyImportText, parsePageCapture, safariCaptureScript } from '../services/page-capture';
import type { Action } from './components';

export function PageCaptureHelp({ context, pageUrl, action, onResult }: { context: ImportContext; pageUrl: string; action: Action; onResult: (value: ImportedRecipe[]) => void }) {
  const [input, setInput] = useState('');
  const script = safariCaptureScript();
  return <section><h3>Safariで開いたページから取り込む</h3>
    <p className="help-text">クックパッドのURLはPWAから直接読めません。iPhone標準の「ショートカット」を一度設定し、Safariで表示した材料をコピーして、このアプリに戻します。サーバーやAPIキーは不要です。</p>
    <ol className="import-steps"><li>{pageUrl ? <a href={pageUrl} target="_blank" rel="noopener noreferrer">元ページを開く ↗</a> : 'Safariでクックパッドのレシピを開く'}。材料欄を表示します。</li><li>Safariの共有 → 作成した「おつかい材料コピー」を実行します。</li><li>ホーム画面のおつかいに戻り、下の欄へ貼り付けて解析します。</li></ol>
    <details><summary>初回だけ：ショートカットの作り方</summary><ol className="import-steps"><li>iPhoneの「ショートカット」で新規作成し、「おつかい材料コピー」と命名します。</li><li>「共有シートに表示」を有効にし、受け取る入力を「SafariのWebページ」にします。</li><li>「WebページでJavaScriptを実行」を追加。入力を「ショートカットの入力」にし、下のコードで既定のコード全体を置き換えます。</li><li>次に「クリップボードにコピー」を追加。コピーする内容は直前のJavaScriptの実行結果にします。</li><li>Safariの共有メニューから実行します。URL文字列や、このPWA内では実行できません。スクリプト実行の許可が必要な場合はAppleの案内に従ってください。</li></ol>
      <button type="button" className="button secondary full" onClick={() => void action(() => copyImportText(script), 'Safariショートカット用コードをコピーしました')}>実行用JavaScriptをコピー</button>
      <label>Safariショートカット用コード<textarea aria-label="Safariショートカット用コード" readOnly rows={6} value={script} /></label>
      <a className="source-link" href="https://support.apple.com/ja-jp/guide/shortcuts/apdb71a01d93/ios" target="_blank" rel="noopener noreferrer">Appleの設定・実行手順 ↗</a>
      <p className="help-text">作成済みショートカットの自動インストールは行いません。iOS実機での設定操作は未検証です。コードは表示中の材料・出典だけを読み、通信・Cookie取得・ページ変更をしません。</p>
    </details>
    <label>ページで取得したデータ<textarea aria-label="ページで取得したデータ" rows={6} maxLength={100000} value={input} onChange={event => setInput(event.target.value)} placeholder='{"kind":"otsukai-recipe-page","version":1,"recipe":…}' /></label>
    <button type="button" className="button secondary full" onClick={() => void action(async () => {
      if (!navigator.clipboard?.readText) throw new AppError('IMP-4003');
      try { setInput(await navigator.clipboard.readText()); } catch { throw new AppError('IMP-4004'); }
    }, '貼り付けました。内容を解析してください')}>クリップボードから貼り付け</button>
    <button type="button" className="button primary full" disabled={!input.trim()} onClick={() => void action(async () => onResult(parsePageCapture(input, context)), '内容を確認して保存してください')}>ページの材料を解析する</button>
    <p className="help-text">貼り付けボタンが使えない場合は入力欄を長押しして貼り付けます。OSがアプリを終了しても、コピーした結果から再度取り込めます。取得だけでは保存されません。</p>
  </section>;
}
