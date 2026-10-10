import type { CatalogRecipe, DishType, GenerateInput, GenerationResult, Meal, RecipeSnapshot, Result, Slot } from '../domain/types.ts';
import { isLocalDate, isRecentLocalDate } from '../domain/dates.ts';
import { exactKeys, isInteger, isMealDraft, isObject, isRecipeSnapshot, isText, MEAL_VALUES, validateJsonBoundary } from '../domain/validation.ts';
import { snapshotRecipe } from '../domain/snapshots.ts';

const failure = <T>(code: 'INVALID' | 'BLOCKED', message: string): Result<T> => ({ ok: false, error: { code, message } });
const labels: Record<DishType, string> = { meat: '荤菜', vegetable: '素菜', staple: '主食', soup: '汤羹', breakfastSnack: '早餐/加餐' };
/** Only display defaults; >8 needs an explicitly chosen combination. */
export function defaultSlots(servings: number, meal: Meal, vegetarian: boolean): Result<{ slots: Slot[]; requiresConfirmation: boolean }> {
  if (!isInteger(servings, 1, 50) || !MEAL_VALUES.includes(meal) || typeof vegetarian !== 'boolean') return failure('INVALID', '人数需为 1–50，餐次需有效。');
  if (servings > 8) return { ok: true, value: { slots: [], requiresConfirmation: true } };
  const types: DishType[] = meal === 'breakfast' ? ['staple', 'breakfastSnack'] : meal === 'snack' ? ['breakfastSnack']
    : [...Array<DishType>(servings <= 2 ? 1 : servings <= 6 ? 2 : 3).fill(vegetarian ? 'vegetable' : 'meat'), ...Array<DishType>(servings <= 4 ? 1 : 2).fill('vegetable')];
  const counts: Partial<Record<DishType, number>> = {};
  return { ok: true, value: { slots: types.map((type) => ({ id: `${type}-${counts[type] = (counts[type] ?? 0) + 1}`, type })), requiresConfirmation: false } };
}
export function normalizedRecipeName(name: string): string { return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US'); }
function duplicate(a: RecipeSnapshot, b: RecipeSnapshot): boolean { return a.familyId === b.familyId || normalizedRecipeName(a.name) === normalizedRecipeName(b.name); }
function unknownIngredients(recipe: RecipeSnapshot): string[] {
  if (recipe.ingredients.length === 0) return ['原料表缺失'];
  return recipe.ingredients.filter((i) => i.ingredientId === null || i.trust !== 'reviewed' || !i.compoundResolved).map((i) => i.raw);
}
function hardReasons(recipe: RecipeSnapshot, hardExclusions: string[]): string[] {
  if (hardExclusions.length === 0) return [];
  const matching = recipe.ingredients.filter((i) => i.ingredientId !== null && hardExclusions.includes(i.ingredientId)).map((i) => i.raw);
  const unknown = unknownIngredients(recipe);
  return [...(matching.length ? [`匹配忌口原料：${matching.join('、')}`] : []), ...(unknown.length ? [`原料身份或复合成分未知：${unknown.join('、')}`] : [])];
}
/** Warnings explain manual choices without declaring food allergy safety. */
export function manualWarnings(recipe: RecipeSnapshot, hardExclusions: string[], unresolvedExclusions: string[]): string[] {
  const reasons = hardReasons(recipe, hardExclusions);
  if (!hardExclusions.length && unknownIngredients(recipe).length) reasons.push(`原料身份或复合成分未知：${unknownIngredients(recipe).join('、')}`);
  if (unresolvedExclusions.length) reasons.push(`忌口尚未识别，未生效：${unresolvedExclusions.join('、')}`);
  return reasons;
}
export function selectionWeight(recipe: RecipeSnapshot, input: Pick<GenerateInput, 'favoriteIds' | 'actualMeals' | 'today'>): number {
  const recent = input.actualMeals.some((actual) => isRecentLocalDate(actual.date, input.today) && actual.snapshots.some((snapshot) => duplicate(snapshot, recipe)));
  return (input.favoriteIds.includes(recipe.recipeId) ? 2 : 1) * (recent ? 0.5 : 1);
}
function validCatalogRecipe(value: unknown): value is CatalogRecipe {
  return isRecipeSnapshot(value, ['meals', 'reviewStatus', 'generationEligible', 'reviewedAt', 'issues', 'stepStatus', 'servingsStatus', 'familyIdentity', 'mealEligibility'])
    && isObject(value) && Array.isArray(value.meals) && value.meals.every((meal) => MEAL_VALUES.includes(meal))
    && ['VERIFIED', 'UNREVIEWED', 'UNKNOWN', 'BROWSE_ONLY', 'REJECTED'].includes(value.reviewStatus as string)
    && typeof value.generationEligible === 'boolean' && (value.reviewedAt === null || isLocalDate(value.reviewedAt))
    && Array.isArray(value.issues) && value.issues.every((issue) => isText(issue))
    && ['VERIFIED', 'UNKNOWN'].includes(value.stepStatus as string) && ['VERIFIED', 'UNKNOWN'].includes(value.servingsStatus as string)
    && value.familyIdentity === 'database-id-fallback' && value.mealEligibility === 'local-convention';
}
function validateInput(input: GenerateInput): Result<GenerateInput> {
  const boundary = validateJsonBoundary(input); if (!boundary.ok) return boundary as Result<GenerateInput>;
  if (!exactKeys(input, ['catalog', 'draft', 'hardExclusions', 'unresolvedExclusions', 'favoriteIds', 'actualMeals', 'today', 'seed']) || !isMealDraft(input.draft) || !isLocalDate(input.today) || !isInteger(input.seed, -Number.MAX_SAFE_INTEGER)
    || input.catalog?.origin !== 'online-provider' || !Array.isArray(input.catalog.recipes) || !input.catalog.recipes.every(validCatalogRecipe) || new Set(input.catalog.recipes.map((r) => r.recipeId)).size !== input.catalog.recipes.length
    || ![input.hardExclusions, input.unresolvedExclusions, input.favoriteIds].every((items) => Array.isArray(items) && items.every((item) => isText(item)))
    || !Array.isArray(input.actualMeals) || !input.actualMeals.every((actual) => isObject(actual) && isLocalDate(actual.date) && Array.isArray(actual.snapshots) && actual.snapshots.every((snapshot) => isRecipeSnapshot(snapshot)))) return failure('INVALID', '配餐输入无效。人数 1–50，菜数 1–20。');
  if (input.draft.servings > 8 && !input.draft.countsConfirmed) return failure('BLOCKED', '超过 8 人，请先确认菜数和类型组合。');
  if (input.unresolvedExclusions.length) return failure('BLOCKED', `忌口尚未识别，未生效：${input.unresolvedExclusions.join('、')}。请补全、移除或手选。`);
  return { ok: true, value: input };
}
function eligible(recipe: CatalogRecipe, input: GenerateInput, slot: Slot): boolean {
  return recipe.generationEligible === true && recipe.reviewStatus === 'VERIFIED' && recipe.stepStatus === 'VERIFIED'
    && recipe.steps.length > 0 && recipe.ingredients.length > 0 && recipe.ingredients.every((ingredient) => ingredient.trust === 'reviewed') && recipe.meals.includes(input.draft.meal) && recipe.types.includes(slot.type);
}
/** Snapshot facts are JSON values; object key order is not recipe content. */
function canonicalFacts(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalFacts).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en-US')).map(([key, child]) => `${JSON.stringify(key)}:${canonicalFacts(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function lockConflicts(input: GenerateInput): GenerationResult['conflicts'] {
  const conflicts: GenerationResult['conflicts'] = [];
  const kept: RecipeSnapshot[] = [];
  for (const dish of input.draft.dishes.filter((d) => d.locked)) {
    const current = input.catalog.recipes.find((r) => r.recipeId === dish.recipe.recipeId);
    const slot = input.draft.slots.find((s) => s.id === dish.slotId)!;
    const retained = dish.recipe;
    const reasons: string[] = [];
    if (!current) reasons.push('菜谱已不在当前在线目录');
    else {
      if (!eligible(current, input, slot)) reasons.push('当前审核、餐次或类型不适用');
      if (!isText(current.contentVersion) || !isText(retained.contentVersion)
        || canonicalFacts(snapshotRecipe(current)) !== canonicalFacts(snapshotRecipe(retained))) {
        reasons.push('锁定快照版本或内容与当前审核记录不一致，无法确认适用性');
      }
      reasons.push(...hardReasons(current, input.hardExclusions));
    }
    if (!retained.types.includes(slot.type)) reasons.push('锁定快照类型不匹配当前槽位');
    if (!retained.steps.length || !retained.ingredients.length || retained.ingredients.some((ingredient) => ingredient.trust !== 'reviewed')) {
      reasons.push('锁定快照缺少完整审核原料或步骤');
    }
    reasons.push(...hardReasons(retained, input.hardExclusions));
    if (kept.some((r) => duplicate(r, dish.recipe))) reasons.push('与其他锁定菜重复');
    if (reasons.length) conflicts.push({ slotId: slot.id, reason: `${reasons.join('；')}。请先解除锁定或移除。` });
    kept.push(dish.recipe);
  }
  return conflicts;
}
function random(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value += 0x6D2B79F5; let mixed = value; mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1); mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61); return ((mixed ^ mixed >>> 14) >>> 0) / 4_294_967_296; };
}
function candidatesFor(input: GenerateInput, slot: Slot, excluded: RecipeSnapshot[]): { candidates: CatalogRecipe[]; reason: string } {
  const reviewed = input.catalog.recipes.filter((r) => eligible(r, input, slot));
  // A stable representative prevents source variants from multiplying a family's weight.
  const distinct: CatalogRecipe[] = [];
  for (const row of [...reviewed].sort((a, b) => a.recipeId.localeCompare(b.recipeId, 'en-US'))) if (!distinct.some((r) => duplicate(r, row))) distinct.push(row);
  if (distinct.length < 3) return { candidates: [], reason: `当前餐次的${labels[slot.type]}不足 3 个不同菜品组，自动选择不可用。` };
  const candidates: CatalogRecipe[] = [];
  const filtered = reviewed.filter((r) => hardReasons(r, input.hardExclusions).length === 0 && !excluded.some((other) => duplicate(other, r)));
  for (const row of filtered.sort((a, b) => a.recipeId.localeCompare(b.recipeId, 'en-US'))) if (!candidates.some((other) => duplicate(other, row))) candidates.push(row);
  return { candidates, reason: input.hardExclusions.length ? `符合忌口且原料完整的${labels[slot.type]}不足；未放宽忌口。` : `符合当前组合且不重复的${labels[slot.type]}不足。` };
}
function choose(rows: CatalogRecipe[], input: GenerateInput, nextRandom: () => number): CatalogRecipe | undefined {
  if (!rows.length) return undefined;
  let threshold = nextRandom() * rows.reduce((sum, row) => sum + selectionWeight(row, input), 0);
  for (const row of rows) { threshold -= selectionWeight(row, input); if (threshold < 0) return row; }
  return rows.at(-1);
}
export function generateMeal(input: GenerateInput): Result<GenerationResult> {
  const validated = validateInput(input); if (!validated.ok) return validated;
  const conflicts = lockConflicts(input); if (conflicts.length) return { ok: true, value: { draft: structuredClone(input.draft), missing: [], conflicts } };
  const dishes = input.draft.dishes.filter((dish) => dish.locked).map((dish) => structuredClone(dish));
  const missing: GenerationResult['missing'] = []; const nextRandom = random(input.seed);
  for (const slot of input.draft.slots) {
    if (dishes.some((dish) => dish.slotId === slot.id)) continue;
    const pool = candidatesFor(input, slot, dishes.map((dish) => dish.recipe));
    const selected = choose(pool.candidates, input, nextRandom);
    if (selected) dishes.push({ slotId: slot.id, recipe: snapshotRecipe(selected), locked: false }); else missing.push({ slotId: slot.id, reason: pool.reason });
  }
  dishes.sort((a, b) => input.draft.slots.findIndex((s) => s.id === a.slotId) - input.draft.slots.findIndex((s) => s.id === b.slotId));
  return { ok: true, value: { draft: { ...structuredClone(input.draft), dishes }, missing, conflicts: [] } };
}
export function replaceSlot(input: GenerateInput, slotId: string): Result<GenerationResult> {
  const validated = validateInput(input); if (!validated.ok) return validated;
  const slot = input.draft.slots.find((slot) => slot.id === slotId); if (!slot) return failure('INVALID', '换菜槽位不存在。');
  const conflicts = lockConflicts(input);
  if (input.draft.dishes.some((dish) => dish.slotId === slotId && dish.locked) && !conflicts.some((c) => c.slotId === slotId)) conflicts.push({ slotId, reason: '请先解除该菜的锁定，再换一道。' });
  if (conflicts.length) return { ok: true, value: { draft: structuredClone(input.draft), missing: [], conflicts } };
  const pool = candidatesFor(input, slot, input.draft.dishes.map((dish) => dish.recipe));
  const selected = choose(pool.candidates, input, random(input.seed));
  if (!selected) return { ok: true, value: { draft: structuredClone(input.draft), missing: [{ slotId, reason: `${pool.reason} 无替代菜，保留原菜。` }], conflicts: [] } };
  const dishes = input.draft.dishes.map((dish) => dish.slotId === slotId ? { slotId, recipe: snapshotRecipe(selected), locked: false } : structuredClone(dish));
  if (!dishes.some((dish) => dish.slotId === slotId)) dishes.push({ slotId, recipe: snapshotRecipe(selected), locked: false });
  return { ok: true, value: { draft: { ...structuredClone(input.draft), dishes }, missing: [], conflicts: [] } };
}
