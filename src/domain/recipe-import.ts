import type { Unit } from './models';
import { manualRecipeSchema, type IngredientInput, type RecipeInput } from './recipe-input';
import { ingredientName, suggestedCategory } from './ingredient-category';

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_AI_RESPONSE_BYTES = 100_000;
export interface ImportContext { sourceUrl?: string; source?: string; defaultServings?: number; ingredientsOnly?: boolean; }
export interface ImportedRecipe { recipe: RecipeInput; warnings: string[]; originalIngredients: string[]; originalYield: string; }
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;

/** Text only: never create a DOM or execute/load anything from imported HTML. */
function text(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(value).replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? match;
    const point = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : match;
  }).trim();
}

export function importSourceUrl(value: string, base?: string): string {
  if (!value.trim()) return '';
  let url: URL;
  try { url = new URL(value.trim(), base); } catch { throw new Error('元レシピのURLを確認してください'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 2000) throw new Error('元レシピは認証情報を含まないhttp(s)のURLにしてください');
  return url.href;
}

function checkedRecipe(value: unknown): RecipeInput {
  const result = manualRecipeSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`レシピJSONの形式を確認してください（${issue?.path.join('.') || '全体'}）。料理名・人数・材料・数量と単位・出典が必要です`);
  }
  return result.data;
}

export function parseAIRecipeAnswer(answer: string, context: ImportContext = {}): ImportedRecipe {
  if (new TextEncoder().encode(answer).byteLength > MAX_AI_RESPONSE_BYTES) throw new Error('回答のJSONは100KB以下にしてください');
  const clean = answer.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
  let parsed: unknown;
  try { parsed = JSON.parse(clean); } catch { throw new Error('JSONを読み取れません。ChatGPTの回答のJSON部分を貼り付けてください'); }
  // Validate first so an answer cannot smuggle IDs or credentials into the app.
  const recipe = checkedRecipe(parsed);
  recipe.sourceUrl = importSourceUrl(context.sourceUrl?.trim() || recipe.sourceUrl);
  recipe.source = context.source?.trim() || recipe.source;
  if (context.ingredientsOnly) recipe.steps = '';
  return { recipe: checkedRecipe(recipe), warnings: ['AIが整理した人数・数量・出典を元レシピと照合してください。'], originalIngredients: [], originalYield: '' };
}

const numberPattern = '(?:\\d+\\s*(?:と| )\\s*\\d+\\s*[/⁄]\\s*\\d+|\\d+\\s*[/⁄]\\s*\\d+|\\d+(?:\\.\\d+)?)';
const unitAliases: Record<string, Unit> = { g: 'g', kg: 'kg', ml: 'ml', l: 'L', 'グラム': 'g', 'キログラム': 'kg', 'ミリリットル': 'ml', 'リットル': 'L', '個': '個', '本': '本', '枚': '枚', '束': '束', '袋': '袋', '缶': '缶', 'パック': 'パック', '大さじ': '大さじ', '小さじ': '小さじ', tbsp: '大さじ', tsp: '小さじ' };
const unitPattern = Object.keys(unitAliases).sort((a, b) => b.length - a.length).join('|');
const suffix = new RegExp(`^(.+?)\\s*(${numberPattern})\\s*(${unitPattern})$`, 'i');
const spoonSuffix = new RegExp(`^(.+?)\\s*(大さじ|小さじ)\\s*(${numberPattern})$`);
const prefix = new RegExp(`^(${numberPattern})\\s*(${unitPattern})\\s+(.+)$`, 'i');

function quantity(value: string): number {
  const mixed = value.match(/^(\d+)\s*(?:と| )\s*(\d+)\s*[/⁄]\s*(\d+)$/);
  const fraction = value.match(/^(\d+)\s*[/⁄]\s*(\d+)$/);
  const result = mixed ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(value);
  return Math.round(result * 1000) / 1000;
}

/** Deliberately conservative: uncertain amounts keep the complete original line. */
export function parseIngredientLine(line: string): { ingredient: IngredientInput; uncertain: boolean } {
  const clean = text(line).normalize('NFKC').replace(/\s+/g, ' ').trim();
  const unknown = { ingredient: { name: clean.replace(/\s*適量$/, '').trim() || clean, quantity: null, unit: '適量' as const, categoryId: 'other' }, uncertain: true };
  if (/[約〜~～–−+]|-\s*\d|\de\d/i.test(clean)) return unknown;
  const spoon = clean.match(spoonSuffix);
  const tail = clean.match(suffix);
  const head = clean.match(prefix);
  const parts = spoon ? [spoon[1], spoon[3], spoon[2]] : tail ? [tail[1], tail[2], tail[3]] : head ? [head[3], head[1], head[2]] : null;
  if (!parts) return unknown;
  const [rawName, rawQuantity, rawUnit] = parts;
  const name = rawName?.trim();
  const amount = quantity(rawQuantity ?? '');
  const unit = unitAliases[rawUnit?.toLowerCase() ?? ''];
  if (!name || !unit || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000 || /(?:\d\s*[/⁄]|各|およそ)$/.test(name)) return unknown;
  return { ingredient: { name, quantity: amount, unit, categoryId: 'other' }, uncertain: false };
}

/** HTML often gives us an explicit food name and a separate amount. Keep them separate. */
export function parseIngredientParts(name: string, amount: string): { ingredient: IngredientInput; uncertain: boolean } {
  const cleanName = ingredientName(text(name));
  const parsed = parseIngredientLine(`${cleanName} ${text(amount)}`);
  return { ingredient: { ...parsed.ingredient, name: cleanName, categoryId: suggestedCategory(cleanName) }, uncertain: parsed.uncertain && text(amount) !== '適量' };
}

function instructions(value: unknown, depth = 0): string[] {
  if (depth > 20) throw new Error('手順の入れ子が深すぎます');
  if (Array.isArray(value)) return value.flatMap(item => instructions(item, depth + 1));
  const item = record(value);
  if (!item) return text(value) ? [text(value)] : [];
  if (item.itemListElement) return [text(item.name), ...instructions(item.itemListElement, depth + 1)].filter(Boolean);
  return text(item.text ?? item.name) ? [text(item.text ?? item.name)] : [];
}

function entityName(value: unknown): string {
  if (Array.isArray(value)) return value.map(entityName).filter(Boolean).join(' / ');
  return text(record(value)?.name ?? value);
}
function servings(value: unknown): number | undefined {
  if (Array.isArray(value)) return value.map(servings).find(item => item !== undefined);
  const item = record(value);
  const raw = text(item ? item.value : value).normalize('NFKC');
  // "12枚" is a yield, not twelve people. Ranges are not a fixed serving count.
  if (item && item.unitText && !/^(人|人分|人前|servings?|people|persons?)$/i.test(text(item.unitText))) return undefined;
  const match = raw.match(/^(\d+)\s*(?:人(?:分|前)?|servings?|people|persons?)?$/i);
  const amount = match ? Number(match[1]) : NaN;
  return Number.isInteger(amount) && amount >= 1 && amount <= 100 ? amount : undefined;
}

function convertRecipe(node: RecordValue, context: ImportContext): ImportedRecipe {
  const warnings: string[] = [];
  const list = Array.isArray(node.recipeIngredient) ? node.recipeIngredient : record(node.recipeIngredient)?.itemListElement;
  if (!Array.isArray(list) || !list.length || list.length > 100) throw new Error('材料は1〜100件の一覧が必要です');
  const originalIngredients = list.map(item => {
    const part = record(item);
    return part?.['@type'] === 'PropertyValue' ? `${text(part.name)} ${text(part.value)}${text(part.unitText)}`.trim() : text(part?.text ?? part?.name ?? item);
  });
  if (originalIngredients.some(line => !line)) throw new Error('対応していない材料形式が含まれています。本文をChatGPTで整理してください');
  const ingredients = originalIngredients.map((line, index) => {
    const part = record(list[index]);
    const parsed = part?.['@type'] === 'PropertyValue'
      ? parseIngredientParts(text(part.name), `${text(part.value)}${text(part.unitText)}`)
      : parseIngredientLine(line);
    if (parsed.uncertain) warnings.push(`数量を確認：「${line}」は適量として取り込みます。`);
    const name = ingredientName(parsed.ingredient.name);
    return { ...parsed.ingredient, name, categoryId: suggestedCategory(name) };
  });
  const count = servings(node.recipeYield);
  const originalYield = Array.isArray(node.recipeYield) ? node.recipeYield.map(item => text(record(item)?.value ?? item)).join(' / ') : text(record(node.recipeYield)?.value ?? node.recipeYield);
  if (!count) warnings.push(`人数を確認：元の分量「${originalYield || '記載なし'}」から人数を確定できません。仮の${context.defaultServings ?? 2}人分を修正してください。`);
  const rawUrl = record(node.url)?.['@id'] ?? node.url ?? record(node.mainEntityOfPage)?.['@id'];
  let sourceUrl = context.sourceUrl ? importSourceUrl(context.sourceUrl) : '';
  if (!sourceUrl && typeof rawUrl === 'string') {
    try { sourceUrl = importSourceUrl(rawUrl); } catch { warnings.push('元レシピのURLを確認して入力してください。'); }
  }
  const attribution = [entityName(node.publisher), entityName(node.author)].filter(Boolean);
  const source = context.source?.trim() || [...new Set(attribution)].join(' / ') || (sourceUrl ? new URL(sourceUrl).hostname : '');
  const recipe = checkedRecipe({ title: text(node.name), servings: count ?? context.defaultServings ?? 2, ingredients, steps: context.ingredientsOnly ? '' : instructions(node.recipeInstructions).join('\n'), source, sourceUrl });
  return { recipe, warnings, originalIngredients, originalYield };
}

export function parseStructuredRecipes(input: string, context: ImportContext = {}): ImportedRecipe[] {
  if (new TextEncoder().encode(input).byteLength > MAX_IMPORT_BYTES) throw new Error('HTML・構造化JSONは2MB以下にしてください');
  if (context.sourceUrl) importSourceUrl(context.sourceUrl);
  const clean = input.trim();
  const documents: unknown[] = [];
  let invalidBlocks = 0;
  const parse = (json: string) => { try { documents.push(JSON.parse(json)); } catch { invalidBlocks++; } };
  if (/^[\[{]/.test(clean)) parse(clean);
  else {
    // Only extract literal JSON-LD script contents; never parse HTML into a live DOM.
    const scripts = clean.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi);
    for (const script of scripts) if (/(?:^|\s)type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json(?:\s|$))/i.test(script[1] ?? '')) parse(script[2] ?? '');
  }
  const nodes: RecordValue[] = [];
  const queue = documents.map(value => ({ value, depth: 0 }));
  for (let index = 0; index < queue.length; index++) {
    if (queue.length > 20_000) throw new Error('構造化データの項目が多すぎます');
    const current = queue[index]!;
    if (current.depth > 30) throw new Error('構造化データの入れ子が深すぎます');
    const item = record(current.value);
    if (item) {
      const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
      if (types.some(type => typeof type === 'string' && /^(?:https?:\/\/schema\.org\/)?Recipe$/.test(type))) nodes.push(item);
    }
    const values = Array.isArray(current.value) ? current.value : item ? Object.values(item) : [];
    for (const value of values) if (value !== null && typeof value === 'object') queue.push({ value, depth: current.depth + 1 });
  }
  if (nodes.length > 20) throw new Error('レシピは一度に20件まで読み込めます。対象の構造化JSONだけを貼り付けてください');
  const result: ImportedRecipe[] = [];
  const failures: string[] = [];
  for (const node of nodes) {
    try { result.push(convertRecipe(node, context)); } catch (error) { failures.push(error instanceof Error ? error.message : '形式が不正です'); }
  }
  if (!result.length) throw new Error(failures[0] ?? 'Recipe形式の構造化データが見つかりません。本文をChatGPTで整理する方法をお試しください');
  const warnings = [invalidBlocks ? `${invalidBlocks}件の壊れたJSONブロックを読み飛ばしました。` : '', failures.length ? `${failures.length}件のレシピは形式が不正なため読み込めませんでした。` : ''].filter(Boolean);
  return result.map(item => ({ ...item, warnings: [...warnings, ...item.warnings] }));
}
