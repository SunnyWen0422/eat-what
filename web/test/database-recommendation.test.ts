import { expect, it } from 'vitest';
import { createPublicCatalogProvider, loadCatalog } from '../src/catalog/catalog.ts';
import { generateMeal, replaceSlot } from '../src/menu/rules.ts';
import type { GenerateInput, LocalDate } from '../src/domain/types.ts';
import { draft } from './fixtures.ts';
import { canonicalPublicDish, canonicalRecipeFixture } from './canonical-fixture.ts';

async function input(): Promise<GenerateInput> {
  const rows = ['meat', 'veg'].flatMap((type, i) => [1, 2, 3, 4].map(n => canonicalPublicDish(i * 4 + n, {}, {
    name: `${type}${n}`, categoryCode: type === 'meat' ? 'CAT_MEAT' : 'CAT_VEGETABLE',
    baseServings: null, dietaryCodes: null, allergenCodes: null,
    ingredients: canonicalRecipeFixture().ingredients.map(line => ({ ...line, quantity: null, quantityKind: 'discretionary' as const, quantityDisplay: '适量' })),
  })));
  const result = await loadCatalog(createPublicCatalogProvider(async q => ({ ...q, total: rows.length, list: rows })));
  if (!result.ok) throw new Error(result.error.message);
  return { catalog: result.value, draft: draft(), hardExclusions: [], unresolvedExclusions: [], favoriteIds: [], actualMeals: [], today: '2026-10-10' as LocalDate, seed: 123 };
}
it('recommends canonical database rows while preserving unknown source servings, amounts and allergens', async () => {
  const value = await input(); const result = generateMeal(value);
  expect(result.ok).toBe(true); if (!result.ok) return;
  expect(result.value.draft.dishes).toHaveLength(2);
  expect(result.value.missing).toEqual([]);
  expect(value.catalog.recipes.every(r => r.generationEligible && r.familyIdentity === 'canonical' && r.mealEligibility === 'canonical'
    && r.baseServings === null && r.ingredients[0]!.quantity === null && r.ingredients[0]!.quantityDisplay === '适量'
    && r.canonical?.allergenCodes === null && r.canonical?.nutrition === null)).toBe(true);
  expect(result.value.draft.dishes.every(d => value.catalog.recipes.some(r => r.recipeId === d.recipe.recipeId))).toBe(true);
  value.draft = result.value.draft;
  value.draft.dishes[1]!.locked = true;
  const replaced = replaceSlot(value, 'meat-1');
  expect(replaced.ok).toBe(true); if (!replaced.ok) return;
  expect(replaced.value.conflicts).toEqual([]);
  expect(replaced.value.draft.dishes[0]!.recipe.recipeId).not.toBe(value.draft.dishes[0]!.recipe.recipeId);
  expect(replaced.value.draft.dishes[1]).toEqual(value.draft.dishes[1]);
});
it('excludes a matching canonical ingredient even when every matching recipe is a favorite', async () => {
  const value = await input(); value.hardExclusions = ['ing_green'];
  value.favoriteIds = value.catalog.recipes.map(row => row.recipeId);
  const result = generateMeal(value); expect(result.ok).toBe(true);
  if (result.ok) { expect(result.value.draft.dishes).toEqual([]); expect(result.value.missing).toHaveLength(2); }
});
