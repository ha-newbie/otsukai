import { importSourceUrl, MAX_IMPORT_BYTES, parseStructuredRecipes, type ImportContext, type ImportedRecipe } from '../domain/recipe-import';
import { AppError } from '../domain/errors';

export function cookpadRecipeUrl(value: string): string {
  try {
    const url = new URL(importSourceUrl(value));
    return /^(?:www\.)?cookpad\.com$/i.test(url.hostname) && /^\/(?:jp\/recipes|recipe)\/\d+(?:[-/]|$)/.test(url.pathname) ? url.href : '';
  } catch { return ''; }
}
const plainText = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** Uses an unattached template: script, images, CSS, frames and handlers stay inert. */
export function parseRecipeDocument(input: string, context: ImportContext = {}): ImportedRecipe[] {
  if (new TextEncoder().encode(input).byteLength > MAX_IMPORT_BYTES) throw new AppError('IMP-1004', {}, 'HTML・構造化JSONは2MB以下にしてください');
  if (!input.trim()) throw new AppError('IMP-1003');
  if (/^[\s]*[\[{]/.test(input)) return parseStructuredRecipes(input, context);
  const template = document.createElement('template');
  template.innerHTML = input;
  const root = template.content;
  const cookpadUrl = [context.sourceUrl ?? '', root.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '', root.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? ''].map(cookpadRecipeUrl).find(Boolean);
  if (!cookpadUrl) return parseStructuredRecipes(input, context);
  let structured: ImportedRecipe[] = [];
  try { structured = parseStructuredRecipes(input, context); } catch { /* The visible ingredients can still be complete without JSON-LD. */ }
  root.querySelectorAll('script, style, link, noscript, iframe, object, embed, template, [hidden], [aria-hidden="true"]').forEach(element => element.remove());
  const section = root.querySelector('article#recipe #ingredients, #ingredients');
  const rows = section?.querySelectorAll('li[id^="ingredient_"], .ingredient_row');
  if (!rows?.length) {
    if (structured.length) return structured.map(value => ({ ...value, warnings: ['材料欄のHTMLを確認できなかったため、構造化データから読み込みました。材料名と分量を確認してください。', ...value.warnings] }));
    throw new AppError('IMP-3002', { url: cookpadUrl }, 'クックパッドの材料欄が見つかりません。材料が表示されたページのHTMLか、ページ取込を使ってください');
  }
  if (rows.length > 100) throw new AppError('IMP-3006', { url: cookpadUrl }, '材料は100件まで取り込めます');
  const parts = Array.from(rows).map(row => {
    const name = plainText(row.querySelector(':scope > span, .ingredient_name, .name'));
    const amount = plainText(row.querySelector(':scope > bdi, .ingredient_quantity, .quantity'));
    if (!name) throw new AppError('IMP-3003', { url: cookpadUrl });
    return { '@type': 'PropertyValue', name, value: amount };
  });
  const heading = plainText(root.querySelector('article#recipe h1, h1'));
  const base = structured.find(value => value.recipe.title === heading) ?? structured[0];
  const author = Array.from(root.querySelectorAll('#author_profile a[href*="/users/"], [itemprop="author"]')).map(plainText).find(Boolean) ?? '';
  const yieldText = plainText(section?.querySelector('[id^="serving_recipe_"] .mise-icon-text, .servings, .servings_for, [itemprop="recipeYield"]') ?? null) || base?.originalYield || '';
  const source = context.source?.trim() || ['クックパッド', author || base?.recipe.source].filter(Boolean).join(' / ');
  const result = parseStructuredRecipes(JSON.stringify({
    '@type': 'Recipe', name: heading || base?.recipe.title || '', recipeYield: yieldText, recipeIngredient: parts,
    recipeInstructions: context.ingredientsOnly ? '' : base?.recipe.steps ?? '',
  }), { ...context, source, sourceUrl: context.sourceUrl || cookpadUrl });
  if (!context.ingredientsOnly && !base?.recipe.steps) result[0]!.warnings.push('作り方は読み込んでいません。必要な場合は元レシピを参照してください。');
  return result;
}
