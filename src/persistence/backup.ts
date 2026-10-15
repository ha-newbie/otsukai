import { z } from 'zod';
import {
  categorySchema, DATA_VERSION, daySettingSchema, ingredientSchema, pantrySchema,
  plannedMealSchema, recipeSchema, settingsSchema, shoppingItemSchema, tripSchema,
  type AppData,
} from '../domain/models';
import { addDays, monday } from '../domain/dates';
import { db, type KosajiDB } from './database';

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const backupSchema = z.object({
  app: z.literal('kosaji'), schemaVersion: z.literal(DATA_VERSION), exportedAt: z.iso.datetime(),
  data: z.object({
    categories: z.array(categorySchema).min(1).max(100), ingredients: z.array(ingredientSchema).max(10_000),
    recipes: z.array(recipeSchema).max(10_000), meals: z.array(plannedMealSchema).max(20_000),
    days: z.array(daySettingSchema).max(10_000), pantry: z.array(pantrySchema).max(20_000),
    trips: z.array(tripSchema).max(10_000), shoppingItems: z.array(shoppingItemSchema).max(50_000),
    settings: z.array(settingsSchema).length(1),
  }).strict(),
}).strict();
const legacyBackupSchema = backupSchema.extend({
  schemaVersion: z.literal(1),
  data: backupSchema.shape.data.extend({ settings: z.array(settingsSchema.omit({ excludedShoppingCategoryIds: true })).length(1) }).strict(),
}).strict();
export type Backup = z.infer<typeof backupSchema>;
export function validateBackup(raw: unknown): Backup {
  let migrated = raw;
  if (raw !== null && typeof raw === 'object' && 'schemaVersion' in raw && raw.schemaVersion === 1) {
    const legacy = legacyBackupSchema.parse(raw);
    const excludedShoppingCategoryIds = legacy.data.categories.some(value => value.id === 'seasoning') ? ['seasoning'] : [];
    migrated = { ...legacy, schemaVersion: DATA_VERSION, data: { ...legacy.data, settings: legacy.data.settings.map(value => ({ ...value, excludedShoppingCategoryIds })) } };
  }
  const backup = backupSchema.parse(migrated);
  const { data } = backup;
  for (const rows of Object.values(data)) {
    const ids = rows.map(row => row.id);
    if (new Set(ids).size !== ids.length) throw new Error('重複したIDが含まれています');
  }
  const categories = new Set(data.categories.map(value => value.id));
  const ingredients = new Set(data.ingredients.map(value => value.id));
  const names = data.ingredients.map(value => value.normalizedName);
  if (new Set(names).size !== names.length) throw new Error('同じ食材が重複しています');
  const recipes = new Set(data.recipes.map(value => value.id));
  const trips = new Map(data.trips.map(value => [value.id, value]));
  const validReference = (valid: boolean) => { if (!valid) throw new Error('参照先のないデータが含まれています'); };
  data.settings.forEach(value => value.excludedShoppingCategoryIds.forEach(id => validReference(categories.has(id))));
  data.ingredients.forEach(value => validReference(categories.has(value.categoryId)));
  data.recipes.forEach(value => value.ingredients.forEach(item => validReference(ingredients.has(item.ingredientId))));
  data.meals.forEach(value => validReference(recipes.has(value.recipeId)));
  data.pantry.forEach(value => validReference(ingredients.has(value.ingredientId)));
  data.shoppingItems.forEach(value => {
    validReference(ingredients.has(value.ingredientId) && trips.has(value.tripId));
    if (value.checked && (trips.get(value.tripId)?.status === 'draft' || value.quantity === 0)) throw new Error('購入チェックとリスト状態が一致しません');
  });
  const itemIds = new Set(data.shoppingItems.map(value => value.id));
  data.pantry.forEach(value => { if (value.sourceShoppingItemId) validReference(itemIds.has(value.sourceShoppingItemId)); });
  const starts = data.trips.map(value => value.startsOn);
  if (new Set(starts).size !== starts.length) throw new Error('同じ週のリストが重複しています');
  if (data.trips.filter(value => value.status !== 'completed').length > 1) throw new Error('進行中のリストは1つにしてください');
  data.trips.forEach(value => {
    if (monday(value.startsOn) !== value.startsOn || addDays(value.startsOn, 6) !== value.endsOn) throw new Error('買い物期間が正しくありません');
    if ((value.status === 'completed') !== Boolean(value.completedAt)) throw new Error('完了日時と状態が一致しません');
    // mealIds are historical snapshots; deleted recipes/meals may no longer exist.
  });
  return backup;
}
export function parseBackup(text: string): Backup {
  if (new Blob([text]).size > MAX_BACKUP_BYTES) throw new Error('バックアップは10MB以下にしてください');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('JSONファイルを読み込めません'); }
  try { return validateBackup(raw); } catch (error) {
    if (error instanceof z.ZodError) throw new Error('対応する形式のバックアップではありません。おつかいの形式バージョン1または2を選択してください');
    throw error;
  }
}
export async function createBackup(database: KosajiDB = db): Promise<Backup> {
  return validateBackup({ app: 'kosaji', schemaVersion: DATA_VERSION, exportedAt: new Date().toISOString(), data: await database.snapshot() });
}
export function serializeBackup(backup: Backup): string {
  const json = JSON.stringify(validateBackup(backup), null, 2);
  if (new Blob([json]).size > MAX_BACKUP_BYTES) throw new Error('バックアップが対応する最大サイズの10MBを超えています');
  return json;
}
export async function restoreBackup(backup: Backup, database: KosajiDB = db): Promise<void> {
  const validated = validateBackup(backup);
  await database.transaction('rw', database.tables, async () => {
    for (const table of database.tables) await table.clear();
    for (const [key, rows] of Object.entries(validated.data)) {
      await database.table(key as keyof AppData).bulkAdd(rows);
    }
    // The selected file is itself a confirmed saved backup, even if its
    // settings snapshot was captured before recording the export operation.
    await database.settings.update('app', { lastBackupAt: validated.exportedAt });
  });
}
