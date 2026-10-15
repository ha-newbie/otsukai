import { useContext, useState } from 'react';
import { defaultSettings, normalizeName, type AppData } from '../domain/models';
import { repository } from '../persistence/repository';
import { UIContext, type Action } from './components';

export function ShoppingPreferences({ data, action }: { data: AppData; action: Action }) {
  const settings = data.settings[0] ?? defaultSettings;
  const { pending } = useContext(UIContext);
  const [query, setQuery] = useState('');
  const matches = data.ingredients.filter(value => normalizeName(value.name).includes(normalizeName(query))).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  return <section className="settings-card"><h2>買い物の集計</h2>
    <p className="help-text">チェックしたカテゴリを、献立からの買い物集計から除外します。レシピの材料・調味料と在庫の使用予定には残ります。初期設定では調味料を除外します。</p>
    <fieldset disabled={pending} className="preferences-fields">{data.categories.map(category => <label className="checkbox-label" key={category.id}><input type="checkbox" aria-label={`${category.name}を買い物集計から除外`} checked={settings.excludedShoppingCategoryIds.includes(category.id)} onChange={event => {
      const ids = event.target.checked ? [...settings.excludedShoppingCategoryIds, category.id] : settings.excludedShoppingCategoryIds.filter(id => id !== category.id);
      void action(() => repository.saveShoppingExclusions(ids), '買い物の除外設定を保存しました');
    }} />{category.name}</label>)}</fieldset>
    <p className="help-text">変更は次回のリスト作成・開始前の「献立から再集計」で反映します。買い物中・完了済みの品目やチェックは変更しません。買い足す調味料は「品目を追加」から直接追加できます。</p>
    <details><summary>登録済み食材のカテゴリを変更</summary><p className="help-text">同じ食材を使うすべてのレシピ・在庫に共通です。取込時の分類が違う場合はここで直してください。食材名・数量・購入チェックは保持します。</p>
      <label>カテゴリを変更する食材を検索<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="例：しょうゆ" /></label>
      <fieldset disabled={pending} className="preferences-fields">{matches.slice(0, 20).map(ingredient => <label className="setting-inline" key={ingredient.id}>{ingredient.name}<select aria-label={`${ingredient.name}の共通カテゴリ`} value={ingredient.categoryId} onChange={event => void action(() => repository.setIngredientCategory(ingredient.id, event.target.value), '食材の共通カテゴリを変更しました')}>{data.categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>)}</fieldset>
      {!matches.length && <p className="help-text">該当する食材はありません。</p>}{matches.length > 20 && <p className="help-text">先頭の20件を表示しています。食材名で絞り込んでください。</p>}
    </details>
  </section>;
}
