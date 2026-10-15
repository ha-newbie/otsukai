import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { defaultCategories } from '../domain/models';
import { KosajiDB } from './database';

it('実際のv1 DBを開くと購入チェックを保護したまま設定をv2へ移行し、再起動で再初期化しない', async () => {
  const name = `legacy-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(1).stores({ categories: 'id, order', ingredients: 'id, &normalizedName, categoryId', recipes: 'id, title, updatedAt', meals: 'id, recipeId, date, [date+slot]', days: 'id', pantry: 'id, ingredientId, expiresOn', trips: 'id, &startsOn, status', shoppingItems: 'id, tripId, ingredientId', settings: 'id' });
  const upgraded = new KosajiDB(name);
  try {
    await legacy.open();
    await legacy.table('categories').bulkAdd(defaultCategories);
    await legacy.table('settings').add({ id: 'app', defaultServings: 3, lastBackupAt: '', backupReminderDays: 30 });
    const item = { id: 'checked-item', tripId: 'trip', ingredientId: 'salt', quantity: 1, unit: '袋', plannedQuantity: 1, pantryQuantity: 0, quantityOverride: null, source: 'plan', checked: true };
    await legacy.table('ingredients').add({ id: 'salt', name: '塩', normalizedName: '塩', categoryId: 'seasoning' });
    await legacy.table('trips').add({ id: 'trip', startsOn: '2026-10-12', endsOn: '2026-10-18', status: 'active', createdAt: '2026-10-15T00:00:00.000Z', mealIds: [] });
    await legacy.table('shoppingItems').add(item);
    const stock = { id: 'stock', ingredientId: 'salt', quantity: 50, unit: 'g', expiresOn: '' };
    await legacy.table('pantry').add(stock);
    legacy.close(); await upgraded.open();
    expect(upgraded.verno).toBe(2);
    expect(await upgraded.settings.get('app')).toMatchObject({ defaultServings: 3, backupReminderDays: 30, excludedShoppingCategoryIds: ['seasoning'] });
    expect(await upgraded.shoppingItems.get(item.id)).toEqual(item);
    expect(await upgraded.pantry.get(stock.id)).toEqual(stock);
    await upgraded.settings.update('app', { excludedShoppingCategoryIds: [] });
    upgraded.close(); await upgraded.open();
    expect((await upgraded.settings.get('app'))?.excludedShoppingCategoryIds).toEqual([]);
  } finally { legacy.close(); await upgraded.delete(); }
});
