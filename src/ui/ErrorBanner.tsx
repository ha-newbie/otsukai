import { useState } from 'react';
import { diagnosticText, type ErrorReport } from '../services/diagnostics';

export function ErrorBanner({ report, onDismiss }: { report: ErrorReport; onDismiss?: () => void }) {
  const [copyStatus, setCopyStatus] = useState('');
  const text = diagnosticText(report);
  return <div className="banner error error-report" role="alert"><div><strong>{report.code} · {report.phase}</strong><p>{report.message}</p><p>{report.help}</p>
    <details><summary>診断情報</summary><textarea aria-label="診断情報" readOnly rows={7} value={text} /><button type="button" className="text-button" onClick={() => {
      if (!navigator.clipboard) { setCopyStatus('コピー非対応です。診断情報を選択してコピーしてください。'); return; }
      void navigator.clipboard.writeText(text).then(() => setCopyStatus('診断情報をコピーしました。'), () => setCopyStatus('コピーできません。診断情報を選択してコピーしてください。'));
    }}>診断情報をコピー</button>{copyStatus && <p role="status">{copyStatus}</p>}</details>
  </div>{onDismiss && <button aria-label="通知を閉じる" type="button" className="icon-button" onClick={onDismiss}>×</button>}</div>;
}
