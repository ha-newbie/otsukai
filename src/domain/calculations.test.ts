import { describe, expect, it } from 'vitest';
import { allocateNeeds, convert, forecastPantry, scaledQuantity, shoppingLines } from './calculations';
import { defaultCategories, defaultSettings, normalizeName, type AppData, type PantryStock, type Recipe } from './models';
import { addDays, monday } from './dates';

const now = '2026-10-14T00:00:00.000Z';
function fixture(): AppData {
  const recipe: Recipe = { id: 'recipe', title: 'スープ', servings: 2, ingredients: [{ ingredientId: 'carrot', quantity: 200, unit: 'g' }], steps: '', source: '', sourceUrl: '', createdAt: now, updatedAt: now };
  return { categories: defaultCategories, settings: [defaultSettings], ingredients: [{ id: 'carrot', name: 'にんじん', normalizedName: 'にんじん', categoryId: 'vegetable' }], recipes: [recipe], meals: [{ id: 'meal1', recipeId: 'recipe', date: '2026-10-14', slot: 'dinner' }, { id: 'meal2', recipeId: 'recipe', date: '2026-10-15', slot: 'lunch' }], days: [], pantry: [{ id: 'stock', ingredientId: 'carrot', quantity: 0.3, unit: 'kg', expiresOn: '' }], trips: [], shoppingItems: [] };
}
describe('単位と人数', () => {
  it('質量・体積だけを互換換算する', () => {
    expect(convert(1.2, 'kg', 'g')).toBe(1200);
    expect(convert(750, 'ml', 'L')).toBe(0.75);
    expect(convert(1, 'g', 'ml')).toBeNull();
    expect(convert(1, '個', '本')).toBeNull();
    expect(convert(1, '大さじ', 'ml')).toBeNull();
  });
  it('人数を比例換算し、適量は推測しない', () => {
    expect(scaledQuantity({ ingredientId: 'i', quantity: 0.5, unit: '個' }, 2, 3)).toBe(0.75);
    expect(scaledQuantity({ ingredientId: 'i', quantity: null, unit: '適量' }, 2, 3)).toBeNull();
  });
  it('名前の全角半角・空白を正規化する', () => { expect(normalizeName('  ＭＩＬＫ  ')).toBe('milk'); });
});
describe('献立の集計と在庫', () => {
  it('調味料を買い物から除外しても、レシピと在庫の使用予定に残す', () => {
    const data = fixture();
    data.ingredients.push({ id: 'salt', name: '塩', normalizedName: '塩', categoryId: 'seasoning' });
    data.recipes[0]!.ingredients.push({ ingredientId: 'salt', quantity: 2, unit: 'g' }, { ingredientId: 'salt', quantity: null, unit: '適量' });
    data.pantry.push({ id: 'saltStock', ingredientId: 'salt', quantity: 10, unit: 'g', expiresOn: '' });
    expect(shoppingLines(data, '2026-10-12', '2026-10-18', '2026-10-14').some(value => value.ingredientId === 'salt')).toBe(false);
    expect(forecastPantry(data, '2026-10-14', '2026-10-18').get('saltStock')).toBe(6);
    expect(data.recipes[0]!.ingredients).toHaveLength(3);
    expect(data.pantry.find(value => value.id === 'saltStock')?.quantity).toBe(10);
    data.settings = [{ ...defaultSettings, excludedShoppingCategoryIds: [] }];
    expect(shoppingLines(data, '2026-10-12', '2026-10-18', '2026-10-14').filter(value => value.ingredientId === 'salt')).toHaveLength(2);
  });
  it('複数日の需要から在庫を一度だけ引く', () => {
    const data = fixture();
    const lines = shoppingLines(data, '2026-10-12', '2026-10-18', '2026-10-14');
    expect(lines).toEqual([{ ingredientId: 'carrot', unit: 'g', quantity: 100, plannedQuantity: 400, pantryQuantity: 300 }]);
    expect(data.pantry[0]?.quantity).toBe(0.3);
    expect(shoppingLines(data, '2026-10-12', '2026-10-18', '2026-10-14')).toEqual(lines);
  });
  it('日別人数に応じて需要を計算する', () => {
    const data = fixture(); data.days.push({ id: '2026-10-15', servings: 4 });
    expect(shoppingLines(data, '2026-10-12', '2026-10-18', '2026-10-14')[0]?.quantity).toBe(300);
  });
  it('期限を過ぎる献立ではそのロットを使わない', () => {
    const data = fixture(); data.pantry[0]!.expiresOn = '2026-10-14';
    expect(shoppingLines(data, '2026-10-12', '2026-10-18', '2026-10-14')[0]).toMatchObject({ quantity: 200, pantryQuantity: 200 });
  });
  it('期限の早いロットから利用する', () => {
    const stocks: PantryStock[] = [{ id: 'later', ingredientId: 'i', quantity: 100, unit: 'g', expiresOn: '2026-10-20' }, { id: 'earlier', ingredientId: 'i', quantity: 100, unit: 'g', expiresOn: '2026-10-16' }];
    const result = allocateNeeds([{ ingredientId: 'i', unit: 'g', quantity: 50, date: '2026-10-14' }], stocks);
    expect(result.remaining.get('earlier')).toBe(50); expect(result.remaining.get('later')).toBe(100);
  });
  it('個数と重量は別の買い物行にする', () => {
    const data = fixture(); data.recipes[0]!.ingredients.push({ ingredientId: 'carrot', quantity: 1, unit: '個' });
    expect(shoppingLines(data, '2026-10-12', '2026-10-18', '2026-10-14').map(line => [line.unit, line.quantity])).toEqual([['g', 100], ['個', 2]]);
  });
  it('同じ食材でも適量を数値に混ぜない', () => {
    const data = fixture(); data.recipes[0]!.ingredients.push({ ingredientId: 'carrot', quantity: null, unit: '適量' });
    expect(shoppingLines(data, '2026-10-12', '2026-10-18', '2026-10-14').find(line => line.unit === '適量')?.quantity).toBeNull();
  });
  it('前週の未到来の献立分を先に確保する', () => {
    const data = fixture(); data.meals[1]!.date = '2026-10-20';
    expect(shoppingLines(data, '2026-10-19', '2026-10-25', '2026-10-14')[0]).toMatchObject({ plannedQuantity: 200, pantryQuantity: 100, quantity: 100 });
  });
  it('過去日の需要を含めない', () => {
    const data = fixture(); data.meals[0]!.date = '2026-10-13';
    expect(shoppingLines(data, '2026-10-12', '2026-10-18', '2026-10-14')[0]?.quantity).toBe(0);
  });
  it('予定残量を元の在庫単位で返す', () => {
    const data = fixture(); data.meals.pop();
    expect(forecastPantry(data, '2026-10-14', '2026-10-18').get('stock')).toBe(0.1);
  });
  it('不足量・残量が浮動小数の負数にならない', () => {
    const result = allocateNeeds([{ ingredientId: 'i', quantity: 0.3, unit: '個', date: '2026-10-14' }], [{ id: 's', ingredientId: 'i', quantity: 0.1 + 0.2, unit: '個', expiresOn: '' }]);
    expect([...result.lines.values()][0]?.quantity).toBe(0); expect(result.remaining.get('s')).toBe(0);
  });
});
describe('ローカル日付', () => {
  it('月曜起点と月跨ぎ・日曜を扱う', () => {
    expect(monday('2026-10-18')).toBe('2026-10-12');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});
