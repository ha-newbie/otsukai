import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { units, type AppData, type Unit } from '../domain/models';
import type { IngredientInput } from '../persistence/repository';
import type { ErrorReport } from '../services/diagnostics';
import { ErrorBanner } from './ErrorBanner';

export type Action = (operation: () => Promise<void>, message?: string) => Promise<boolean>;
export const UIContext = createContext<{ error: string; pending: boolean; failure: ErrorReport | null; queuedImport: boolean }>({ error: '', pending: false, failure: null, queuedImport: false });
export function Icon({ name, size = 22 }: { name: 'calendar' | 'book' | 'basket' | 'pantry' | 'settings' | 'plus' | 'chevron' | 'check' | 'spoon' | 'search'; size?: number }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18M7 15h2m4 0h2m-8 3h2" /></>,
    book: <><path d="M12 5C8 2 4 3 2 4v15c3-2 7-1 10 1 3-2 7-3 10-1V4c-2-1-6-2-10 1Z" /><path d="M12 5v15M6 8h2m8 0h2M6 12h2m8 0h2" /></>,
    basket: <><path d="m4 9 2 11h12l2-11H4Zm4 0 4-6 4 6M9 13v3m6-3v3M2 9h20" /></>,
    pantry: <><rect x="5" y="2" width="14" height="20" rx="3" /><path d="M5 10h14M8 5v2m0 7v3" /></>,
    settings: <><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    check: <path d="m5 12 4 4L19 6" />,
    spoon: <><ellipse cx="15" cy="7" rx="4" ry="6" transform="rotate(35 15 7)" /><path d="m12 12-7 9" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { error, pending, failure, queuedImport } = useContext(UIContext);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} onCancel={event => { if (pending) event.preventDefault(); else onClose(); }} aria-label={title}>
    <div className="dialog-header"><h2>{title}</h2><button type="button" className="icon-button" disabled={pending} onClick={onClose} aria-label="閉じる">×</button></div>
    <div className="dialog-body">{queuedImport && <div className="banner" role="status">共有した材料を受け取りました。この入力を保存するか閉じてから「受け取った材料を確認」を押してください。</div>}{failure ? <ErrorBanner report={failure} /> : error && <div className="banner error" role="alert">{error}</div>}<fieldset disabled={pending}>{children}</fieldset></div>
  </dialog>;
}
export function Confirm({ title, children, onConfirm, onClose, destructive = false }: { title: string; children: ReactNode; onConfirm: () => void; onClose: () => void; destructive?: boolean }) {
  return <Modal title={title} onClose={onClose}><div className="confirm-copy">{children}</div><div className="form-actions"><button className="button secondary" onClick={onClose}>キャンセル</button><button className={`button ${destructive ? 'danger' : 'primary'}`} onClick={onConfirm}>{destructive ? '削除する' : '実行する'}</button></div></Modal>;
}
export function Empty({ icon, title, children, action }: { icon: 'calendar' | 'book' | 'basket' | 'pantry'; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><div className="empty-icon"><Icon name={icon} size={36} /></div><h3>{title}</h3><p>{children}</p>{action}</div>;
}
export function UnitSelect({ value, onChange, stock = false, label = '単位' }: { value: Unit; onChange: (unit: Unit) => void; stock?: boolean; label?: string }) {
  return <label>{label}<select value={value} onChange={event => onChange(event.target.value as Unit)}>{units.filter(unit => !stock || unit !== '適量').map(unit => <option key={unit}>{unit}</option>)}</select></label>;
}
export function IngredientFields({ value, onChange, categories, index }: { value: IngredientInput; onChange: (value: IngredientInput) => void; categories: AppData['categories']; index?: number }) {
  const prefix = index === undefined ? '' : `材料${index + 1}の`;
  return <div className="ingredient-fields">
    <label className="ingredient-name">{prefix}食材名<input aria-label={`${prefix}食材名`} value={value.name} required maxLength={100} placeholder="例：にんじん" onChange={event => onChange({ ...value, name: event.target.value })} /></label>
    <div className="field-row"><label>{prefix}数量<input aria-label={`${prefix}数量`} type="number" inputMode="decimal" min="0" max="1000000" step="0.001" required={value.unit !== '適量'} disabled={value.unit === '適量'} value={value.quantity ?? ''} onChange={event => onChange({ ...value, quantity: event.target.value === '' ? null : Number(event.target.value) })} /></label>
    <UnitSelect label={`${prefix}単位`} value={value.unit} onChange={unit => onChange({ ...value, unit, quantity: unit === '適量' ? null : value.quantity ?? 1 })} />
    <label>{prefix}カテゴリ<select value={value.categoryId} onChange={event => onChange({ ...value, categoryId: event.target.value })}>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
  </div>;
}
