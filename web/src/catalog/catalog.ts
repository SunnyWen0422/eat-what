import type { Catalog, CatalogRecipe, DishType, Ingredient, Meal, PublicCatalogProvider, PublicCatalogTransport, PublicDish, PublicDishPage, PublicDishQuality, PublicDishQuery, PublicIngredient, PublicReviewStatus, QualityStatus, Result } from '../domain/types.ts';
import { exactKeys, isObject, isText, LIMITS, validateJsonBoundary } from '../domain/validation.ts';

const meals: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const types: readonly DishType[] = ['meat', 'vegetable', 'staple', 'soup', 'breakfastSnack'];
const reviewStatuses: readonly PublicReviewStatus[] = ['VERIFIED', 'UNREVIEWED', 'UNKNOWN', 'BROWSE_ONLY', 'REJECTED'];
const databaseTypes = ['meat', 'veg', 'soup', 'staple', 'dessert'] as const;
const MAX_DIRECTORY_ROWS = 500;
const trusted = new WeakSet<Catalog>();
/** This is a UI convention, not source evidence of per-recipe meal or vegetarian suitability. */
const mapping: Record<string, { type: DishType; meals: Meal[] }> = {
  meat: { type: 'meat', meals: ['lunch', 'dinner'] }, veg: { type: 'vegetable', meals: ['lunch', 'dinner'] },
  soup: { type: 'soup', meals: ['lunch', 'dinner'] }, staple: { type: 'staple', meals: ['breakfast', 'lunch', 'dinner'] },
  dessert: { type: 'breakfastSnack', meals: ['breakfast', 'snack'] },
};
function requireThat(condition: unknown): asserts condition { if (!condition) throw new Error('Invalid public recipe response'); }
function nullableText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  requireThat(isText(value, false)); return value;
}
function nullableNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  requireThat(typeof value === 'number' && Number.isFinite(value)); return value;
}
function status(value: unknown): QualityStatus {
  requireThat(value === undefined || value === null || typeof value === 'string');
  return value === 'VERIFIED' ? 'VERIFIED' : 'UNKNOWN';
}
function parseIngredient(value: unknown): PublicIngredient {
  requireThat(isObject(value));
  return {
    name: nullableText(value.name), unit: nullableText(value.unit), rawText: nullableText(value.rawText), rawQuantity: nullableText(value.rawQuantity), rawUnit: nullableText(value.rawUnit), displayQuantity: nullableText(value.displayQuantity),
    quantityValue: nullableNumber(value.quantityValue), preparation: nullableText(value.preparation), role: nullableText(value.role), identityStatus: status(value.identityStatus), quantityStatus: status(value.quantityStatus),
  };
}
function parseQuality(value: unknown): PublicDishQuality | null {
  if (value === undefined || value === null) return null;
  requireThat(isObject(value));
  requireThat(value.reviewStatus === undefined || value.reviewStatus === null || typeof value.reviewStatus === 'string');
  requireThat(value.ingredients === undefined || value.ingredients === null || Array.isArray(value.ingredients));
  requireThat(value.issueCodes === undefined || value.issueCodes === null || (Array.isArray(value.issueCodes) && value.issueCodes.every((code) => isText(code))));
  return {
    reviewStatus: reviewStatuses.includes(value.reviewStatus as PublicReviewStatus) ? value.reviewStatus as PublicReviewStatus : 'UNKNOWN',
    basePeople: nullableNumber(value.basePeople), servingsStatus: status(value.servingsStatus), stepStatus: status(value.stepStatus), timeStatus: status(value.timeStatus),
    issueCodes: Array.isArray(value.issueCodes) ? [...value.issueCodes] : [], ingredients: Array.isArray(value.ingredients) ? value.ingredients.map(parseIngredient) : [],
  };
}
function parseDish(value: unknown): PublicDish {
  requireThat(isObject(value) && typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0 && isText(value.name));
  return {
    id: value.id, name: value.name, type: nullableText(value.type), cl: nullableText(value.cl), fl: nullableText(value.fl), step: nullableText(value.step), steps: nullableText(value.steps),
    tips: nullableText(value.tips), ingredientsAmounts: nullableText(value.ingredientsAmounts), contentVersion: nullableText(value.contentVersion), quality: parseQuality(value.quality),
  };
}
function validQuery(query: unknown): query is PublicDishQuery {
  if (!isObject(query)) return false;
  const keys = Object.hasOwn(query, 'type') ? ['page', 'pageSize', 'type'] : ['page', 'pageSize'];
  return exactKeys(query, keys) && typeof query.page === 'number' && Number.isSafeInteger(query.page) && query.page >= 1 && query.page <= MAX_DIRECTORY_ROWS
    && typeof query.pageSize === 'number' && Number.isSafeInteger(query.pageSize) && query.pageSize >= 1 && query.pageSize <= 100
    && (!Object.hasOwn(query, 'type') || databaseTypes.includes(query.type as typeof databaseTypes[number]));
}
function parsePage(value: unknown, query: PublicDishQuery): PublicDishPage {
  requireThat(validateJsonBoundary(value).ok && isObject(value) && Array.isArray(value.list));
  requireThat(typeof value.total === 'number' && Number.isSafeInteger(value.total) && value.total >= 0 && value.total <= MAX_DIRECTORY_ROWS);
  requireThat(value.page === query.page && value.pageSize === query.pageSize);
  const expectedRows = Math.max(0, Math.min(query.pageSize, value.total - (query.page - 1) * query.pageSize));
  requireThat(value.list.length === expectedRows);
  const list = value.list.map(parseDish);
  requireThat(new Set(list.map((dish) => dish.id)).size === list.length);
  return { list, total: value.total, page: query.page, pageSize: query.pageSize };
}
/** No concrete URL, fetch, credentials, auth bypass or default transport is provided here. */
export function createPublicCatalogProvider(transport: PublicCatalogTransport): PublicCatalogProvider {
  return { async list(query) {
    if (!validQuery(query)) return { ok: false, error: { code: 'INVALID', message: 'Invalid public directory query', retryable: false } };
    let response: unknown;
    try { response = await transport(Object.freeze({ ...query })); }
    catch { return { ok: false, error: { code: 'UNAVAILABLE', message: 'Online recipe data is unavailable. Retry.', retryable: true } }; }
    try { return { ok: true, value: parsePage(response, query) }; }
    catch { return { ok: false, error: { code: 'CATALOG', message: 'Online recipe response could not be validated. Retry.', retryable: true } }; }
  } };
}
const nonempty = (text: string | null): text is string => text !== null && text.trim().length > 0;
function normalizedIngredient(item: PublicIngredient, overallVerified: boolean): Ingredient {
  const identityVerified = item.identityStatus === 'VERIFIED' && nonempty(item.name);
  const quantityVerified = overallVerified && identityVerified && item.quantityStatus === 'VERIFIED' && item.quantityValue !== null && item.quantityValue > 0 && item.quantityValue <= LIMITS.quantity && nonempty(item.unit);
  const fallbackText = [item.name, item.rawQuantity, item.rawUnit].filter(nonempty).join(' ');
  return {
    ingredientId: null, form: item.preparation ?? '', part: null, raw: nonempty(item.rawText) ? item.rawText : fallbackText,
    quantity: quantityVerified ? { kind: 'exact', value: item.quantityValue!, unit: item.unit! } : null,
    trust: identityVerified ? 'reviewed' : 'unknown', compoundResolved: false,
  };
}
export function normalizePublicDish(input: PublicDish): Result<CatalogRecipe> {
  try {
    requireThat(validateJsonBoundary(input).ok); const dish = parseDish(input);
    const classification = Object.hasOwn(mapping, dish.type ?? '') ? mapping[dish.type!] : undefined;
    const quality = dish.quality; const overallVerified = quality?.reviewStatus === 'VERIFIED' && nonempty(dish.contentVersion);
    const rawIngredients = [dish.ingredientsAmounts, dish.cl].filter(nonempty);
    const ingredients: Ingredient[] = quality?.ingredients.length ? quality.ingredients.map((i) => normalizedIngredient(i, overallVerified)).filter((i) => i.raw.trim().length > 0)
      : [...new Set(rawIngredients)].map((raw) => ({ ingredientId: null, form: '', part: null, raw, quantity: null, trust: 'unknown', compoundResolved: false }));
    const primarySteps = nonempty(dish.steps) ? dish.steps : dish.step;
    const steps = [primarySteps, dish.tips].filter(nonempty);
    const identitiesVerified = !!quality?.ingredients.length && quality.ingredients.every((i) => i.identityStatus === 'VERIFIED' && nonempty(i.name));
    const generationEligible = !!classification && overallVerified && quality?.stepStatus === 'VERIFIED' && nonempty(primarySteps) && ingredients.length > 0 && identitiesVerified;
    const baseServings = overallVerified && quality?.servingsStatus === 'VERIFIED' && quality.basePeople !== null && Number.isSafeInteger(quality.basePeople) && quality.basePeople >= 1 && quality.basePeople <= 50 ? quality.basePeople : null;
    const issues = [...(quality?.issueCodes ?? []), 'FAMILY_DATABASE_ID_FALLBACK', 'MEALS_LOCAL_CONVENTION', 'STANDARD_INGREDIENT_IDS_UNKNOWN', 'COMPOUND_COMPOSITION_UNKNOWN'];
    if (!classification) issues.push('UNMAPPED_TYPE');
    if (!generationEligible) issues.push('AUTOMATIC_SELECTION_UNAVAILABLE');
    if (baseServings === null) issues.push('BASE_SERVINGS_UNKNOWN');
    if (nonempty(dish.fl)) issues.push(`原文份量：${dish.fl}`);
    return { ok: true, value: {
      recipeId: `eatwhat-db:${dish.id}`, familyId: `eatwhat-db:${dish.id}`, variantId: null, name: dish.name,
      types: classification ? [classification.type] : [], meals: classification ? [...classification.meals] : [], ingredients, steps,
      source: { url: null, commit: null, license: null }, catalogVersion: null, contentVersion: nonempty(dish.contentVersion) ? dish.contentVersion : null, baseServings,
      reviewStatus: quality?.reviewStatus ?? 'UNKNOWN', generationEligible, reviewedAt: null, issues,
      stepStatus: quality?.stepStatus ?? 'UNKNOWN', servingsStatus: quality?.servingsStatus ?? 'UNKNOWN', familyIdentity: 'database-id-fallback', mealEligibility: 'local-convention',
    } };
  } catch { return { ok: false, error: { code: 'CATALOG', message: 'Invalid public recipe fields', retryable: true } }; }
}
function availabilityFor(recipes: CatalogRecipe[]): Catalog['availability'] {
  return Object.fromEntries(meals.map((meal) => [meal, Object.fromEntries(types.map((type) => {
    const familyCount = new Set(recipes.filter((r) => r.generationEligible && r.meals.includes(meal) && r.types.includes(type)).map((r) => r.familyId)).size;
    return [type, { familyCount, enabled: familyCount >= 3 }];
  }))])) as Catalog['availability'];
}
function freeze(value: unknown): void {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
}
export async function loadCatalog(provider?: PublicCatalogProvider): Promise<Result<Catalog>> {
  if (!provider) return { ok: false, error: { code: 'UNAVAILABLE', message: 'Online recipe provider is not configured. Retry after setup.', retryable: true } };
  try {
    const rows: PublicDish[] = []; let total: number | null = null;
    for (let page = 1; ; page++) {
      const query = { page, pageSize: 100 }; const result = await provider.list(query);
      if (!result.ok) return { ok: false, error: { code: result.error.code === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'CATALOG', message: 'Online recipe data could not be loaded. Retry.', retryable: true } };
      const response = parsePage(result.value, query);
      if (total !== null) requireThat(total === response.total);
      total = response.total; rows.push(...response.list);
      requireThat(new Set(rows.map((row) => row.id)).size === rows.length);
      if (rows.length === total) break;
    }
    const recipes: CatalogRecipe[] = [];
    for (const row of rows.sort((a, b) => a.id - b.id)) { const result = normalizePublicDish(row); if (!result.ok) return result; recipes.push(result.value); }
    const catalog: Catalog = { origin: 'online-provider', version: null, recipes, aliases: {}, recipeAliases: {}, availability: availabilityFor(recipes) };
    freeze(catalog); trusted.add(catalog); return { ok: true, value: catalog };
  } catch { return { ok: false, error: { code: 'CATALOG', message: 'Online directory changed or could not be loaded. Retry.', retryable: true } }; }
}
export function canGenerate(catalog: Catalog, meal: Meal, type: DishType): boolean {
  return trusted.has(catalog) && catalog.availability[meal]?.[type]?.enabled === true;
}
