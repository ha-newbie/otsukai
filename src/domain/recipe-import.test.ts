import { describe, expect, it } from 'vitest';
import { importSourceUrl, MAX_IMPORT_BYTES, parseAIRecipeAnswer, parseIngredientLine, parseStructuredRecipes } from './recipe-import';

const recipe = { '@type': 'Recipe', name: 'にんじんスープ', recipeYield: '2人分', recipeIngredient: ['にんじん 200g', '牛乳 0.5L', '塩 適量'], recipeInstructions: [{ '@type': 'HowToSection', name: '下ごしらえ', itemListElement: [{ '@type': 'HowToStep', text: '材料を切る。' }] }, { '@type': 'HowToStep', text: '煮る。' }], publisher: { name: '料理ノート' }, author: { name: '作者' }, url: 'https://example.com/recipe/1' };
const answer = { title: 'スープ', servings: 2, ingredients: [{ name: 'にんじん', quantity: 100, unit: 'g', categoryId: 'vegetable' }], steps: '', source: 'AIの出典', sourceUrl: 'https://example.com/model' };

describe('推測しない材料解析', () => {
  it.each([
    ['にんじん２００ｇ', 'にんじん', 200, 'g'], ['玉ねぎ 1/2個', '玉ねぎ', 0.5, '個'],
    ['しょうゆ 大さじ1と1/2', 'しょうゆ', 1.5, '大さじ'], ['砂糖 1 1/2g', '砂糖', 1.5, 'g'],
    ['水 １／３Ｌ', '水', 0.333, 'L'], ['200 g carrots', 'carrots', 200, 'g'], ['小麦粉 0.5キログラム', '小麦粉', 0.5, 'kg'],
  ])('%sを対応単位で読み取る', (input, name, amount, unit) => {
    expect(parseIngredientLine(input as string)).toEqual({ ingredient: { name, quantity: amount, unit, categoryId: 'other' }, uncertain: false });
  });
  it.each(['卵 1〜2個', '水 1カップ', '肉 1枚(約250g)', '塩 少々', '塩 -1g', '塩 1/0g', '卵 各2個', '牛乳 10000000ml', '肉 100g + 50g', '塩 1e3g'])('%sは元の表記を残して適量にする', input => {
    expect(parseIngredientLine(input)).toEqual({ ingredient: { name: input.normalize('NFKC'), quantity: null, unit: '適量', categoryId: 'other' }, uncertain: true });
  });
});

describe('Recipe構造化データの取込', () => {
  it('材料だけの指定では作り方を保存せず、調味料は残す', () => {
    const result = parseStructuredRecipes(JSON.stringify(recipe), { ingredientsOnly: true })[0]!;
    expect(result.recipe.steps).toBe('');
    expect(result.recipe.ingredients.find(value => value.name === '塩')).toMatchObject({ quantity: null, categoryId: 'seasoning' });
    expect(parseAIRecipeAnswer(JSON.stringify({ ...answer, steps: '保存しない作り方' }), { ingredientsOnly: true }).recipe.steps).toBe('');
  });
  it('名前と分量が分離した材料を扱い、元表記は確認用に残す', () => {
    const result = parseStructuredRecipes(JSON.stringify({ ...recipe, recipeIngredient: [{ '@type': 'PropertyValue', name: 'ご飯', value: '茶碗1杯' }, { '@type': 'PropertyValue', name: '●しょうゆ', value: 1, unitText: '大さじ' }] }))[0]!;
    expect(result.recipe.ingredients).toEqual([{ name: 'ご飯', quantity: null, unit: '適量', categoryId: 'other' }, { name: 'しょうゆ', quantity: 1, unit: '大さじ', categoryId: 'seasoning' }]);
    expect(result.originalIngredients).toEqual(['ご飯 茶碗1杯', '●しょうゆ 1大さじ']);
  });
  it('HTMLのJSON-LD、@graph、手順の節と出典を取り込む', () => {
    const html = `<html><script>alert('実行しない');</script><img src="https://example.com/tracker"><script type="application/ld+json">${JSON.stringify({ '@graph': [recipe] })}</script></html>`;
    const result = parseStructuredRecipes(html)[0]!;
    expect(result.recipe).toMatchObject({ title: 'にんじんスープ', servings: 2, steps: '下ごしらえ\n材料を切る。\n煮る。', source: '料理ノート / 作者', sourceUrl: 'https://example.com/recipe/1' });
    expect(result.recipe.ingredients[0]).toMatchObject({ name: 'にんじん', quantity: 200, unit: 'g' });
    expect(result.originalIngredients).toEqual(recipe.recipeIngredient);
    expect(result.warnings.join(' ')).toContain('塩 適量');
  });
  it('複数レシピを返し、壊れたブロックと無効なレシピを通知する', () => {
    const input = `<script type='application/ld+json'>{</script><script type=application/ld+json>${JSON.stringify([recipe, { ...recipe, name: '別のレシピ', '@type': ['CreativeWork', 'https://schema.org/Recipe'] }, { ...recipe, recipeIngredient: [] }])}</script>`;
    const result = parseStructuredRecipes(input);
    expect(result).toHaveLength(2);
    expect(result[0]!.warnings.join(' ')).toContain('壊れたJSON');
    expect(result[0]!.warnings.join(' ')).toContain('形式が不正');
  });
  it('枚数や幅のある人数を人数として推測せず、仮人数を明示する', () => {
    for (const recipeYield of ['12枚', '2〜3人分', { value: 12, unitText: '枚' }, undefined]) {
      const result = parseStructuredRecipes(JSON.stringify({ ...recipe, recipeYield }), { defaultServings: 4 })[0]!;
      expect(result.recipe.servings).toBe(4); expect(result.warnings.join(' ')).toContain('仮の4人分');
    }
    expect(parseStructuredRecipes(JSON.stringify({ ...recipe, recipeYield: { value: 3, unitText: '人分' } }))[0]!.recipe.servings).toBe(3);
  });
  it('入力元URLと出典を優先し、元データを変更しない', () => {
    const before = JSON.stringify(recipe);
    const result = parseStructuredRecipes(before, { sourceUrl: 'https://original.example/page', source: '元サイト' })[0]!;
    expect(result.recipe.sourceUrl).toBe('https://original.example/page'); expect(result.recipe.source).toBe('元サイト');
    expect(JSON.stringify(recipe)).toBe(before);
  });
  it('HTMLを実行せずテキストだけにし、コメント内やdata-typeのデータを読まない', () => {
    const result = parseStructuredRecipes(JSON.stringify({ ...recipe, name: '<b>スープ</b> &amp; &#x91CE;&#33756;', recipeInstructions: '切る<br>煮る' }))[0]!;
    expect(result.recipe.title).toBe('スープ & 野菜'); expect(result.recipe.steps).toBe('切る\n煮る');
    expect(() => parseStructuredRecipes(`<!--<script type="application/ld+json">${JSON.stringify(recipe)}</script>-->`)).toThrow('見つかりません');
    expect(() => parseStructuredRecipes(`<script data-type="application/ld+json">${JSON.stringify(recipe)}</script>`)).toThrow('見つかりません');
  });
  it('無効なRecipe・大きな入力・深いデータを拒否する', () => {
    expect(() => parseStructuredRecipes('a'.repeat(MAX_IMPORT_BYTES + 1))).toThrow('2MB');
    expect(() => parseStructuredRecipes(JSON.stringify({ ...recipe, name: '' }))).toThrow('形式');
    let deep: unknown = recipe;
    for (let i = 0; i < 35; i++) deep = { nested: deep };
    expect(() => parseStructuredRecipes(JSON.stringify(deep))).toThrow('入れ子');
  });
});

describe('手動AI回答の境界', () => {
  it('JSONと単一コードブロックを受け入れて、入力元の出典を保持する', () => {
    const result = parseAIRecipeAnswer('```json\n' + JSON.stringify(answer) + '\n```', { sourceUrl: 'https://original.example/recipe', source: '元サイト' });
    expect(result.recipe).toMatchObject({ title: 'スープ', sourceUrl: 'https://original.example/recipe', source: '元サイト' });
    expect(parseAIRecipeAnswer(JSON.stringify(answer)).recipe.title).toBe('スープ');
  });
  it('ID・トークン・数量不整合・余分な説明・大きな回答を拒否する', () => {
    for (const extra of [{ id: 'existing' }, { access_token: 'not-an-actual-token' }, { ingredients: [{ ...answer.ingredients[0], unit: '適量' }] }]) expect(() => parseAIRecipeAnswer(JSON.stringify({ ...answer, ...extra }))).toThrow('形式');
    expect(() => parseAIRecipeAnswer('こちらです\n' + JSON.stringify(answer))).toThrow('JSON');
    expect(() => parseAIRecipeAnswer('a'.repeat(100001))).toThrow('100KB');
  });
  it('元URLの危険なスキームや認証情報を拒否する', () => {
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:password@example.com/']) expect(() => importSourceUrl(url)).toThrow('URL');
    expect(importSourceUrl('/recipe/1', 'https://example.com')).toBe('https://example.com/recipe/1');
  });
});
