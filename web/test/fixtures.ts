import type { CatalogRecipe, MealDraft, PersonalData, UtcIso } from '../src/domain/types.ts';
export const FIXED_NOW = new Date('2026-10-09T00:00:00.000Z');
export const FIXED_ID = '00000000-0000-4000-8000-000000000001';
export function recipe(overrides: Partial<CatalogRecipe> = {}): CatalogRecipe {
  return {
    recipeId: 'eatwhat-db:1', familyId: 'eatwhat-db:1', variantId: null, name: '测试青菜', types: ['vegetable'], meals: ['lunch', 'dinner'],
    ingredients: [{ ingredientId: null, form: '', part: null, raw: '青菜 100g', quantity: null, trust: 'reviewed', compoundResolved: false }],
    steps: ['青菜洗净，煮熟。'], source: { url: null, commit: null, license: null },
    catalogVersion: null, contentVersion: 'fixture-only', baseServings: null, reviewStatus: 'VERIFIED', generationEligible: true,
    reviewedAt: null, issues: [], stepStatus: 'VERIFIED', servingsStatus: 'UNKNOWN', familyIdentity: 'database-id-fallback', mealEligibility: 'local-convention', ...overrides,
  };
}
export function draft(overrides: Partial<MealDraft> = {}): MealDraft {
  return { id: 'current', servings: 2, meal: 'dinner', slots: [{ id: 'meat-1', type: 'meat' }, { id: 'vegetable-1', type: 'vegetable' }], dishes: [], countsConfirmed: true, updatedAt: '2026-10-09T00:00:00.000Z' as UtcIso, revision: 0, ...overrides };
}
export function personalData(): PersonalData {
  return {
    meta: { schemaVersion: 1, appVersion: '0.1.0', revision: 0, lastSuccessfulWriteAt: null, lastBackupRequestedAt: null },
    preferences: { servings: 2, meal: 'dinner', slots: draft().slots, hardExclusions: [], softPreferences: [], revision: 0 },
    draft: null, customRecipes: [], favorites: [], menuTemplates: [], plans: [], actualMeals: [], shoppingLists: [], trash: [],
  };
}
