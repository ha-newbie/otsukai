import type { AppData } from '../domain/models';
import type { RecipeInput } from '../domain/recipe-input';
import { Icon, IngredientFields } from './components';

export function RecipeFields({ value, onChange, categories }: { value: RecipeInput; onChange: (value: RecipeInput) => void; categories: AppData['categories'] }) {
  return <>
    <label>料理名<input required maxLength={100} value={value.title} placeholder="例：にんじんと鶏肉のスープ" onChange={event => onChange({ ...value, title: event.target.value })} /></label>
    <label>基本の人数<input type="number" inputMode="numeric" min="1" max="100" step="1" required value={value.servings} onChange={event => onChange({ ...value, servings: Number(event.target.value) })} /></label>
    <div className="form-section-title"><h3>材料</h3><span className="subtle">数量不明は「適量」を選択</span></div>
    {value.ingredients.map((ingredient, index) => <div className="ingredient-editor" key={index}><IngredientFields value={ingredient} index={index} categories={categories} onChange={updated => onChange({ ...value, ingredients: value.ingredients.map((item, itemIndex) => itemIndex === index ? updated : item) })} />{value.ingredients.length > 1 && <button type="button" className="text-button danger-text" aria-label={`材料${index + 1}を削除`} onClick={() => onChange({ ...value, ingredients: value.ingredients.filter((_, itemIndex) => itemIndex !== index) })}>この材料を削除</button>}</div>)}
    <button type="button" className="button secondary full" disabled={value.ingredients.length >= 100} onClick={() => onChange({ ...value, ingredients: [...value.ingredients, { name: '', quantity: 1, unit: '個', categoryId: 'vegetable' }] })}><Icon name="plus" size={18} />材料を追加</button>
    <label>作り方 <span className="optional">任意</span><textarea value={value.steps} maxLength={20000} rows={4} placeholder="材料だけのレシピなら空欄でOK" onChange={event => onChange({ ...value, steps: event.target.value })} /></label>
    <label>元レシピのURL <span className="optional">任意</span><input type="url" maxLength={2000} value={value.sourceUrl} placeholder="https://…" onChange={event => onChange({ ...value, sourceUrl: event.target.value })} /></label>
    <label>出典 <span className="optional">任意</span><input maxLength={200} value={value.source} placeholder="例：家族のレシピ、料理サイト名" onChange={event => onChange({ ...value, source: event.target.value })} /></label>
    <p className="help-text">同じ食材名は共通の食材として保存します。カテゴリは最初に登録した設定を使います。</p>
  </>;
}
