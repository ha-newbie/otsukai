import type { AppData, PantryStock, RecipeIngredient, Unit } from './models';

export function round(value: number): number { return Math.round((value + Number.EPSILON) * 1000) / 1000; }
export function canonicalUnit(unit: Unit): Unit { return unit === 'kg' ? 'g' : unit === 'L' ? 'ml' : unit; }
export function unitFactor(unit: Unit): number { return unit === 'kg' || unit === 'L' ? 1000 : 1; }
export function convert(quantity: number, from: Unit, to: Unit): number | null {
  if (from === '適量' || to === '適量' || canonicalUnit(from) !== canonicalUnit(to)) return null;
  return round(quantity * unitFactor(from) / unitFactor(to));
}
export function scaledQuantity(ingredient: RecipeIngredient, recipeServings: number, servings: number): number | null {
  return ingredient.quantity === null ? null : round(ingredient.quantity * servings / recipeServings);
}
export function amountLabel(quantity: number | null, unit: Unit): string {
  if (quantity === null) return '適量';
  return `${quantity.toLocaleString('ja-JP', { maximumFractionDigits: 3 })}${['g', 'kg', 'ml', 'L'].includes(unit) ? ' ' : ''}${unit}`;
}
export interface Need { ingredientId: string; quantity: number | null; unit: Unit; date: string; }
export interface ShoppingLine {
  ingredientId: string; unit: Unit; quantity: number | null;
  plannedQuantity: number | null; pantryQuantity: number;
}
export function excludedShoppingIngredients(data: AppData): Set<string> {
  const categories = new Set(data.settings[0]?.excludedShoppingCategoryIds ?? []);
  return new Set(data.ingredients.filter(value => categories.has(value.categoryId)).map(value => value.id));
}
export function requirements(data: AppData, from: string, through: string): Need[] {
  const recipes = new Map(data.recipes.map(recipe => [recipe.id, recipe]));
  const servingsByDate = new Map(data.days.map(day => [day.id, day.servings]));
  const defaultServings = data.settings[0]?.defaultServings ?? 2;
  return data.meals.filter(meal => meal.date >= from && meal.date <= through).sort((a, b) => a.date.localeCompare(b.date)).flatMap(meal => {
    const recipe = recipes.get(meal.recipeId);
    if (!recipe) return [];
    return recipe.ingredients.map(ingredient => ({
      ingredientId: ingredient.ingredientId,
      quantity: ingredient.quantity === null ? null : round((scaledQuantity(ingredient, recipe.servings, servingsByDate.get(meal.date) ?? defaultServings) ?? 0) * unitFactor(ingredient.unit)),
      unit: canonicalUnit(ingredient.unit), date: meal.date,
    }));
  });
}
/** Each physical stock lot has one mutable remainder in this pure calculation. */
export function allocateNeeds(needs: Need[], pantry: PantryStock[]): { lines: Map<string, ShoppingLine>; remaining: Map<string, number> } {
  const remaining = new Map(pantry.map(stock => [stock.id, stock.quantity * unitFactor(stock.unit)]));
  const lines = new Map<string, ShoppingLine>();
  const sortedStocks = [...pantry].sort((a, b) => (a.expiresOn || '9999').localeCompare(b.expiresOn || '9999'));
  for (const need of [...needs].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = `${need.date}|${need.ingredientId}|${need.unit}`;
    const previous = lines.get(key);
    if (need.quantity === null) {
      lines.set(key, { ingredientId: need.ingredientId, unit: need.unit, quantity: null, plannedQuantity: null, pantryQuantity: 0 });
      continue;
    }
    let shortage = need.quantity;
    for (const stock of sortedStocks) {
      if (stock.ingredientId !== need.ingredientId || canonicalUnit(stock.unit) !== need.unit || (stock.expiresOn && stock.expiresOn < need.date)) continue;
      const available = remaining.get(stock.id) ?? 0;
      const used = Math.min(available, shortage);
      remaining.set(stock.id, round(available - used));
      shortage = round(shortage - used);
      if (shortage === 0) break;
    }
    lines.set(key, {
      ingredientId: need.ingredientId, unit: need.unit,
      quantity: round((previous?.quantity ?? 0) + shortage),
      plannedQuantity: round((previous?.plannedQuantity ?? 0) + need.quantity),
      pantryQuantity: round((previous?.pantryQuantity ?? 0) + need.quantity - shortage),
    });
  }
  return { lines, remaining };
}
/** Prior upcoming meals reserve stock before the selected week's needs. */
export function shoppingLines(data: AppData, startsOn: string, endsOn: string, today: string): ShoppingLine[] {
  const allocation = allocateNeeds(requirements(data, today, endsOn), data.pantry);
  const excluded = excludedShoppingIngredients(data);
  const result = new Map<string, ShoppingLine>();
  for (const [datedKey, line] of allocation.lines) {
    if (datedKey.slice(0, 10) < startsOn) continue;
    if (excluded.has(line.ingredientId)) continue;
    const key = `${line.ingredientId}|${line.unit}`;
    const previous = result.get(key);
    result.set(key, {
      ...line,
      quantity: line.quantity === null ? null : round((previous?.quantity ?? 0) + line.quantity),
      plannedQuantity: line.plannedQuantity === null ? null : round((previous?.plannedQuantity ?? 0) + line.plannedQuantity),
      pantryQuantity: round((previous?.pantryQuantity ?? 0) + line.pantryQuantity),
    });
  }
  return [...result.values()];
}
export function forecastPantry(data: AppData, today: string, through: string): Map<string, number> {
  const { remaining } = allocateNeeds(requirements(data, today, through), data.pantry);
  return new Map(data.pantry.map(stock => [stock.id, round((remaining.get(stock.id) ?? 0) / unitFactor(stock.unit))]));
}
