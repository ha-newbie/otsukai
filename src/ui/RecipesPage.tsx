import { useState, type FormEvent } from 'react';
import type { AppData, Recipe } from '../domain/models';
import { amountLabel, scaledQuantity } from '../domain/calculations';
import { repository, type RecipeInput } from '../persistence/repository';
import { RecipeImport } from './RecipeImport';
import { RecipeFields } from './RecipeFields';
import { Confirm, Empty, Icon, Modal, type Action } from './components';
import { parsePageCapture, readSharedCapture } from '../services/page-capture';
import { currentAppUrl } from '../services/import-handoff';

export function RecipesPage({ data, action }: { data: AppData; action: Action }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null);
  const [detail, setDetail] = useState<Recipe | null>(null);
  const [removing, setRemoving] = useState<Recipe | null>(null);
  const [ai, setAI] = useState(false);
  const [sharedCapture, setSharedCapture] = useState<string>();
  const ingredientName = (id: string) => data.ingredients.find(value => value.id === id)?.name ?? '';
  const filtered = data.recipes.filter(recipe => `${recipe.title} ${recipe.source} ${recipe.ingredients.map(value => ingredientName(value.ingredientId)).join(' ')}`.normalize('NFKC').toLocaleLowerCase('ja').includes(query.normalize('NFKC').toLocaleLowerCase('ja')));
  return <>
    <div className="page-heading"><div><p className="eyebrow">また作りたい、を集めよう。</p><h1>レシピノート</h1><p className="subtle">材料だけのメモも、いつもの一品も。</p></div><button className="button primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} />レシピを追加</button></div>
    <div className="search-field"><Icon name="search" size={20} /><input aria-label="レシピを検索" placeholder="料理名や食材で検索" value={query} onChange={event => setQuery(event.target.value)} /><span>{filtered.length}件</span></div>
    {!data.recipes.length ? <Empty icon="book" title="あなたの定番を、ここに。" action={<button className="button primary" onClick={() => setEditing('new')}>はじめてのレシピを登録</button>}>料理名と材料を入れるだけ。<br />手順や出典は、あとからでも追加できます。</Empty> : !filtered.length ? <Empty icon="book" title="レシピが見つかりません">別の料理名や食材で検索してください。</Empty> : <div className="recipe-grid">{filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(recipe => <button className="recipe-card" key={recipe.id} onClick={() => setDetail(recipe)}><div className="recipe-card-top"><span className="recipe-mark"><Icon name="book" size={28} /></span><span className="badge neutral">{recipe.servings}人分</span></div><h2>{recipe.title}</h2><p>{recipe.ingredients.slice(0, 4).map(value => ingredientName(value.ingredientId)).join('・')}{recipe.ingredients.length > 4 ? ' ほか' : ''}</p><div className="recipe-card-bottom"><span>{recipe.ingredients.length}種類の材料</span><Icon name="chevron" size={17} /></div></button>)}</div>}
    <div className="small-panel"><div><strong>外部サイトのレシピを取り込む</strong><p className="subtle">Safariの共有で取得した材料を受け取れます。初回設定は取込画面にあります。</p><button className="button secondary" onClick={() => void action(async () => {
      const input = await readSharedCapture(currentAppUrl());
      parsePageCapture(input, { defaultServings: data.settings[0]?.defaultServings ?? 2 });
      setSharedCapture(input); setAI(true);
    })}>共有した材料を取り込む</button><p className="help-text">押したときだけクリップボードを読み取ります。iOSが貼付の許可を求める場合があります。</p></div><button className="text-button" onClick={() => { setSharedCapture(undefined); setAI(true); }}>レシピを取り込む →</button></div>
    {editing && <RecipeForm data={data} recipe={editing === 'new' ? undefined : editing} action={action} onClose={() => setEditing(null)} />}
    {detail && <RecipeDetail data={data} recipe={detail} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); }} onDelete={() => { setRemoving(detail); setDetail(null); }} />}
    {removing && <Confirm title="レシピを削除" destructive onClose={() => setRemoving(null)} onConfirm={() => void action(() => repository.deleteRecipe(removing.id), 'レシピを削除しました').then(ok => { if (ok) setRemoving(null); })}><p>「{removing.title}」と、このレシピを使う献立の予定を削除します。保存済みの買い物リストは維持されます。</p></Confirm>}
    {ai && <RecipeImport data={data} action={action} initialPageCapture={sharedCapture} onClose={() => { setAI(false); setSharedCapture(undefined); }} />}
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
    <RecipeFields value={value} onChange={setValue} categories={data.categories} />
    <button type="submit" className="button primary full">レシピを保存</button>
  </form></Modal>;
}
function RecipeDetail({ data, recipe, onClose, onEdit, onDelete }: { data: AppData; recipe: Recipe; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const [servings, setServings] = useState(recipe.servings);
  return <Modal title={recipe.title} onClose={onClose}><div className="detail-servings"><span>材料の人数換算</span><label><span className="sr-only">換算する人数</span><input type="number" min="1" max="100" step="1" value={servings} onChange={event => setServings(Math.min(100, Math.max(1, Number(event.target.value))))} /></label><span>人分</span></div><ul className="ingredient-list">{recipe.ingredients.map((ingredient, index) => <li key={index}><span>{data.ingredients.find(value => value.id === ingredient.ingredientId)?.name}</span><strong>{amountLabel(scaledQuantity(ingredient, recipe.servings, servings), ingredient.unit)}</strong></li>)}</ul>
    <h3>作り方</h3><p className="steps">{recipe.steps || '材料だけのレシピです。'}</p>{recipe.source && <p className="subtle">出典：{recipe.source}</p>}{recipe.sourceUrl && <a className="source-link" href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">元レシピを見る ↗</a>}<div className="form-actions"><button className="button secondary" onClick={onEdit}>編集する</button><button className="text-button danger-text" onClick={onDelete}>削除する</button></div></Modal>;
}
