import { useEffect, useRef, useState } from 'react';
import type { AppData } from '../domain/models';
import { DATA_VERSION, defaultSettings } from '../domain/models';
import { repository } from '../persistence/repository';
import { MAX_BACKUP_BYTES, parseBackup, restoreBackup, serializeBackup, validateBackup, type Backup } from '../persistence/backup';
import { downloadFile, requestPersistence, saveBackupFile, storageStatus, type StorageStatus } from '../services/storage';
import { Confirm, Icon, type Action } from './components';
import { ShoppingPreferences } from './ShoppingPreferences';

export function SettingsPage({ data, action, offlineReady }: { data: AppData; action: Action; offlineReady: boolean }) {
  const settings = data.settings[0] ?? defaultSettings;
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [candidate, setCandidate] = useState<Backup | null>(null);
  const [servings, setServings] = useState(settings.defaultServings);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { void storageStatus().then(setStatus); }, []);
  const exportData = async (download = false) => {
    // Prepare from the already-loaded, transactionally consistent snapshot so
    // navigator.share is invoked during the user's click activation.
    const backup = validateBackup({ app: 'kosaji', schemaVersion: DATA_VERSION, exportedAt: new Date().toISOString(), data });
    const json = serializeBackup(backup);
    let result: 'shared' | 'downloaded' | 'cancelled';
    if (download) { downloadFile(new File([json], `otsukai-backup-${Date.now()}.json`, { type: 'application/json' })); result = 'downloaded'; }
    else result = await saveBackupFile(json);
    if (result !== 'cancelled') await repository.saveSettings({ ...settings, lastBackupAt: new Date().toISOString() });
  };
  const installed = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return <>
    <div className="page-heading"><div><p className="eyebrow">大切なノートを、長く使うために。</p><h1>設定</h1><p className="subtle">データはこの端末のブラウザに保存しています。</p></div></div>
    <ShoppingPreferences data={data} action={action} />
    <section className="settings-card"><div className="settings-title"><span className="settings-icon"><Icon name="book" /></span><div><h2>バックアップ</h2><p>端末の故障やブラウザのデータ削除に備えて。</p></div></div>
      <div className="settings-stat"><span>最後に保存操作をした日時</span><strong>{settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString('ja-JP') : 'まだ保存していません'}</strong></div>
      <p className="help-text">iPhoneでは共有メニューの「ファイルに保存」からiCloud Driveなどを選べます。自動保存は行いません。ダウンロード後はファイルが保存されたことを確認してください。</p>
      <div className="button-row"><button className="button primary" onClick={() => void action(() => exportData())}>バックアップを保存</button><button className="button secondary" onClick={() => void action(() => exportData(true), 'ダウンロードを開始しました。保存先を確認してください')}>ダウンロード保存</button></div>
      <label className="setting-inline">画面内リマインダー<select value={settings.backupReminderDays} onChange={event => void action(() => repository.saveSettings({ ...settings, backupReminderDays: Number(event.target.value) }), 'リマインダーを変更しました')}><option value={1}>1日ごと</option><option value={7}>7日ごと</option><option value={30}>30日ごと</option></select></label>
      <div className="settings-divider" /><h3>バックアップから復元</h3><p className="help-text">JSONを検証して内容を確認した後、現在のデータを置き換えます。先に現在のバックアップを保存してください。</p><input hidden ref={input} type="file" accept=".json,application/json" aria-label="復元するバックアップファイル" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (file) void action(async () => { if (file.size > MAX_BACKUP_BYTES) throw new Error('バックアップは10MB以下にしてください'); setCandidate(parseBackup(await file.text())); });
      }} /><button className="button secondary" onClick={() => input.current?.click()}>JSONファイルを選択</button>
    </section>
    <section className="settings-card"><div className="settings-title"><span className="settings-icon"><Icon name="pantry" /></span><div><h2>端末の保存領域</h2><p>ブラウザによる自動削除を抑える設定です。</p></div></div><div className="settings-stat"><span>永続ストレージ</span><strong>{!status ? '確認中…' : status.persisted ? '許可されています' : status.supported ? '未許可' : 'このブラウザでは要求できません'}</strong></div>{status?.usage !== null && status?.usage !== undefined && <p className="help-text">使用量：約{(status.usage / 1024 / 1024).toFixed(2)} MB{status.quota ? ` ／ 上限：約${(status.quota / 1024 / 1024).toFixed(0)} MB` : ''}</p>}<button className="button secondary" disabled={!status?.supported || status.persisted} onClick={() => void action(async () => { const granted = await requestPersistence(); setStatus(await storageStatus()); if (!granted) throw new Error('永続保存は許可されませんでした。利用は続けられます。定期的にバックアップを保存してください'); }, '永続ストレージが許可されました')}>永続ストレージを要求</button><p className="help-text">許可の判断はブラウザに委ねられます。許可後もユーザーによる削除や端末故障にはバックアップが必要です。</p></section>
    <section className="settings-card"><h2>ホーム画面・オフライン</h2><div className="settings-stat"><span>表示モード</span><strong>{installed ? 'ホーム画面アプリ' : 'ブラウザ'}</strong></div><div className="settings-stat"><span>オフライン準備</span><strong>{offlineReady || navigator.serviceWorker?.controller ? '利用可能' : '初回読込中／開発モード'}</strong></div><p className="help-text">iPhone：Safariの共有メニュー →「ホーム画面に追加」。初回はオンラインで開き、準備完了後にオフラインで使えます。端末やブラウザごとに保存領域は別です。</p></section>
    <section className="settings-card"><h2>献立の初期設定</h2><form onSubmit={event => { event.preventDefault(); void action(() => repository.saveSettings({ ...settings, defaultServings: servings }), '初期人数を保存しました'); }}><label className="setting-inline">基本の人数<input type="number" inputMode="numeric" min="1" max="100" step="1" required value={servings} onChange={event => setServings(Number(event.target.value))} /></label><button className="button secondary" type="submit">初期人数を保存</button></form></section>
    <section className="settings-card"><h2>ChatGPT・外部レシピ取込</h2><p className="help-text">レシピ画面からURL・HTMLの解析、ChatGPT用プロンプトのコピーと回答JSONの取込を利用できます。保存前に材料・人数・出典を確認・編集できます。</p><div className="settings-stat"><span>Sign in with ChatGPT</span><strong>このPWAでは未対応</strong></div><p className="help-text">手動連携ではChatGPTを開き、ChatGPT側でログインします。アプリ用のAPIキーや認証トークンは不要です。コピーだけでは外部に送信しません。URL取得時は元サイトへ通信し、ChatGPTに貼り付けた内容はChatGPT側で処理されます。</p></section>
    <section className="settings-card about"><span className="brand-symbol"><Icon name="spoon" size={30} /></span><h2>おつかい <small>0.1.0</small></h2><p>無料・広告なし・トラッキングなし</p><p className="subtle">GPLv3 / データ形式 v{DATA_VERSION}<br />アカウント登録は不要です。保存データは端末内にあります。</p><details><summary>今後の拡張について</summary><p className="help-text">ChatGPTの直接認証・AIによる献立提案、店舗マップ・経路最適化、クラウド同期は未実装です。外部レシピのURL取得は元サイトのCORS・利用条件・構造化データに依存します。</p></details></section>
    {candidate && <Confirm title="このバックアップを復元しますか？" onClose={() => setCandidate(null)} onConfirm={() => void action(() => restoreBackup(candidate), 'バックアップから復元しました').then(ok => { if (ok) { setServings(candidate.data.settings[0]?.defaultServings ?? 2); setCandidate(null); void storageStatus().then(setStatus); } })}><p>保存日時：{new Date(candidate.exportedAt).toLocaleString('ja-JP')}</p><p>レシピ {candidate.data.recipes.length}件・献立 {candidate.data.meals.length}件・在庫 {candidate.data.pantry.length}件・買い物リスト {candidate.data.trips.length}件</p><p className="danger-text">現在のすべてのデータを置き換えます。この操作は取り消せません。</p></Confirm>}
  </>;
}
