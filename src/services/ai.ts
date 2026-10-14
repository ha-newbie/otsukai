import type { PantryStock, Recipe } from '../domain/models';
import type { RecipeInput } from '../persistence/repository';

export interface MealPreferences { servings: number; dislikes: string[]; restrictions: string[]; }
export interface MealSuggestion { date: string; slot: 'breakfast' | 'lunch' | 'dinner'; recipe: RecipeInput; }
/** Future adapter only. No authentication, paid API call, or token persistence. */
export interface AIProvider {
  suggestWeek(input: { pantry: PantryStock[]; recipes: Recipe[]; preferences: MealPreferences; startsOn: string }): Promise<MealSuggestion[]>;
  extractRecipe(input: { text?: string; url?: string }): Promise<RecipeInput>;
  normalizeIngredients(names: string[]): Promise<string[]>;
}
export function recipePrompt(text: string): string {
  return `次のレシピを日本語で整理し、JSONだけを返してください。知らない数量を推測せずquantity:null, unit:"適量"にしてください。URL先を取得できない場合は本文の貼り付けを依頼してください。categoryIdはvegetable/meat/dairy/staple/seasoning/otherのいずれか。単位はg/kg/ml/L/個/本/枚/束/袋/缶/パック/大さじ/小さじ/適量。形式: {"title":"料理名","servings":2,"ingredients":[{"name":"食材名","quantity":100,"unit":"g","categoryId":"vegetable"}],"steps":"手順","source":"出典","sourceUrl":""}\n\n入力:\n${text}`;
}
