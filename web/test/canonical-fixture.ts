import type { CanonicalRecipe } from '../src/catalog/canonical.ts';
import type { PublicDish } from '../src/domain/types.ts';

export const CANONICAL_FIXTURE_REVISION = 'fixed-fixture-v1';

/** Explicit canonical public facts for isolated tests; no database or legacy text inference. */
export function canonicalRecipeFixture(id = 1, overrides: Partial<CanonicalRecipe> = {}): CanonicalRecipe {
  return {
    quantityPolicy: 'fixed-recipe-v1', id, name: `测试菜${id}`, baseServings: 2,
    categoryCode: 'CAT_VEGETABLE', mealCodes: ['MEAL_LUNCH', 'MEAL_DINNER'],
    dishGroupId: `family-${id}`, servingRole: 'dish',
    ingredients: [{ id: 'i1', ingredientId: 'ing_green', quantity: 100, quantityKind: 'exact',
      unit: 'g', preparation: '', optional: false, defaultEnabled: true,
      ingredient: { id: 'ing_green', name: '青菜', aliases: ['小青菜'], animal: false, animalOrigins: [], allergens: [] } }],
    steps: [{ id: 's1', text: '洗净并煮熟。', ingredientLineIds: ['i1'] }],
    dietaryCodes: ['DIET_VEGAN'], allergenCodes: [], timing: { totalMinutes: null },
    calculatedNutrition: { completeness: 'partial', total: null, perServing: null, perServingUnavailableReason: 'diners_not_specified' },
    ...overrides,
  };
}

export function canonicalPublicDish(id = 1, overrides: Partial<PublicDish> = {}, recipeOverrides: Partial<CanonicalRecipe> = {}): PublicDish & { quantityPolicy: 'fixed-recipe-v1' } {
  const recipe = canonicalRecipeFixture(id, recipeOverrides);
  return {
    quantityPolicy: 'fixed-recipe-v1', id, name: recipe.name, type: 'veg', cl: null, fl: null, step: null, steps: null,
    tips: null, ingredientsAmounts: null, contentVersion: `fixture-content-${id}`,
    catalogRevision: CANONICAL_FIXTURE_REVISION, recipe, quality: null, ...overrides,
  };
}
