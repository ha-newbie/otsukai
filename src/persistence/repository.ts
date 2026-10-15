import type { AppData, PantryStock, Recipe, ShoppingItem, Unit } from '../domain/models';
import { dateSchema, nameSchema, newId, normalizeName, pantrySchema, plannedMealSchema, recipeSchema, servingsSchema, settingsSchema, shoppingItemSchema } from '../domain/models';
import type { IngredientInput, RecipeInput } from '../domain/recipe-input';
export type { IngredientInput, RecipeInput } from '../domain/recipe-input';
export { manualRecipeSchema } from '../domain/recipe-input';
import { addDays, localDate, monday } from '../domain/dates';
import { shoppingLines } from '../domain/calculations';
import { db, type KosajiDB } from './database';

export class Repository {
  constructor(readonly database: KosajiDB = db) {}
  private async ingredientId(name: string, categoryId: string): Promise<string> {
    const clean = nameSchema.parse(name);
    if (!(await this.database.categories.get(categoryId))) throw new Error('食材カテゴリが見つかりません');
    const normalizedName = normalizeName(clean);
    const existing = await this.database.ingredients.where('normalizedName').equals(normalizedName).first();
    if (existing) return existing.id;
    const id = newId();
    await this.database.ingredients.add({ id, name: clean, normalizedName, categoryId });
    return id;
  }
  async saveRecipe(input: RecipeInput): Promise<void> {
    await this.database.transaction('rw', [this.database.recipes, this.database.ingredients, this.database.categories], async () => {
      const existing = input.id ? await this.database.recipes.get(input.id) : undefined;
      if (input.id && !existing) throw new Error('レシピが見つかりません');
      const ingredients = [];
      for (const ingredient of input.ingredients) ingredients.push({ ingredientId: await this.ingredientId(ingredient.name, ingredient.categoryId), quantity: ingredient.quantity, unit: ingredient.unit });
      const now = new Date().toISOString();
      const recipe: Recipe = recipeSchema.parse({ id: input.id ?? newId(), title: input.title, servings: input.servings, ingredients, steps: input.steps, source: input.source, sourceUrl: input.sourceUrl, createdAt: existing?.createdAt ?? now, updatedAt: now });
      await this.database.recipes.put(recipe);
    });
  }
  async deleteRecipe(id: string): Promise<void> {
    await this.database.transaction('rw', [this.database.recipes, this.database.meals], async () => {
      await this.database.meals.where('recipeId').equals(id).delete();
      await this.database.recipes.delete(id);
    });
  }
  async saveMeal(input: { id?: string; recipeId: string; date: string; slot: 'breakfast' | 'lunch' | 'dinner' }): Promise<void> {
    await this.database.transaction('rw', [this.database.meals, this.database.recipes], async () => {
      if (!(await this.database.recipes.get(input.recipeId))) throw new Error('レシピが見つかりません');
      if (input.id && !(await this.database.meals.get(input.id))) throw new Error('献立が見つかりません');
      await this.database.meals.put(plannedMealSchema.parse({ ...input, id: input.id ?? newId() }));
    });
  }
  async deleteMeal(id: string): Promise<void> { await this.database.meals.delete(id); }
  async saveServings(date: string, servings: number): Promise<void> {
    await this.database.days.put({ id: dateSchema.parse(date), servings: servingsSchema.parse(servings) });
  }
  async saveStock(input: { id?: string; name: string; categoryId: string; quantity: number; unit: Exclude<Unit, '適量'>; expiresOn: string }): Promise<void> {
    await this.database.transaction('rw', [this.database.pantry, this.database.ingredients, this.database.categories], async () => {
      const existing = input.id ? await this.database.pantry.get(input.id) : undefined;
      if (input.id && !existing) throw new Error('在庫が見つかりません');
      const stock: PantryStock = pantrySchema.parse({
        id: input.id ?? newId(), ingredientId: await this.ingredientId(input.name, input.categoryId),
        quantity: input.quantity, unit: input.unit, expiresOn: input.expiresOn,
        ...(existing?.sourceShoppingItemId ? { sourceShoppingItemId: existing.sourceShoppingItemId } : {}),
      });
      await this.database.pantry.put(stock);
    });
  }
  async deleteStock(id: string): Promise<void> { await this.database.pantry.delete(id); }
  async generateShopping(startsOn: string, today = localDate()): Promise<void> {
    dateSchema.parse(startsOn);
    if (monday(startsOn) !== startsOn) throw new Error('週の開始日は月曜日を指定してください');
    const endsOn = addDays(startsOn, 6);
    if (endsOn < today) throw new Error('過去の週は買い物リストを作成できません');
    await this.database.transaction('rw', this.database.tables, async () => {
      const data = await this.database.snapshot();
      const existing = data.trips.find(trip => trip.startsOn === startsOn);
      if (existing && existing.status !== 'draft') throw new Error('買い物開始後・完了後のリストは再集計できません');
      if (data.trips.some(trip => trip.status !== 'completed' && trip.id !== existing?.id)) throw new Error('進行中の買い物を完了してから、別の週のリストを作成してください');
      const tripId = existing?.id ?? newId();
      const previous = data.shoppingItems.filter(item => item.tripId === tripId && item.source === 'plan');
      await this.database.shoppingItems.bulkDelete(previous.map(item => item.id));
      const items: ShoppingItem[] = shoppingLines(data, startsOn, endsOn, today).map(line => {
        const before = previous.find(item => item.ingredientId === line.ingredientId && item.unit === line.unit);
        return shoppingItemSchema.parse({
          ...line, id: before?.id ?? newId(), tripId, source: 'plan', checked: false,
          quantity: before?.quantityOverride ?? line.quantity, quantityOverride: before?.quantityOverride ?? null,
        });
      });
      await this.database.shoppingItems.bulkPut(items);
      await this.database.trips.put({ id: tripId, startsOn, endsOn, status: 'draft', createdAt: existing?.createdAt ?? new Date().toISOString(), mealIds: data.meals.filter(meal => meal.date >= startsOn && meal.date >= today && meal.date <= endsOn).map(meal => meal.id) });
    });
  }
  async addShopping(input: IngredientInput, startsOn: string): Promise<void> {
    dateSchema.parse(startsOn);
    if (monday(startsOn) !== startsOn || addDays(startsOn, 6) < localDate()) throw new Error('今週以降の週を選択してください');
    await this.database.transaction('rw', [this.database.trips, this.database.shoppingItems, this.database.ingredients, this.database.categories], async () => {
      let trip = await this.database.trips.where('startsOn').equals(startsOn).first();
      if (trip?.status === 'completed') throw new Error('この週の買い物は完了しています');
      const open = await this.database.trips.filter(value => value.status !== 'completed').first();
      if (open && open.id !== trip?.id) throw new Error('進行中の買い物を完了してから追加してください');
      if (!trip) {
        trip = { id: newId(), startsOn, endsOn: addDays(startsOn, 6), status: 'draft', createdAt: new Date().toISOString(), mealIds: [] };
        await this.database.trips.add(trip);
      }
      const item = shoppingItemSchema.parse({ id: newId(), tripId: trip.id, ingredientId: await this.ingredientId(input.name, input.categoryId), quantity: input.quantity, unit: input.unit, plannedQuantity: null, pantryQuantity: 0, quantityOverride: null, source: 'manual', checked: false });
      if (item.quantity !== null && item.quantity <= 0) throw new Error('購入量は0より大きくしてください');
      await this.database.shoppingItems.add(item);
    });
  }
  async toggleShopping(id: string): Promise<void> {
    await this.database.transaction('rw', [this.database.shoppingItems, this.database.trips], async () => {
      const item = await this.database.shoppingItems.get(id);
      if (!item) throw new Error('買い物品が見つかりません');
      const trip = await this.database.trips.get(item.tripId);
      if (!trip || trip.status === 'completed') throw new Error('完了したリストは変更できません');
      if (item.quantity === 0) return;
      await this.database.shoppingItems.update(id, { checked: !item.checked });
      await this.database.trips.update(trip.id, { status: 'active' });
    });
  }
  async adjustShopping(id: string, quantity: number): Promise<void> {
    await this.database.transaction('rw', [this.database.shoppingItems, this.database.trips], async () => {
      const item = await this.database.shoppingItems.get(id);
      const trip = item ? await this.database.trips.get(item.tripId) : undefined;
      if (!item || !trip || trip.status === 'completed') throw new Error('変更できる買い物品が見つかりません');
      if (item.unit === '適量') throw new Error('適量の数量は変更できません');
      const updated = shoppingItemSchema.parse({ ...item, quantity, quantityOverride: quantity, checked: quantity === 0 ? false : item.checked });
      await this.database.shoppingItems.put(updated);
    });
  }
  async deleteShopping(id: string): Promise<void> {
    await this.database.transaction('rw', [this.database.shoppingItems, this.database.trips], async () => {
      const item = await this.database.shoppingItems.get(id);
      const trip = item ? await this.database.trips.get(item.tripId) : undefined;
      if (!item || !trip || trip.status === 'completed') throw new Error('変更できる買い物品が見つかりません');
      await this.database.shoppingItems.delete(id);
    });
  }
  async completeShopping(tripId: string): Promise<void> {
    await this.database.transaction('rw', [this.database.trips, this.database.shoppingItems, this.database.pantry], async () => {
      const trip = await this.database.trips.get(tripId);
      if (!trip) throw new Error('買い物リストが見つかりません');
      if (trip.status === 'completed') return;
      const items = await this.database.shoppingItems.where('tripId').equals(tripId).toArray();
      for (const item of items) {
        if (!item.checked || item.quantity === null || item.quantity === 0 || item.unit === '適量') continue;
        await this.database.pantry.add(pantrySchema.parse({ id: newId(), ingredientId: item.ingredientId, quantity: item.quantity, unit: item.unit, expiresOn: '', sourceShoppingItemId: item.id }));
      }
      await this.database.trips.update(tripId, { status: 'completed', completedAt: new Date().toISOString() });
    });
  }
  async saveSettings(value: AppData['settings'][number]): Promise<void> { await this.database.settings.put(settingsSchema.parse(value)); }
  async saveShoppingExclusions(categoryIds: string[]): Promise<void> {
    await this.database.transaction('rw', [this.database.categories, this.database.settings], async () => {
      const settings = await this.database.settings.get('app');
      if (!settings) throw new Error('設定が見つかりません');
      const updated = settingsSchema.parse({ ...settings, excludedShoppingCategoryIds: categoryIds });
      for (const id of updated.excludedShoppingCategoryIds) if (!(await this.database.categories.get(id))) throw new Error('除外するカテゴリが見つかりません');
      await this.database.settings.put(updated);
    });
  }
  async setIngredientCategory(id: string, categoryId: string): Promise<void> {
    await this.database.transaction('rw', [this.database.ingredients, this.database.categories], async () => {
      if (!(await this.database.categories.get(categoryId))) throw new Error('食材カテゴリが見つかりません');
      if (!(await this.database.ingredients.get(id))) throw new Error('食材が見つかりません');
      await this.database.ingredients.update(id, { categoryId });
    });
  }
}
export const repository = new Repository();
