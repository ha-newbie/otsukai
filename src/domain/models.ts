import { z } from 'zod';

export const DATA_VERSION = 2;
export const idSchema = z.string().min(1).max(100);
export const nameSchema = z.string().trim().min(1).max(100);
export const quantitySchema = z.number().finite().min(0).max(1_000_000);
export const servingsSchema = z.number().int().min(1).max(100);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, '有効な日付を指定してください');
const timestampSchema = z.iso.datetime();
export const units = ['g', 'kg', 'ml', 'L', '個', '本', '枚', '束', '袋', '缶', 'パック', '大さじ', '小さじ', '適量'] as const;
export const unitSchema = z.enum(units);
export type Unit = z.infer<typeof unitSchema>;
const amountFields = { quantity: quantitySchema.nullable(), unit: unitSchema };
const validAmount = (value: { quantity: number | null; unit: Unit }) => value.unit === '適量' ? value.quantity === null : value.quantity !== null;

export const categorySchema = z.object({ id: idSchema, name: nameSchema, order: z.number().int().min(0) }).strict();
export const ingredientSchema = z.object({ id: idSchema, name: nameSchema, normalizedName: nameSchema, categoryId: idSchema }).strict().refine(value => value.normalizedName === normalizeName(value.name), '食材名の正規化が一致しません');
export const recipeIngredientSchema = z.object({ ingredientId: idSchema, ...amountFields }).strict().refine(validAmount, '数量と単位が一致しません');
export const recipeSchema = z.object({
  id: idSchema, title: nameSchema, servings: servingsSchema,
  ingredients: z.array(recipeIngredientSchema).min(1).max(100),
  steps: z.string().max(20_000),
  sourceUrl: z.union([z.literal(''), z.url().refine(url => /^https?:\/\//i.test(url), 'http/httpsのURLを入力してください')]),
  source: z.string().max(200), createdAt: timestampSchema, updatedAt: timestampSchema,
}).strict();
export const slots = ['breakfast', 'lunch', 'dinner'] as const;
export const slotLabels = { breakfast: '朝', lunch: '昼', dinner: '夜' } as const;
export const plannedMealSchema = z.object({ id: idSchema, recipeId: idSchema, date: dateSchema, slot: z.enum(slots) }).strict();
export const daySettingSchema = z.object({ id: dateSchema, servings: servingsSchema }).strict();
export const pantrySchema = z.object({
  id: idSchema, ingredientId: idSchema, quantity: quantitySchema, unit: unitSchema.exclude(['適量']),
  expiresOn: z.union([dateSchema, z.literal('')]), sourceShoppingItemId: idSchema.optional(),
}).strict();
export const tripSchema = z.object({
  id: idSchema, startsOn: dateSchema, endsOn: dateSchema,
  status: z.enum(['draft', 'active', 'completed']), createdAt: timestampSchema,
  completedAt: timestampSchema.optional(), mealIds: z.array(idSchema).max(1000),
}).strict();
export const shoppingItemSchema = z.object({
  id: idSchema, tripId: idSchema, ingredientId: idSchema, ...amountFields,
  plannedQuantity: quantitySchema.nullable(), pantryQuantity: quantitySchema,
  quantityOverride: quantitySchema.nullable(), checked: z.boolean(),
  source: z.enum(['plan', 'manual']),
}).strict().refine(validAmount, '数量と単位が一致しません');
export const settingsSchema = z.object({
  id: z.literal('app'), defaultServings: servingsSchema,
  lastBackupAt: z.union([timestampSchema, z.literal('')]), backupReminderDays: z.number().int().min(1).max(365),
  excludedShoppingCategoryIds: z.array(idSchema).max(100).refine(ids => new Set(ids).size === ids.length, '除外カテゴリが重複しています'),
}).strict();

export type StoreCategory = z.infer<typeof categorySchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type PlannedMeal = z.infer<typeof plannedMealSchema>;
export type DaySetting = z.infer<typeof daySettingSchema>;
export type PantryStock = z.infer<typeof pantrySchema>;
export type ShoppingTrip = z.infer<typeof tripSchema>;
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export interface AppData {
  categories: StoreCategory[]; ingredients: Ingredient[]; recipes: Recipe[];
  meals: PlannedMeal[]; days: DaySetting[]; pantry: PantryStock[];
  trips: ShoppingTrip[]; shoppingItems: ShoppingItem[]; settings: Settings[];
}
export const defaultSettings: Settings = { id: 'app', defaultServings: 2, lastBackupAt: '', backupReminderDays: 7, excludedShoppingCategoryIds: ['seasoning'] };
export const defaultCategories: StoreCategory[] = [
  { id: 'vegetable', name: '野菜・果物', order: 0 },
  { id: 'meat', name: '肉・魚', order: 1 },
  { id: 'dairy', name: '卵・乳製品', order: 2 },
  { id: 'staple', name: '米・麺・パン', order: 3 },
  { id: 'seasoning', name: '調味料', order: 4 },
  { id: 'other', name: 'その他', order: 5 },
];
export function normalizeName(name: string): string { return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ja'); }
export function newId(): string { return crypto.randomUUID(); }
