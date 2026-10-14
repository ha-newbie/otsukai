import { useState, type FormEvent } from 'react';
import { type AppData, type PlannedMeal, slots, slotLabels } from '../domain/models';
import { addDays, dateLabel, localDate, monday, weekDates } from '../domain/dates';
import { repository } from '../persistence/repository';
import { Confirm, Empty, Icon, Modal, type Action } from './components';

export function WeekPicker({ week, setWeek }: { week: string; setWeek: (value: string) => void }) {
  return <div className="week-picker"><button className="icon-button previous" aria-label="前の週" onClick={() => setWeek(addDays(week, -7))}><Icon name="chevron" size={18} /></button><span>{dateLabel(week).replace(/\(.*\)/, '')} − {dateLabel(addDays(week, 6)).replace(/\(.*\)/, '')}<small>{week.slice(0, 4)}年</small></span><button className="icon-button" aria-label="次の週" onClick={() => setWeek(addDays(week, 7))}><Icon name="chevron" size={18} /></button><button className="text-button" onClick={() => setWeek(monday())}>今週</button></div>;
}
export function PlanPage({ data, week, setWeek, action, onRecipes, onShopping }: { data: AppData; week: string; setWeek: (value: string) => void; action: Action; onRecipes: () => void; onShopping: () => Promise<void> }) {
  const [editing, setEditing] = useState<{ date: string; slot: PlannedMeal['slot']; meal?: PlannedMeal } | null>(null);
  const [removing, setRemoving] = useState<PlannedMeal | null>(null);
  const [servingsDate, setServingsDate] = useState<string | null>(null);
  const [servingsValue, setServingsValue] = useState(2);
  const dates = weekDates(week);
  const weekMeals = data.meals.filter(meal => dates.includes(meal.date));
  const plannedDays = new Set(weekMeals.map(meal => meal.date)).size;
  const trip = data.trips.find(value => value.startsOn === week);
  return <>
    <div className="page-heading"><div><p className="eyebrow">いつものごはんを、心地よく。</p><h1>一週間の献立</h1><p className="subtle">食べたいものを並べたら、買い物もすっきり。</p></div></div>
    <div className="plan-summary"><div><span className="summary-icon"><Icon name="calendar" size={27} /></span><div><strong>{plannedDays}<small> / 7日</small></strong><span>献立が決まっています</span></div></div><button className="button primary" disabled={trip?.status === 'active' || trip?.status === 'completed' || addDays(week, 6) < localDate()} onClick={() => void onShopping()}><Icon name="basket" size={18} /><span>買い物リストを作成</span></button></div>
    {trip?.status === 'active' && <p className="help-text">買い物中のリストは保護されています。献立を編集しても購入チェックは変わりません。</p>}
    <div className="section-toolbar"><h2>週間カレンダー</h2><WeekPicker week={week} setWeek={setWeek} /></div>
    <div className="week-strip">{dates.map(date => <button key={date} className={date === localDate() ? 'today' : ''} aria-label={`${dateLabel(date)}へ移動`} onClick={() => document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><span>{new Date(`${date}T12:00:00`).toLocaleDateString('ja-JP', { weekday: 'short' })}</span><strong>{Number(date.slice(8))}</strong><span className={weekMeals.some(meal => meal.date === date) ? 'day-dot filled' : 'day-dot'} /></button>)}</div>
    {!data.recipes.length && <div className="welcome-note"><Icon name="book" /><div><strong>まずは、好きなレシピをひとつ。</strong><p>材料だけでも大丈夫。保存したレシピを献立に追加できます。</p></div><button className="text-button" onClick={onRecipes}>レシピを登録 →</button></div>}
    <div className="day-grid">{dates.map(date => {
      const servings = data.days.find(day => day.id === date)?.servings ?? data.settings[0]?.defaultServings ?? 2;
      return <section className={`day-card ${date === localDate() ? 'is-today' : ''}`} key={date} id={`day-${date}`}>
        <div className="day-header"><h3>{dateLabel(date)}{date === localDate() && <span className="badge">今日</span>}</h3><button className="text-button servings-button" aria-label={`${dateLabel(date)}の人数を変更`} onClick={() => { setServingsDate(date); setServingsValue(servings); }}>{servings}人分</button></div>
        {slots.map(slot => <div className="meal-slot" key={slot}><span className={`slot-label ${slot}`}>{slotLabels[slot]}</span><div className="slot-content">{weekMeals.filter(meal => meal.date === date && meal.slot === slot).map(meal => <div className="meal-entry" key={meal.id}><button className="meal-name" aria-label={`${data.recipes.find(recipe => recipe.id === meal.recipeId)?.title}の献立を移動`} onClick={() => setEditing({ date, slot, meal })}>{data.recipes.find(recipe => recipe.id === meal.recipeId)?.title}</button><button className="icon-button remove-meal" aria-label="献立から削除" onClick={() => setRemoving(meal)}>×</button></div>)}<button className="add-meal" aria-label={`${dateLabel(date)}の${slotLabels[slot]}にレシピ追加`} onClick={() => setEditing({ date, slot })}><Icon name="plus" size={16} />追加</button></div></div>)}
      </section>;
    })}</div>
    <p className="help-text">材料は日ごとの人数で換算します。過去日の献立は買い物の集計に含みません。</p>
    {editing && <MealForm data={data} initial={editing} action={action} onClose={() => setEditing(null)} onRecipes={() => { setEditing(null); onRecipes(); }} />}
    {removing && <Confirm title="献立から削除" destructive onClose={() => setRemoving(null)} onConfirm={() => void action(() => repository.deleteMeal(removing.id), '献立から削除しました').then(ok => { if (ok) setRemoving(null); })}><p>この予定を献立から削除します。レシピは保存されたままです。</p></Confirm>}
    {servingsDate && <Modal title="この日の人数" onClose={() => setServingsDate(null)}><form onSubmit={event => { event.preventDefault(); void action(() => repository.saveServings(servingsDate, servingsValue), '人数を変更しました').then(ok => { if (ok) setServingsDate(null); }); }}><p className="subtle">{dateLabel(servingsDate)}の朝・昼・夜に適用します。</p><label>人数<input type="number" min="1" max="100" step="1" required value={servingsValue} onChange={event => setServingsValue(Number(event.target.value))} /></label><button className="button primary full" type="submit">人数を保存</button></form></Modal>}
  </>;
}
function MealForm({ data, initial, action, onClose, onRecipes }: { data: AppData; initial: { date: string; slot: PlannedMeal['slot']; meal?: PlannedMeal }; action: Action; onClose: () => void; onRecipes: () => void }) {
  const [recipeId, setRecipeId] = useState(initial.meal?.recipeId ?? data.recipes[0]?.id ?? '');
  const [date, setDate] = useState(initial.date);
  const [slot, setSlot] = useState(initial.slot);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (await action(() => repository.saveMeal({ id: initial.meal?.id, recipeId, date, slot }), '献立を保存しました')) onClose(); };
  return <Modal title={initial.meal ? '献立を移動' : '献立に追加'} onClose={onClose}>{data.recipes.length ? <form onSubmit={event => void submit(event)}><label>レシピ<select value={recipeId} onChange={event => setRecipeId(event.target.value)}>{data.recipes.map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.title}</option>)}</select></label><div className="field-row"><label>日付<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label><label>時間帯<select value={slot} onChange={event => setSlot(event.target.value as PlannedMeal['slot'])}>{slots.map(value => <option key={value} value={value}>{slotLabels[value]}</option>)}</select></label></div><button className="button primary full" type="submit">{initial.meal ? '移動を保存' : '献立に追加する'}</button></form> : <Empty icon="book" title="レシピを登録しましょう" action={<button className="button primary" onClick={onRecipes}>レシピを登録</button>}>登録したレシピを献立に追加できます。</Empty>}</Modal>;
}
