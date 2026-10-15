import { describe, expect, it } from 'vitest';
import { ingredientName, suggestedCategory } from './ingredient-category';
import { parseIngredientParts } from './recipe-import';

describe('材料名と調味料の分類', () => {
  it('グループ記号だけを取り除き食材名を揃える', () => {
    expect(ingredientName('●（A） しょうゆ')).toBe('しょうゆ');
    expect(ingredientName('A 砂糖')).toBe('砂糖');
    expect(ingredientName('A1ソース')).toBe('A1ソース');
    expect(ingredientName('◯醤油')).toBe('醤油');
    expect(suggestedCategory('◯醤油')).toBe('seasoning');
  });
  it('既知の調味料を分類し、塩鮭などの部分一致は使わない', () => {
    for (const value of ['しょうゆ', '醤油（濃口）', '●砂糖', 'オリーブオイル', '塩こしょう']) expect(suggestedCategory(value)).toBe('seasoning');
    for (const value of ['塩鮭', '塩昆布', '豆乳', 'バター', '未知の食材']) expect(suggestedCategory(value)).toBe('other');
  });
  it('材料名と分量が別なら、未知の分量を食材名へ混ぜない', () => {
    expect(parseIngredientParts('ご飯', '茶碗1杯')).toEqual({ ingredient: { name: 'ご飯', quantity: null, unit: '適量', categoryId: 'other' }, uncertain: true });
    expect(parseIngredientParts('★しょうゆ', '大さじ1と1/2').ingredient).toEqual({ name: 'しょうゆ', quantity: 1.5, unit: '大さじ', categoryId: 'seasoning' });
    expect(parseIngredientParts('塩', '少々').ingredient).toEqual({ name: '塩', quantity: null, unit: '適量', categoryId: 'seasoning' });
  });
});
