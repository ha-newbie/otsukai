import { useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { describeError, type ErrorReport } from '../services/diagnostics';
import { ErrorBanner } from './ErrorBanner';
import { AppError } from '../domain/errors';
import { monday } from '../domain/dates';
import { repository } from '../persistence/repository';
import { useAppData, useOnline } from './hooks';
import { Icon, UIContext, type Action } from './components';
import { PlanPage } from './PlanPage';
import { RecipesPage } from './RecipesPage';
import { ShoppingPage } from './ShoppingPage';
import { PantryPage } from './PantryPage';
import { SettingsPage } from './SettingsPage';

const tabs = [
  { id: 'plan', label: '献立', icon: 'calendar' },
  { id: 'recipes', label: 'レシピ', icon: 'book' },
  { id: 'shopping', label: '買い物', icon: 'basket' },
  { id: 'pantry', label: '在庫', icon: 'pantry' },
  { id: 'settings', label: '設定', icon: 'settings' },
] as const;
type Tab = typeof tabs[number]['id'];
export function App() {
  const { data, error } = useAppData();
  const online = useOnline();
  const [tab, setTab] = useState<Tab>('plan');
  const [week, setWeek] = useState(monday());
  const [notice, setNotice] = useState<{ text: string; error: boolean; report?: ErrorReport } | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const { needRefresh: [needRefresh], offlineReady: [offlineReady], updateServiceWorker } = useRegisterSW();
  const action: Action = async (operation, message) => {
    if (lock.current) return false;
    lock.current = true; setPending(true); setNotice(null);
    try { await operation(); if (message) setNotice({ text: message, error: false }); return true; }
    catch (cause) {
      const report = describeError(cause);
      setNotice({ text: report.message, error: true, report }); return false;
    } finally { lock.current = false; setPending(false); }
  };
  const settings = data?.settings[0];
  const backupDue = data && (!settings?.lastBackupAt || Date.now() - new Date(settings.lastBackupAt).getTime() > (settings?.backupReminderDays ?? 7) * 86_400_000);
  return <UIContext.Provider value={{ error: notice?.error ? notice.text : '', pending, failure: notice?.report ?? null }}><div className="app-shell">
    <header className="app-header"><a href="#" className="brand" onClick={event => { event.preventDefault(); setTab('plan'); }}><span className="brand-symbol"><Icon name="spoon" size={28} /></span><span>おつかい<span className="brand-caption">献立と買い物のノート</span></span></a><span className={`save-status ${online ? '' : 'offline'}`}><span />{pending ? '処理中…' : online ? 'この端末に保存' : 'オフライン'}</span></header>
    <div className="content-shell">
      <nav className="tab-bar" aria-label="メインメニュー">{tabs.map(item => <button key={item.id} aria-current={tab === item.id ? 'page' : undefined} className={tab === item.id ? 'selected' : ''} onClick={() => { setTab(item.id); setNotice(null); }}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
      <main aria-busy={pending}>
        {error && <><ErrorBanner report={describeError(new AppError('DATA-2002', {}, error))} /><button className="button secondary" onClick={() => window.location.reload()}>再読み込み</button></>}
        {!data && !error && <div className="loading">献立ノートを開いています…</div>}
        {notice?.report ? <ErrorBanner report={notice.report} onDismiss={() => setNotice(null)} /> : notice && <div className="banner success" role="status"><span>{notice.text}</span><button aria-label="通知を閉じる" className="icon-button" onClick={() => setNotice(null)}>×</button></div>}
        {needRefresh && <div className="banner"><span>新しいバージョンがあります。入力を保存してから更新してください。</span><button className="text-button" onClick={() => void action(async () => { await updateServiceWorker(true); })}>更新する</button></div>}
        {data && <>
          {tab === 'plan' && <PlanPage data={data} week={week} setWeek={setWeek} action={action} onRecipes={() => setTab('recipes')} onShopping={async () => { if (await action(() => repository.generateShopping(week), '献立から買い物リストを作成しました')) setTab('shopping'); }} />}
          {tab === 'recipes' && <RecipesPage data={data} action={action} />}
          {tab === 'shopping' && <ShoppingPage data={data} week={week} setWeek={setWeek} action={action} />}
          {tab === 'pantry' && <PantryPage data={data} week={week} action={action} />}
          {tab === 'settings' && <SettingsPage data={data} action={action} offlineReady={offlineReady} />}
          {backupDue && tab !== 'settings' && <button className="backup-reminder" onClick={() => setTab('settings')}><span>データを守るために、バックアップを。</span><span>設定へ →</span></button>}
        </>}
      </main>
    </div>
  </div></UIContext.Provider>;
}
