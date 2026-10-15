import { z } from 'zod';
import { AppError } from '../domain/errors';
import { MAX_AI_RESPONSE_BYTES, parseStructuredRecipes, type ImportContext, type ImportedRecipe } from '../domain/recipe-import';
import { cookpadRecipeUrl } from './cookpad-import';

/** Self-contained: this exact function runs on the user's open Safari page. No network or cookies. */
function captureOpenCookpadPage() {
  const fail = (code: string) => ({ kind: 'otsukai-recipe-page', version: 1, error: { code } });
  try {
    const url = new URL(location.href);
    if (!/^(?:www\.)?cookpad\.com$/i.test(url.hostname) || !/^\/(?:jp\/recipes|recipe)\/\d+(?:[-/]|$)/.test(url.pathname)) return fail('IMP-4001');
    url.search = ''; url.hash = '';
    const content = document.querySelector('article#recipe #ingredients, #ingredients');
    if (!content || content.closest('[hidden], [aria-hidden="true"]') || getComputedStyle(content).display === 'none') return fail('IMP-3002');
    const rows = Array.from(content.querySelectorAll('li[id^="ingredient_"], .ingredient_row')).filter(row => !row.closest('[hidden], [aria-hidden="true"]'));
    if (!rows.length) return fail('IMP-3002');
    if (rows.length > 100) return fail('IMP-3006');
    const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const ingredients = rows.map(row => ({ '@type': 'PropertyValue', name: text(row.querySelector(':scope > span, .ingredient_name, .name')), value: text(row.querySelector(':scope > bdi, .ingredient_quantity, .quantity')) }));
    if (ingredients.some(item => !item.name)) return fail('IMP-3003');
    const title = text(document.querySelector('article#recipe h1, h1'));
    if (!title) return fail('IMP-3004');
    const author = Array.from(document.querySelectorAll('#author_profile a[href*="/users/"], [itemprop="author"]')).map(text).find(Boolean) ?? '';
    const payload = { kind: 'otsukai-recipe-page', version: 1, recipe: {
      '@type': 'Recipe', name: title, url: url.href,
      recipeYield: text(content.querySelector('[id^="serving_recipe_"] .mise-icon-text, .servings, .servings_for, [itemprop="recipeYield"]')),
      recipeIngredient: ingredients, publisher: { name: 'クックパッド' }, author: { name: author },
    } };
    return new TextEncoder().encode(JSON.stringify(payload)).byteLength > 100000 ? fail('IMP-1004') : payload;
  } catch { return fail('IMP-4005'); }
}

/** Apple Shortcuts must receive a Safari webpage and call completion exactly once. */
export function safariCaptureScript(): string {
  return `// おつかい: 開いているクックパッドの材料だけを取得。通信・Cookie読取・ページ変更は行いません。\nif (typeof completion !== 'function') { throw new Error('[IMP-4001] Safariの共有メニューからショートカットを実行してください'); }\ncompletion(JSON.stringify((${captureOpenCookpadPage.toString()})()));`;
}

const pageErrorCodes = ['IMP-1004', 'IMP-3002', 'IMP-3003', 'IMP-3004', 'IMP-3006', 'IMP-4001', 'IMP-4005'] as const;
const captureSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('success'), recipe: z.object({ '@type': z.literal('Recipe'), url: z.string() }).passthrough() }).strict(),
  z.object({ status: z.literal('error'), error: z.object({ code: z.enum(pageErrorCodes) }).strict() }).strict(),
]);
export function parsePageCapture(input: string, context: ImportContext = {}): ImportedRecipe[] {
  if (!input.trim()) throw new AppError('IMP-1003', { phase: 'ページ取込' });
  if (new TextEncoder().encode(input).byteLength > MAX_AI_RESPONSE_BYTES) throw new AppError('IMP-1004', { phase: 'ページ取込' });
  let raw: unknown;
  try { raw = JSON.parse(input); } catch { throw new AppError('IMP-4002'); }
  const outer = z.object({ kind: z.literal('otsukai-recipe-page'), version: z.literal(1), recipe: z.unknown().optional(), error: z.unknown().optional() }).strict().safeParse(raw);
  if (!outer.success || (outer.data.recipe === undefined) === (outer.data.error === undefined)) throw new AppError('IMP-4002');
  const result = captureSchema.safeParse(outer.data.error === undefined ? { status: 'success', recipe: outer.data.recipe } : { status: 'error', error: outer.data.error });
  if (!result.success) throw new AppError('IMP-4002');
  if (result.data.status === 'error') throw new AppError(result.data.error.code, { phase: '元ページで材料を取得' });
  const url = cookpadRecipeUrl(result.data.recipe.url);
  const id = (value: string) => new URL(value).pathname.match(/\/(?:jp\/recipes|recipe)\/(\d+)/)?.[1];
  if (!url || (context.sourceUrl && (!cookpadRecipeUrl(context.sourceUrl) || id(context.sourceUrl) !== id(url)))) throw new AppError('IMP-4002');
  return parseStructuredRecipes(JSON.stringify(result.data.recipe), { ...context, sourceUrl: url, ingredientsOnly: true });
}

export async function copyImportText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new AppError('IMP-4003');
  try { await navigator.clipboard.writeText(text); } catch { throw new AppError('IMP-4004'); }
}
