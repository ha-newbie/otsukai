import { afterEach, expect, it, vi } from 'vitest';
import { copyImportText, parsePageCapture, safariCaptureScript } from './page-capture';

afterEach(() => vi.unstubAllGlobals());
const capture = { kind: 'otsukai-recipe-page', version: 1, recipe: { '@type': 'Recipe', name: '材料取込テスト', url: 'https://cookpad.com/jp/recipes/999000001', recipeYield: '2人分', recipeIngredient: [{ '@type': 'PropertyValue', name: 'しょうゆ', value: '大さじ1' }], publisher: { name: 'クックパッド' } } };
it('元ページの材料・出典・URLを検証し、手順を自動追加しない', () => {
  const result = parsePageCapture(JSON.stringify(capture), { sourceUrl: 'https://cookpad.com/recipe/999000001', ingredientsOnly: false })[0]!;
  expect(result.recipe).toMatchObject({ sourceUrl: capture.recipe.url, source: 'クックパッド', steps: '', ingredients: [{ name: 'しょうゆ', quantity: 1, unit: '大さじ', categoryId: 'seasoning' }] });
});
it('別レシピ・偽ホスト・トークン混入・未知形式・過大データを拒否する', () => {
  expect(() => parsePageCapture(JSON.stringify(capture), { sourceUrl: 'https://cookpad.com/jp/recipes/18472521' })).toThrow(expect.objectContaining({ code: 'IMP-4002' }));
  for (const data of [ { ...capture, access_token: 'secret' }, { ...capture, recipe: { ...capture.recipe, url: 'https://cookpad.com.evil.test/jp/recipes/999000001' } }, { ...capture, version: 999 } ]) expect(() => parsePageCapture(JSON.stringify(data))).toThrow(expect.objectContaining({ code: 'IMP-4002' }));
  expect(() => parsePageCapture('{')).toThrow(expect.objectContaining({ code: 'IMP-4002' }));
  expect(() => parsePageCapture('x'.repeat(100001))).toThrow(expect.objectContaining({ code: 'IMP-1004' }));
});
it('元ページの失敗コードを保持するが、任意コードは受け入れない', () => {
  expect(() => parsePageCapture(JSON.stringify({ kind: capture.kind, version: 1, error: { code: 'IMP-3002' } }))).toThrow(expect.objectContaining({ code: 'IMP-3002' }));
  expect(() => parsePageCapture(JSON.stringify({ kind: capture.kind, version: 1, error: { code: 'ADMIN-0001' } }))).toThrow(expect.objectContaining({ code: 'IMP-4002' }));
  expect(safariCaptureScript()).toContain('completion(JSON.stringify(');
});
it('コピー未対応と権限拒否を区別する', async () => {
  vi.stubGlobal('navigator', {});
  await expect(copyImportText('script')).rejects.toMatchObject({ code: 'IMP-4003' });
  vi.stubGlobal('navigator', { clipboard: { writeText: async () => { throw new DOMException('denied', 'NotAllowedError'); } } });
  await expect(copyImportText('script')).rejects.toMatchObject({ code: 'IMP-4004' });
});
