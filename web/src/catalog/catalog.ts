import { completeNutrition } from './canonical.ts';
import { canonicalRecipe, canonicalIngredients, stripStepNumber } from './canonical.ts';
import type { Catalog, CatalogLoadOptions, CatalogRecipe, DishType, Ingredient, Meal, PublicCatalogProvider, PublicCatalogTransport, PublicDish, PublicDishPage, PublicDishQuality, PublicDishQuery, PublicIngredient, PublicReviewStatus, QualityStatus, Result } from '../domain/types.ts';
import { rememberRecipeImage, safeRecipeImage } from './media.ts';
import { exactKeys, isObject, isText, LIMITS, validateJsonBoundary } from '../domain/validation.ts';

const meals: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const types: readonly DishType[] = ['meat', 'vegetable', 'staple', 'soup', 'breakfastSnack'];
const reviewStatuses: readonly PublicReviewStatus[] = ['VERIFIED', 'UNREVIEWED', 'UNKNOWN', 'BROWSE_ONLY', 'REJECTED'];
const databaseTypes = ['meat', 'veg', 'soup', 'staple', 'dessert'] as const;
const MAX_DIRECTORY_ROWS = 10000;
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
function parseDish(value: unknown): PublicDish {
  requireThat(isObject(value) && typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0 && isText(value.catalogRevision) && isText(value.contentVersion));
  const recipe=canonicalRecipe(value.recipe);requireThat(recipe.id===value.id);
  return {id:value.id,name:recipe.name,type:nullableText(value.type),recipe,catalogRevision:value.catalogRevision,contentVersion:value.contentVersion,
    ...(safeRecipeImage(recipe.imageUrl)?{image:safeRecipeImage(recipe.imageUrl)!}:{}),cl:null,fl:null,step:null,steps:null,tips:null,ingredientsAmounts:null,quality:null};
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
  return { async list(query, options) {
    if (!validQuery(query)) return { ok: false, error: { code: 'INVALID', message: 'Invalid public directory query', retryable: false } };
    let response: unknown;
    try { response = await transport(Object.freeze({ ...query }), options); }
    catch { return { ok: false, error: { code: 'UNAVAILABLE', message: 'Online recipe data is unavailable. Retry.', retryable: true } }; }
    try { return { ok: true, value: parsePage(response, query) }; }
    catch { return { ok: false, error: { code: 'CATALOG', message: 'Online recipe response could not be validated. Retry.', retryable: true } }; }
  } };
}
export function normalizePublicDish(input: PublicDish): Result<CatalogRecipe> {
  try {
    requireThat(validateJsonBoundary(input).ok);const dish=parseDish(input), r=canonicalRecipe(dish.recipe);
    const type = r.categoryCode.startsWith('CAT_MEAT')?'meat':r.categoryCode.startsWith('CAT_VEGETABLE')?'vegetable':r.categoryCode.startsWith('CAT_SOUP')?'soup':r.categoryCode.startsWith('CAT_STAPLE')?'staple':r.categoryCode.startsWith('CAT_DESSERT')?'breakfastSnack':null;
    const mealMap:Record<string,Meal>={MEAL_BREAKFAST:'breakfast',MEAL_LUNCH:'lunch',MEAL_DINNER:'dinner',MEAL_SNACK:'snack'};
    requireThat(r.mealCodes.every(code=>Object.hasOwn(mealMap,code)));
    const recipe:CatalogRecipe={recipeId:`eatwhat-db:${r.id}`,familyId:r.dishGroupId,variantId:null,name:r.name,
      types:type?[type]:[],meals:r.mealCodes.map(code=>mealMap[code]!),ingredients:canonicalIngredients(r),steps:r.steps.map(s=>stripStepNumber(s.text)),
      source:{url:null,commit:null,license:null},catalogVersion:dish.catalogRevision!,contentVersion:dish.contentVersion,baseServings:r.baseServings,
      generationEligible:!!type&&r.servingRole!=='condiment',issues:[],familyIdentity:'canonical',mealEligibility:'canonical',
      canonical:{recipeId:r.id,revision:dish.catalogRevision!,dietaryCodes:r.dietaryCodes===null?null:[...r.dietaryCodes],allergenCodes:r.allergenCodes===null?null:[...r.allergenCodes],servingRole:r.servingRole,totalMinutes:r.timing.totalMinutes,nutrition:r.calculatedNutrition?.completeness==='complete'&&completeNutrition(r.calculatedNutrition.total)?r.calculatedNutrition.total:null,optionalIngredients:r.ingredients.filter(i=>i.optional).map(i=>({lineId:i.id,name:i.ingredient.name,defaultEnabled:i.defaultEnabled}))}};
    rememberRecipeImage(recipe,dish.image);return {ok:true,value:recipe};
  }catch{return {ok:false,error:{code:'CATALOG',message:'Invalid canonical recipe fields',retryable:true}};}
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
export async function loadCatalog(provider?: PublicCatalogProvider, options: CatalogLoadOptions = {}): Promise<Result<Catalog>> {
  if (!provider) return { ok: false, error: { code: 'UNAVAILABLE', message: 'Online recipe provider is not configured. Retry after setup.', retryable: true } };
  const deadline = Date.now() + Math.min(20000, Math.max(1, options.deadlineMs ?? 20000));
  try {
    const recipes:CatalogRecipe[] = []; const ids=new Set<number>(), aliases:Record<string,string>={}, ambiguous=new Set<string>(); let revision:string|null=null; let total: number | null = null;
    for (let page = 1; ; page++) {
      const query = { page, pageSize: 100 };
      const remaining = deadline - Date.now();
      if (remaining <= 0 || options.signal?.aborted) throw new Error('Catalog load cancelled');
      const controller = new AbortController();
      const cancel = () => controller.abort();
      options.signal?.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(cancel, Math.min(15000, remaining));
      let result: Result<PublicDishPage>;
      let rejectAbort: (() => void) | undefined;
      try {
        const cancelled = new Promise<never>((_, reject) => {
          rejectAbort = () => reject(new Error('Catalog load cancelled'));
          controller.signal.addEventListener('abort', rejectAbort, { once: true });
        });
        result = await Promise.race([provider.list(query, { signal: controller.signal }), cancelled]);
        if (controller.signal.aborted || options.signal?.aborted || Date.now() >= deadline) throw new Error('Catalog load cancelled');
      } finally {
        clearTimeout(timeout); options.signal?.removeEventListener('abort', cancel);
        if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
      }
      if (!result.ok) return { ok: false, error: { code: result.error.code === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'CATALOG', message: 'Online recipe data could not be loaded. Retry.', retryable: true } };
      const response = parsePage(result.value, query);
      if (total !== null) requireThat(total === response.total);
      const pageRevision:string|null=response.list[0]?.catalogRevision||revision;
      if(revision)requireThat(revision===pageRevision);
      requireThat(response.list.every(row=>row.catalogRevision===pageRevision));revision=pageRevision||null;
      total=response.total;
      for(const row of response.list){
        requireThat(!ids.has(row.id));ids.add(row.id);
        const result=normalizePublicDish(row);if(!result.ok)return result;recipes.push(result.value);
        for(const line of row.recipe!.ingredients)for(const name of [line.ingredient.name,...(line.ingredient.aliases||[])]){
          if(Object.hasOwn(aliases,name)&&aliases[name]!==line.ingredientId)ambiguous.add(name);
          else aliases[name]=line.ingredientId;
        }
      }
      options.onProgress?.({loaded:recipes.length,total});
      if(recipes.length===total)break;
    }
    for(const name of ambiguous)delete aliases[name];
    recipes.sort((a,b)=>a.canonical!.recipeId-b.canonical!.recipeId);
    const catalog:Catalog={origin:'online-provider',version:revision,recipes,aliases,recipeAliases:{},availability:availabilityFor(recipes)};
    freeze(catalog); trusted.add(catalog); return { ok: true, value: catalog };
  } catch { return { ok: false, error: { code: 'CATALOG', message: 'Online directory changed or could not be loaded. Retry.', retryable: true } }; }
}
export function canGenerate(catalog: Catalog, meal: Meal, type: DishType): boolean {
  return trusted.has(catalog) && catalog.availability[meal]?.[type]?.enabled === true;
}
