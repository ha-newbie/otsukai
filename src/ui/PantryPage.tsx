import { useState } from 'react';
import type { AppData, PantryStock, Unit } from '../domain/models';
import { amountLabel, forecastPantry } from '../domain/calculations';
import { addDays, dateLabel, localDate } from '../domain/dates';
import { repository } from '../persistence/repository';
import { Confirm, Empty, Icon, Modal, UnitSelect, type Action } from './components';

export function PantryPage({ data, week, action }: { data: AppData; week: string; action: Action }) {
  const [editing, setEditing] = useState<PantryStock | 'new' | null>(null);
  const [removing, setRemoving] = useState<PantryStock | null>(null);
  const [query, setQuery] = useState('');
  const today = localDate();
  const through = addDays(week, 6);
  const remaining = forecastPantry(data, today, through);
  const ingredient = (id: string) => data.ingredients.find(value => value.id === id);
  const filtered = data.pantry.filter(stock => ingredient(stock.ingredientId)?.name.normalize('NFKC').includes(query.normalize('NFKC')));
  const expiring = data.pantry.filter(stock => stock.quantity > 0 && stock.expiresOn && stock.expiresOn <= addDays(today, 3));
  return <>
    <div className="page-heading"><div><p className="eyebrow">家にあるものから、使い切る。</p><h1>わが家の在庫</h1><p className="subtle">実際の残量と、献立で使う予定を見比べられます。</p></div><button className="button primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} />在庫を追加</button></div>
    <div className="search-field"><Icon name="search" size={20} /><input aria-label="在庫を検索" placeholder="食材名で検索" value={query} onChange={event => setQuery(event.target.value)} /><span>{filtered.length}件</span></div>
    {expiring.length > 0 && <div className="expiry-banner"><strong>期限を確認したい食材が {expiring.length} 件あります</strong><p>期限切れの在庫は、その日の献立に割り当てません。</p></div>}
    <div className="section-toolbar"><h2>食材一覧</h2><span className="subtle">予定残量：{dateLabel(through)}まで</span></div>
    {!data.pantry.length ? <Empty icon="pantry" title="冷蔵庫の中を、ひと目で。" action={<button className="button primary" onClick={() => setEditing('new')}>在庫を登録する</button>}>在庫を登録すると、献立の買い物から<br />必要な分だけ差し引けます。</Empty> : !filtered.length ? <Empty icon="pantry" title="在庫が見つかりません">別の食材名で検索してください。</Empty> : <div className="pantry-list">{[...filtered].sort((a, b) => (a.expiresOn || '9999').localeCompare(b.expiresOn || '9999')).map(stock => {
      const after = remaining.get(stock.id) ?? stock.quantity;
      const expired = stock.expiresOn && stock.expiresOn < today;
      const soon = stock.expiresOn && stock.expiresOn <= addDays(today, 3);
      return <div className="pantry-row" key={stock.id}><button className="pantry-edit" aria-label={`${ingredient(stock.ingredientId)?.name}の在庫を編集`} onClick={() => setEditing(stock)}><span className="pantry-symbol"><Icon name="pantry" size={22} /></span><span className="pantry-name"><strong>{ingredient(stock.ingredientId)?.name}</strong><span className={soon ? 'expiry-warning' : ''}>{stock.expiresOn ? `${expired ? '期限切れ' : '期限'}：${dateLabel(stock.expiresOn)}` : '期限未設定'}</span></span><span className="pantry-quantity"><strong>{amountLabel(stock.quantity, stock.unit)}</strong><span className={after < stock.quantity ? 'reserved' : ''}>予定残量 {amountLabel(after, stock.unit)}</span></span></button><button className="icon-button" aria-label={`${ingredient(stock.ingredientId)?.name}の在庫を削除`} onClick={() => setRemoving(stock)}>×</button></div>;
    })}</div>}
    <div className="small-panel"><div><strong>料理に使った分は、残量を更新</strong><p className="subtle">予定残量は見込みです。調理による自動消費は行わないため、実際の残量は食材をタップして修正してください。</p></div></div>
    {editing && <StockForm data={data} stock={editing === 'new' ? undefined : editing} action={action} onClose={() => setEditing(null)} />}
    {removing && <Confirm title="在庫を削除" destructive onClose={() => setRemoving(null)} onConfirm={() => void action(() => repository.deleteStock(removing.id), '在庫を削除しました').then(ok => { if (ok) setRemoving(null); })}><p>「{ingredient(removing.ingredientId)?.name}」のこの在庫を削除します。買い物中のリストは変わりません。</p></Confirm>}
  </>;
}
function StockForm({ data, stock, action, onClose }: { data: AppData; stock?: PantryStock; action: Action; onClose: () => void }) {
  const ingredient = data.ingredients.find(value => value.id === stock?.ingredientId);
  const [name, setName] = useState(ingredient?.name ?? '');
  const [quantity, setQuantity] = useState(stock?.quantity ?? 1);
  const [unit, setUnit] = useState<Unit>(stock?.unit ?? '個');
  const [categoryId, setCategoryId] = useState(ingredient?.categoryId ?? 'vegetable');
  const [expiresOn, setExpiresOn] = useState(stock?.expiresOn ?? '');
  return <Modal title={stock ? '在庫を編集' : '在庫を登録'} onClose={onClose}><form onSubmit={event => { event.preventDefault(); if (unit === '適量') return; void action(() => repository.saveStock({ id: stock?.id, name, quantity, unit, categoryId, expiresOn }), '在庫を保存しました').then(ok => { if (ok) onClose(); }); }}><label>食材名<input required maxLength={100} value={name} placeholder="例：にんじん" onChange={event => setName(event.target.value)} /></label><div className="field-row"><label>在庫の数量<input type="number" inputMode="decimal" min="0" max="1000000" step="0.001" required value={quantity} onChange={event => setQuantity(Number(event.target.value))} /></label><UnitSelect value={unit} onChange={setUnit} stock /></div><label>カテゴリ<select value={categoryId} onChange={event => setCategoryId(event.target.value)}>{data.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>期限 <span className="optional">任意</span><input type="date" value={expiresOn} onChange={event => setExpiresOn(event.target.value)} /></label><button className="button primary full" type="submit">在庫を保存</button></form></Modal>;
}
