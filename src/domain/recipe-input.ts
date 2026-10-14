import { z } from 'zod';
import { nameSchema, quantitySchema, recipeSchema, servingsSchema, unitSchema, type Unit } from './models';

export interface IngredientInput { name: string; quantity: number | null; unit: Unit; categoryId: string; }
export interface RecipeInput { id?: string; title: string; servings: number; ingredients: IngredientInput[]; steps: string; source: string; sourceUrl: string; }

/** Import boundary: intentionally excludes IDs, tokens and unknown properties. */
export const manualRecipeSchema = z.object({
  title: nameSchema, servings: servingsSchema,
  ingredients: z.array(z.object({ name: nameSchema, quantity: quantitySchema.nullable(), unit: unitSchema, categoryId: z.enum(['vegetable', 'meat', 'dairy', 'staple', 'seasoning', 'other']) }).strict().refine(value => value.unit === '適量' ? value.quantity === null : value.quantity !== null, '数量と単位が一致しません')).min(1).max(100),
  steps: recipeSchema.shape.steps, source: recipeSchema.shape.source, sourceUrl: recipeSchema.shape.sourceUrl,
}).strict();
