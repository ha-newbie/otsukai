import Dexie, { type EntityTable } from 'dexie';
import type { AppData, DaySetting, Ingredient, PantryStock, PlannedMeal, Recipe, Settings, ShoppingItem, ShoppingTrip, StoreCategory } from '../domain/models';
import { defaultCategories, defaultSettings } from '../domain/models';

export class KosajiDB extends Dexie {
  categories!: EntityTable<StoreCategory, 'id'>;
  ingredients!: EntityTable<Ingredient, 'id'>;
  recipes!: EntityTable<Recipe, 'id'>;
  meals!: EntityTable<PlannedMeal, 'id'>;
  days!: EntityTable<DaySetting, 'id'>;
  pantry!: EntityTable<PantryStock, 'id'>;
  trips!: EntityTable<ShoppingTrip, 'id'>;
  shoppingItems!: EntityTable<ShoppingItem, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  constructor(name = 'kosaji') {
    super(name);
    this.version(1).stores({
      categories: 'id, order', ingredients: 'id, &normalizedName, categoryId', recipes: 'id, title, updatedAt',
      meals: 'id, recipeId, date, [date+slot]', days: 'id', pantry: 'id, ingredientId, expiresOn',
      trips: 'id, &startsOn, status', shoppingItems: 'id, tripId, ingredientId', settings: 'id',
    });
    this.on('populate', async () => {
      await this.categories.bulkAdd(defaultCategories);
      await this.settings.add(defaultSettings);
    });
  }
  async snapshot(): Promise<AppData> {
    return this.transaction('r', this.tables, async () => ({
      categories: await this.categories.orderBy('order').toArray(),
      ingredients: await this.ingredients.toArray(), recipes: await this.recipes.toArray(),
      meals: await this.meals.toArray(), days: await this.days.toArray(), pantry: await this.pantry.toArray(),
      trips: await this.trips.toArray(), shoppingItems: await this.shoppingItems.toArray(), settings: await this.settings.toArray(),
    }));
  }
}
export const db = new KosajiDB();
