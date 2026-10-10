import type { RecipeSnapshot } from './types.ts';
/** Strip online review/eligibility flags. Personal snapshots never grant catalog trust. */
export function snapshotRecipe(recipe: RecipeSnapshot): RecipeSnapshot {
  return structuredClone({
    recipeId: recipe.recipeId, familyId: recipe.familyId, variantId: recipe.variantId, name: recipe.name,
    types: recipe.types, ingredients: recipe.ingredients, steps: recipe.steps, source: recipe.source,
    catalogVersion: recipe.catalogVersion, baseServings: recipe.baseServings,
    ...(recipe.contentVersion !== undefined ? { contentVersion: recipe.contentVersion } : {}),
  });
}
