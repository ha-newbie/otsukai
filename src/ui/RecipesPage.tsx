import { useState, type FormEvent } from 'react';
import type { AppData, Recipe } from '../domain/models';
import { amountLabel, scaledQuantity } from '../domain/calculations';
import { manualRecipeSchema, repository, type RecipeInput } from '../persistence/repository';
import { recipePrompt } from '../services/ai';
import { Confirm, Empty, Icon, IngredientFields, Modal, type Action } from './components';

export function RecipesPage({ data, action }: { data: AppData; action: Action }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null);
  const [detail, setDetail] = useState<Recipe | null>(null);
  const [removing, setRemoving] = useState<Recipe | null>(null);
  const [ai, setAI] = useState(false);
  const ingredientName = (id: string) => data.ingredients.find(value => value.id === id)?.name ?? '';
  const filtered = data.recipes.filter(recipe => `${recipe.title} ${recipe.source} ${recipe.ingredients.map(value => ingredientName(value.ingredientId)).join(' ')}`.normalize('NFKC').toLocaleLowerCase('ja').includes(query.normalize('NFKC').toLocaleLowerCase('ja')));
  return <>
    <div className="page-heading"><div><p className="eyebrow">また作りたい、を集めよう。</p><h1>レシピノート</h1><p className="subtle">材料だけのメモも、いつもの一品も。</p></div><button className="button primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} />レシピを追加</button></div>
    <div className="search-field"><Icon name="search" size={20} /><input aria-label="レシピを検索" placeholder="料理名や食材で検索" value={query} onChange={event => setQuery(event.target.value)} /><span>{filtered.length}件</span></div>
    {!data.recipes.length ? <Empty icon="book" title="あなたの定番を、ここに。" action={<button className="button primary" onClick={() => setEditing('new')}>はじめてのレシピを登録</button>}>料理名と材料を入れるだけ。<br />手順や出典は、あとからでも追加できます。</Empty> : !filtered.length ? <Empty icon="book" title="レシピが見つかりません">別の料理名や食材で検索してください。</Empty> : <div className="recipe-grid">{filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(recipe => <button className="recipe-card" key={recipe.id} onClick={() => setDetail(recipe)}><div className="recipe-card-top"><span className="recipe-mark"><Icon name="book" size={28} /></span><span className="badge neutral">{recipe.servings}人分</span></div><h2>{recipe.title}</h2><p>{recipe.ingredients.slice(0, 4).map(value => ingredientName(value.ingredientId)).join('・')}{recipe.ingredients.length > 4 ? ' ほか' : ''}</p><div className="recipe-card-bottom"><span>{recipe.ingredients.length}種類の材料</span><Icon name="chevron" size={17} /></div></button>)}</div>}
    <div className="small-panel"><div><strong>ChatGPTでレシピを整理</strong><p className="subtle">プロンプトをコピーして、回答のJSONを取り込めます。</p></div><button className="text-button" onClick={() => setAI(true)}>手動で取り込む →</button></div>
    {editing && <RecipeForm data={data} recipe={editing === 'new' ? undefined : editing} action={action} onClose={() => setEditing(null)} />}
    {detail && <RecipeDetail data={data} recipe={detail} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); }} onDelete={() => { setRemoving(detail); setDetail(null); }} />}
    {removing && <Confirm title="レシピを削除" destructive onClose={() => setRemoving(null)} onConfirm={() => void action(() => repository.deleteRecipe(removing.id), 'レシピを削除しました').then(ok => { if (ok) setRemoving(null); })}><p>「{removing.title}」と、このレシピを使う献立の予定を削除します。保存済みの買い物リストは維持されます。</p></Confirm>}
    {ai && <AIImport action={action} onClose={() => setAI(false)} />}
  </>;
}
function RecipeForm({ data, recipe, action, onClose }: { data: AppData; recipe?: Recipe; action: Action; onClose: () => void }) {
  const [value, setValue] = useState<RecipeInput>({
    id: recipe?.id, title: recipe?.title ?? '', servings: recipe?.servings ?? data.settings[0]?.defaultServings ?? 2,
    steps: recipe?.steps ?? '', sourceUrl: recipe?.sourceUrl ?? '', source: recipe?.source ?? '',
    ingredients: recipe?.ingredients.map(item => ({ ...item, name: data.ingredients.find(value => value.id === item.ingredientId)?.name ?? '', categoryId: data.ingredients.find(value => value.id === item.ingredientId)?.categoryId ?? 'other' })) ?? [{ name: '', quantity: 1, unit: '個', categoryId: 'vegetable' }],
  });
  const submit = async (event: FormEvent) => { event.preventDefault(); if (await action(() => repository.saveRecipe(value), 'レシピを保存しました')) onClose(); };
  return <Modal title={recipe ? 'レシピを編集' : 'レシピを登録'} onClose={onClose}><form onSubmit={event => void submit(event)}>
    <label>料理名<input required maxLength={100} value={value.title} placeholder="例：にんじんと鶏肉のスープ" onChange={event => setValue({ ...value, title: event.target.value })} /></label>
    <label>基本の人数<input type="number" inputMode="numeric" min="1" max="100" step="1" required value={value.servings} onChange={event => setValue({ ...value, servings: Number(event.target.value) })} /></label>
    <div className="form-section-title"><h3>材料</h3><span className="subtle">数量不明は「適量」を選択</span></div>
    {value.ingredients.map((ingredient, index) => <div className="ingredient-editor" key={index}><IngredientFields value={ingredient} index={index} categories={data.categories} onChange={updated => setValue({ ...value, ingredients: value.ingredients.map((item, itemIndex) => itemIndex === index ? updated : item) })} />{value.ingredients.length > 1 && <button type="button" className="text-button danger-text" aria-label={`材料${index + 1}を削除`} onClick={() => setValue({ ...value, ingredients: value.ingredients.filter((_, itemIndex) => itemIndex !== index) })}>この材料を削除</button>}</div>)}
    <button type="button" className="button secondary full" disabled={value.ingredients.length >= 100} onClick={() => setValue({ ...value, ingredients: [...value.ingredients, { name: '', quantity: 1, unit: '個', categoryId: 'vegetable' }] })}><Icon name="plus" size={18} />材料を追加</button>
    <label>作り方 <span className="optional">任意</span><textarea value={value.steps} maxLength={20000} rows={4} placeholder="材料だけのレシピなら空欄でOK" onChange={event => setValue({ ...value, steps: event.target.value })} /></label>
    <label>元レシピのURL <span className="optional">任意</span><input type="url" maxLength={2000} value={value.sourceUrl} placeholder="https://…" onChange={event => setValue({ ...value, sourceUrl: event.target.value })} /></label>
    <label>出典 <span className="optional">任意</span><input maxLength={200} value={value.source} placeholder="例：家族のレシピ、料理サイト名" onChange={event => setValue({ ...value, source: event.target.value })} /></label>
    <p className="help-text">同じ食材名は共通の食材として保存します。カテゴリは最初に登録した設定を使います。</p>
    <button type="submit" className="button primary full">レシピを保存</button>
  </form></Modal>;
}
function RecipeDetail({ data, recipe, onClose, onEdit, onDelete }: { data: AppData; recipe: Recipe; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const [servings, setServings] = useState(recipe.servings);
  return <Modal title={recipe.title} onClose={onClose}><div className="detail-servings"><span>材料の人数換算</span><label><span className="sr-only">換算する人数</span><input type="number" min="1" max="100" step="1" value={servings} onChange={event => setServings(Math.min(100, Math.max(1, Number(event.target.value))))} /></label><span>人分</span></div><ul className="ingredient-list">{recipe.ingredients.map((ingredient, index) => <li key={index}><span>{data.ingredients.find(value => value.id === ingredient.ingredientId)?.name}</span><strong>{amountLabel(scaledQuantity(ingredient, recipe.servings, servings), ingredient.unit)}</strong></li>)}</ul>
    <h3>作り方</h3><p className="steps">{recipe.steps || '材料だけのレシピです。'}</p>{recipe.source && <p className="subtle">出典：{recipe.source}</p>}{recipe.sourceUrl && <a className="source-link" href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">元レシピを見る ↗</a>}<div className="form-actions"><button className="button secondary" onClick={onEdit}>編集する</button><button className="text-button danger-text" onClick={onDelete}>削除する</button></div></Modal>;
}
function AIImport({ action, onClose }: { action: Action; onClose: () => void }) {
  const [text, setText] = useState('');
  const [json, setJSON] = useState('');
  const [candidate, setCandidate] = useState<RecipeInput | null>(null);
  return <Modal title="ChatGPTから手動取込" onClose={onClose}><p className="subtle">ChatGPTに貼り付けて使います。アプリからの直接接続・認証・課金はありません。</p><label>整理したいレシピの本文やURL<textarea rows={3} maxLength={20000} value={text} onChange={event => setText(event.target.value)} /></label><button className="button secondary full" onClick={() => void action(async () => { if (!navigator.clipboard) throw new Error('コピーに対応していません。下のプロンプトを選択してコピーしてください'); await navigator.clipboard.writeText(recipePrompt(text)); }, 'プロンプトをコピーしました')}>プロンプトをコピー</button><details><summary>プロンプトを表示</summary><textarea readOnly rows={6} aria-label="コピー用プロンプト" value={recipePrompt(text)} /></details><label>回答のレシピJSON<textarea rows={6} maxLength={100000} value={json} onChange={event => { setJSON(event.target.value); setCandidate(null); }} placeholder='{"title":"…","servings":2,"ingredients":[…],"steps":"","source":"","sourceUrl":""}' /></label><button className="button secondary full" onClick={() => void action(async () => { const parsed: unknown = JSON.parse(json); setCandidate(manualRecipeSchema.parse(parsed)); }, 'JSONを検証しました。内容を確認して保存してください')}>JSONを検証する</button>{candidate && <div className="import-preview"><h3>{candidate.title}（{candidate.servings}人分）</h3><ul>{candidate.ingredients.map((item, index) => <li key={index}>{item.name}：{amountLabel(item.quantity, item.unit)}</li>)}</ul><p className="steps">{candidate.steps || '手順なし'}</p><p className="subtle">出典：{candidate.source || 'なし'}</p><button className="button primary full" onClick={() => void action(() => repository.saveRecipe(candidate), 'レシピを取り込みました').then(ok => { if (ok) onClose(); })}>この内容で保存する</button></div>}</Modal>;
}
