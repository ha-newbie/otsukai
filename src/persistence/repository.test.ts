import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, localDate, monday } from '../domain/dates';
import { KosajiDB } from './database';
import { Repository, type RecipeInput } from './repository';
import { createBackup, parseBackup, restoreBackup, validateBackup } from './backup';

let database: KosajiDB;
let repo: Repository;
const week = monday();
const today = localDate();
const input: RecipeInput = { title: 'にんじんスープ', servings: 2, ingredients: [{ name: 'にんじん', quantity: 400, unit: 'g', categoryId: 'vegetable' }], steps: '', source: '', sourceUrl: '' };
beforeEach(async () => { database = new KosajiDB(`test-${crypto.randomUUID()}`); repo = new Repository(database); await database.open(); });
afterEach(async () => { await database.delete(); });
async function prepare() {
  await repo.saveRecipe(input);
  const recipe = (await database.recipes.toArray())[0]!;
  await repo.saveMeal({ recipeId: recipe.id, date: today, slot: 'dinner' });
  await repo.saveStock({ name: 'にんじん', categoryId: 'vegetable', quantity: 100, unit: 'g', expiresOn: '' });
  await repo.generateShopping(week);
  return { recipe, trip: (await database.trips.toArray())[0]!, item: (await database.shoppingItems.toArray())[0]! };
}
describe('保存と買い物トランザクション', () => {
  it('除外は開始前の再集計で反映し、直接追加した調味料は残す', async () => {
    await repo.saveShoppingExclusions([]);
    await repo.saveRecipe({ ...input, ingredients: [...input.ingredients, { name: '塩', quantity: 2, unit: 'g', categoryId: 'seasoning' }] });
    const recipe = (await database.recipes.toArray())[0]!;
    await repo.saveMeal({ recipeId: recipe.id, date: today, slot: 'dinner' });
    await repo.generateShopping(week);
    expect(await database.shoppingItems.count()).toBe(2);
    await repo.addShopping({ name: '塩', quantity: 1, unit: '袋', categoryId: 'seasoning' }, week);
    const before = await database.snapshot();
    await repo.saveShoppingExclusions(['seasoning']);
    expect(await database.shoppingItems.toArray()).toEqual(before.shoppingItems);
    await repo.generateShopping(week);
    const items = await database.shoppingItems.toArray();
    expect(items).toHaveLength(2);
    expect(items.filter(value => value.source === 'manual')).toHaveLength(1);
    expect(await database.recipes.get(recipe.id)).toEqual(recipe);
    await expect(repo.saveShoppingExclusions(['missing'])).rejects.toThrow('カテゴリ');
  });
  it('除外設定やカテゴリを変更しても買い物中・完了後の数量とチェックを変更しない', async () => {
    const { item, trip } = await prepare(); await repo.toggleShopping(item.id);
    await repo.setIngredientCategory(item.ingredientId, 'seasoning');
    await repo.saveShoppingExclusions(['seasoning', 'vegetable']);
    expect(await database.shoppingItems.get(item.id)).toMatchObject({ checked: true, quantity: 300 });
    await expect(repo.generateShopping(week)).rejects.toThrow('再集計');
    await repo.completeShopping(trip.id);
    await repo.saveShoppingExclusions([]);
    expect(await database.shoppingItems.get(item.id)).toMatchObject({ checked: true, quantity: 300 });
    await expect(repo.setIngredientCategory(item.ingredientId, 'missing')).rejects.toThrow('カテゴリ');
  });
  it('空のDBにはカテゴリと設定だけを作成する', async () => { expect(await database.categories.count()).toBe(6); expect(await database.recipes.count()).toBe(0); });
  it('失敗したレシピ保存では新しい食材もロールバックする', async () => {
    await expect(repo.saveRecipe({ ...input, ingredients: [{ name: '新食材', quantity: NaN, unit: 'g', categoryId: 'other' }] })).rejects.toThrow();
    expect(await database.ingredients.count()).toBe(0); expect(await database.recipes.count()).toBe(0);
  });
  it('簡易レシピ・出典URLを保存し、編集する', async () => {
    await repo.saveRecipe({ ...input, source: '家族', sourceUrl: 'https://example.com/recipe' });
    const recipe = (await database.recipes.toArray())[0]!;
    await repo.saveRecipe({ ...input, id: recipe.id, title: '新しいスープ' });
    expect((await database.recipes.get(recipe.id))?.title).toBe('新しいスープ'); expect(await database.ingredients.count()).toBe(1);
  });
  it('同名食材を在庫とレシピで共有する', async () => { await prepare(); expect(await database.ingredients.count()).toBe(1); });
  it('生成しても在庫を減らさない', async () => {
    const { item } = await prepare(); expect(item.quantity).toBe(300);
    expect((await database.pantry.toArray())[0]?.quantity).toBe(100);
    await repo.generateShopping(week); expect((await database.shoppingItems.toArray())[0]?.quantity).toBe(300);
  });
  it('再集計で手動購入品と数量上書きを残す', async () => {
    const { item } = await prepare();
    await repo.adjustShopping(item.id, 500);
    await repo.addShopping({ name: '牛乳', quantity: 1, unit: 'L', categoryId: 'dairy' }, week);
    await repo.generateShopping(week);
    const items = await database.shoppingItems.toArray(); expect(items).toHaveLength(2);
    expect(items.find(value => value.id === item.id)?.quantity).toBe(500);
  });
  it('チェック開始後は再集計を拒否し、献立編集後もリストを維持する', async () => {
    const { item, recipe } = await prepare(); await repo.toggleShopping(item.id);
    await repo.saveRecipe({ ...input, id: recipe.id, ingredients: [{ ...input.ingredients[0]!, quantity: 1000 }] });
    await expect(repo.generateShopping(week)).rejects.toThrow('再集計');
    expect(await database.shoppingItems.get(item.id)).toMatchObject({ checked: true, quantity: 300 });
    await repo.toggleShopping(item.id);
    await expect(repo.generateShopping(week)).rejects.toThrow('再集計');
  });
  it('別週の進行中リストを作らない', async () => { await prepare(); await expect(repo.generateShopping(addDays(week, 7))).rejects.toThrow('進行中'); });
  it('チェック状態はDBを閉じても保持する', async () => {
    const { item } = await prepare(); await repo.toggleShopping(item.id);
    database.close(); await database.open(); expect((await database.shoppingItems.get(item.id))?.checked).toBe(true);
  });
  it('並行した完了操作でも在庫に一度だけ反映する', async () => {
    const { trip, item } = await prepare(); await repo.toggleShopping(item.id);
    await Promise.all([repo.completeShopping(trip.id), repo.completeShopping(trip.id)]);
    const stocks = await database.pantry.toArray(); expect(stocks).toHaveLength(2);
    expect(stocks.reduce((sum, stock) => sum + stock.quantity, 0)).toBe(400);
    await expect(repo.toggleShopping(item.id)).rejects.toThrow('完了');
    await expect(repo.generateShopping(week)).rejects.toThrow('再集計');
  });
  it('未チェック品と適量は自動的に在庫に足さない', async () => {
    const { trip } = await prepare();
    await repo.addShopping({ name: '塩', quantity: null, unit: '適量', categoryId: 'seasoning' }, week);
    const salt = (await database.shoppingItems.toArray()).find(value => value.unit === '適量')!;
    await repo.toggleShopping(salt.id); await repo.completeShopping(trip.id);
    expect(await database.pantry.count()).toBe(1);
  });
  it('献立の移動・削除が可能で、レシピ削除時は関連献立を消す', async () => {
    const { recipe } = await prepare(); const meal = (await database.meals.toArray())[0]!;
    await repo.saveMeal({ ...meal, date: addDays(today, 1), slot: 'lunch' });
    expect((await database.meals.get(meal.id))?.slot).toBe('lunch');
    await repo.deleteRecipe(recipe.id); expect(await database.meals.count()).toBe(0);
    expect(await database.shoppingItems.count()).toBe(1);
    expect(() => validateBackup({ app: 'kosaji', schemaVersion: 1, exportedAt: new Date().toISOString(), data: {} })).toThrow();
    await expect(createBackup(database)).resolves.toBeDefined();
  });
});
describe('バックアップの検証と復元', () => {
  it('旧v1バックアップをv2へ移行し、食材・在庫・購入チェックを復元する', async () => {
    const { item } = await prepare(); await repo.toggleShopping(item.id);
    const backup = await createBackup(database);
    const oldSettings = backup.data.settings.map(({ excludedShoppingCategoryIds: _excluded, ...settings }) => settings);
    const legacy = { ...backup, schemaVersion: 1, data: { ...backup.data, settings: oldSettings } };
    const migrated = parseBackup(JSON.stringify(legacy));
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.data.settings[0]?.excludedShoppingCategoryIds).toEqual(['seasoning']);
    expect(migrated.data.shoppingItems).toEqual(backup.data.shoppingItems);
    await restoreBackup(migrated, database);
    expect(await database.shoppingItems.get(item.id)).toMatchObject({ checked: true, quantity: 300 });
    await repo.saveShoppingExclusions([]);
    const current = await createBackup(database);
    await restoreBackup(parseBackup(JSON.stringify(current)), database);
    expect((await database.settings.get('app'))?.excludedShoppingCategoryIds).toEqual([]);
  });
  it('除外カテゴリの重複・存在しない参照・v1への新フィールド混入を拒否する', async () => {
    const backup = await createBackup(database);
    const duplicate = structuredClone(backup); duplicate.data.settings[0]!.excludedShoppingCategoryIds = ['seasoning', 'seasoning'];
    expect(() => validateBackup(duplicate)).toThrow();
    const orphan = structuredClone(backup); orphan.data.settings[0]!.excludedShoppingCategoryIds = ['missing'];
    expect(() => validateBackup(orphan)).toThrow('参照');
    expect(() => validateBackup({ ...backup, schemaVersion: 1 })).toThrow();
  });
  it('買い物チェックを含めて全データを往復する', async () => {
    const { item } = await prepare(); await repo.toggleShopping(item.id);
    const before = await database.snapshot(); const backup = await createBackup(database);
    await repo.deleteRecipe(before.recipes[0]!.id);
    await restoreBackup(parseBackup(JSON.stringify(backup)), database);
    expect(await database.snapshot()).toEqual({ ...before, settings: [{ ...before.settings[0], lastBackupAt: backup.exportedAt }] });
  });
  it('未対応バージョン、重複ID、孤立参照を拒否する', async () => {
    await prepare(); const backup = await createBackup(database);
    expect(() => parseBackup(JSON.stringify({ ...backup, schemaVersion: 99 }))).toThrow('バージョン');
    const duplicate = structuredClone(backup); duplicate.data.pantry.push(duplicate.data.pantry[0]!);
    expect(() => validateBackup(duplicate)).toThrow('重複');
    const orphan = structuredClone(backup); orphan.data.ingredients = [];
    expect(() => validateBackup(orphan)).toThrow('参照');
  });
  it('不正データでの復元を拒否して既存データを残す', async () => {
    await prepare(); const before = await database.snapshot(); const backup = await createBackup(database);
    backup.data.meals[0]!.recipeId = 'unknown';
    await expect(restoreBackup(backup, database)).rejects.toThrow('参照'); expect(await database.snapshot()).toEqual(before);
  });
  it('復元途中の保存エラーでも全テーブルをロールバックする', async () => {
    await prepare(); const before = await database.snapshot(); const backup = await createBackup(database);
    const failWrite = () => { throw new Error('storage full'); };
    database.recipes.hook('creating', failWrite);
    await expect(restoreBackup(backup, database)).rejects.toThrow('storage full');
    expect(await database.snapshot()).toEqual(before);
    database.recipes.hook('creating').unsubscribe(failWrite);
  });
  it('不正JSON・不正日付・大量ファイルを拒否する', async () => {
    expect(() => parseBackup('{')).toThrow('JSON');
    await prepare(); const backup = await createBackup(database); backup.data.meals[0]!.date = '2026-02-30';
    expect(() => validateBackup(backup)).toThrow(); expect(() => parseBackup(' '.repeat(10 * 1024 * 1024 + 1))).toThrow('10MB');
  });
});
