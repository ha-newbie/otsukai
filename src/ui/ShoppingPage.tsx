import { useState } from 'react';
import type { AppData, ShoppingItem } from '../domain/models';
import { amountLabel } from '../domain/calculations';
import { addDays, dateLabel, localDate } from '../domain/dates';
import { repository, type IngredientInput } from '../persistence/repository';
import { Confirm, Empty, Icon, IngredientFields, Modal, type Action } from './components';
import { WeekPicker } from './PlanPage';

export function ShoppingPage({ data, week, setWeek, action }: { data: AppData; week: string; setWeek: (value: string) => void; action: Action }) {
  const [adding, setAdding] = useState(false);
  const [adjusting, setAdjusting] = useState<ShoppingItem | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState(1);
  const [removing, setRemoving] = useState<ShoppingItem | null>(null);
  const [completing, setCompleting] = useState(false);
  const [hideChecked, setHideChecked] = useState(false);
  const trip = data.trips.find(value => value.startsOn === week);
  const openTrip = data.trips.find(value => value.status !== 'completed');
  const items = data.shoppingItems.filter(item => item.tripId === trip?.id);
  const toBuy = items.filter(item => item.quantity !== 0);
  const checked = toBuy.filter(item => item.checked).length;
  const complete = trip?.status === 'completed';
  const canGenerate = (!trip || trip.status === 'draft') && (!openTrip || openTrip.id === trip?.id) && addDays(week, 6) >= localDate();
  const ingredient = (id: string) => data.ingredients.find(value => value.id === id);
  const excludedCategories = data.categories.filter(category => data.settings[0]?.excludedShoppingCategoryIds.includes(category.id));
  return <>
    <div className="page-heading"><div><p className="eyebrow">必要なものだけ、忘れずに。</p><h1>買い物リスト</h1><p className="subtle">タップして購入チェック。途中で閉じても保存されます。</p></div><button className="button primary" disabled={complete || (!!openTrip && openTrip.id !== trip?.id) || addDays(week, 6) < localDate()} onClick={() => setAdding(true)}><Icon name="plus" size={18} />品目を追加</button></div>
    <div className="section-toolbar"><h2>{complete ? '買い物完了' : trip?.status === 'active' ? '買い物中' : '今週の買い物'}</h2><WeekPicker week={week} setWeek={setWeek} /></div>
    {!!excludedCategories.length && <p className="help-text">献立からの集計対象外：{excludedCategories.map(category => category.name).join('・')}。設定で変更できます。買い足す場合は「品目を追加」を使います。作成済みリストへは開始前の再集計で反映します。</p>}
    {openTrip && openTrip.startsOn !== week && <div className="banner"><span>{dateLabel(openTrip.startsOn)}からのリストが進行中です。</span><button className="text-button" onClick={() => setWeek(openTrip.startsOn)}>リストを開く</button></div>}
    {!trip ? <Empty icon="basket" title="献立から、買い物へ。" action={canGenerate ? <button className="button primary" onClick={() => void action(() => repository.generateShopping(week), '買い物リストを作成しました')}>献立からリストを作成</button> : undefined}>食材をまとめて、在庫分を差し引きます。<br />買いたいものを直接追加することもできます。</Empty> : <>
      <div className="shopping-progress"><div><strong>{checked}<span> / {toBuy.length}</span></strong><p>{complete ? '購入した品目' : '購入チェック済み'}</p></div><div className="progress-track" role="progressbar" aria-label="購入進捗" aria-valuenow={checked} aria-valuemin={0} aria-valuemax={Math.max(1, toBuy.length)}><span style={{ width: `${toBuy.length ? checked / toBuy.length * 100 : 0}%` }} /></div><Icon name={complete ? 'check' : 'basket'} size={34} /></div>
      <div className="shopping-toolbar"><label className="checkbox-label"><input type="checkbox" checked={hideChecked} onChange={event => setHideChecked(event.target.checked)} />チェック済みを隠す</label>{canGenerate && <button className="text-button" onClick={() => void action(() => repository.generateShopping(week), '手動品目・数量調整を残して再集計しました')}>献立から再集計</button>}</div>
      {trip.status === 'active' && <p className="help-text">買い物開始時のリストを保持しています。献立の変更は自動反映しません。</p>}
      {!toBuy.length && <div className="all-stocked"><Icon name="check" /><div><strong>集計対象の食材は購入不要です</strong><p>除外した調味料などを買う場合は、品目を追加してください。</p></div></div>}
      {data.categories.map(category => {
        const categoryItems = items.filter(item => ingredient(item.ingredientId)?.categoryId === category.id && (!hideChecked || !item.checked));
        if (!categoryItems.length) return null;
        return <section className="shopping-category" key={category.id}><h2>{category.name}<span>{categoryItems.filter(item => item.quantity !== 0).length}</span></h2><div className="shopping-list">{categoryItems.map(item => <div className={`shopping-row ${item.checked ? 'checked' : ''} ${item.quantity === 0 ? 'stocked' : ''}`} key={item.id}>
          <button className="shopping-check" role="checkbox" aria-checked={item.checked} aria-label={`${ingredient(item.ingredientId)?.name}を購入チェック`} disabled={complete || item.quantity === 0} onClick={() => void action(() => repository.toggleShopping(item.id))}><span className="check-circle">{item.checked && <Icon name="check" size={18} />}</span><span className="shopping-name"><strong>{ingredient(item.ingredientId)?.name}</strong><span>{item.quantity === 0 ? '在庫で足りています' : item.source === 'manual' ? '直接追加' : item.pantryQuantity > 0 ? `必要 ${amountLabel(item.plannedQuantity, item.unit)} − 在庫 ${amountLabel(item.pantryQuantity, item.unit)}` : '献立から追加'}</span></span></button>
          <button className="quantity-button" aria-label={`${ingredient(item.ingredientId)?.name}の購入数量を調整`} disabled={complete || item.unit === '適量'} onClick={() => { setAdjusting(item); setAdjustQuantity(item.quantity ?? 1); }}>{amountLabel(item.quantity, item.unit)}{item.quantityOverride !== null && <span className="adjusted-dot" aria-label="手動調整済み" />}</button>
          {!complete && <button className="icon-button remove-item" aria-label={`${ingredient(item.ingredientId)?.name}をリストから削除`} onClick={() => setRemoving(item)}>×</button>}
        </div>)}</div></section>;
      })}
      {complete ? <div className="completed-note"><Icon name="check" /><p>購入チェック済みの食材を在庫に反映しました。<br />「適量」の品目は在庫で数量を登録してください。</p></div> : <div className="finish-shopping"><button className="button primary full" onClick={() => setCompleting(true)}><Icon name="check" size={18} />買い物を完了して在庫に反映</button><p className="help-text">チェックした数量だけ追加します。「適量」は手動登録が必要です。</p></div>}
    </>}
    {adding && <ShoppingAdd data={data} week={week} action={action} onClose={() => setAdding(false)} />}
    {adjusting && <Modal title="購入数量を調整" onClose={() => setAdjusting(null)}><form onSubmit={event => { event.preventDefault(); void action(() => repository.adjustShopping(adjusting.id, adjustQuantity), '購入数量を変更しました').then(ok => { if (ok) setAdjusting(null); }); }}><p>{ingredient(adjusting.ingredientId)?.name}</p><label>購入量（{adjusting.unit}）<input type="number" inputMode="decimal" min="0" max="1000000" step="0.001" required value={adjustQuantity} onChange={event => setAdjustQuantity(Number(event.target.value))} /></label><p className="help-text">0にすると購入不要になります。単位はリストの集計時の単位です。</p><button className="button primary full" type="submit">数量を保存</button></form></Modal>}
    {removing && <Confirm title="品目を削除" destructive onClose={() => setRemoving(null)} onConfirm={() => void action(() => repository.deleteShopping(removing.id), '品目を削除しました').then(ok => { if (ok) setRemoving(null); })}><p>「{ingredient(removing.ingredientId)?.name}」をこの買い物リストから削除します。</p></Confirm>}
    {completing && trip && <Confirm title="買い物を完了しますか？" onClose={() => setCompleting(false)} onConfirm={() => void action(() => repository.completeShopping(trip.id), '購入した食材を在庫に反映しました').then(ok => { if (ok) setCompleting(false); })}><p>{checked}品目に購入チェックがついています。未チェックの品目は在庫に追加されません。</p><p>完了後、この週のリストは変更・再集計できません。数量とチェック状態を確認してください。</p></Confirm>}
  </>;
}
function ShoppingAdd({ data, week, action, onClose }: { data: AppData; week: string; action: Action; onClose: () => void }) {
  const [value, setValue] = useState<IngredientInput>({ name: '', quantity: 1, unit: '個', categoryId: 'other' });
  return <Modal title="買うものを追加" onClose={onClose}><form onSubmit={event => { event.preventDefault(); void action(() => repository.addShopping(value, week), '買い物リストに追加しました').then(ok => { if (ok) onClose(); }); }}><IngredientFields value={value} onChange={setValue} categories={data.categories} /><p className="help-text">直接追加した品目からは在庫を差し引きません。</p><button type="submit" className="button primary full">リストに追加</button></form></Modal>;
}
