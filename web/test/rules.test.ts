import { describe, expect, it } from 'vitest';
import { defaultSlots, generateMeal, replaceSlot, selectionWeight, manualWarnings } from '../src/menu/rules.ts';
import { isRecentLocalDate } from '../src/domain/dates.ts';
import { snapshotRecipe } from '../src/domain/snapshots.ts';
import type { ActualMeal, Catalog, CatalogRecipe, GenerateInput, LocalDate } from '../src/domain/types.ts';
import { draft, recipe } from './fixtures.ts';

const today = '2026-10-09' as LocalDate;
function catalogOf(recipes: CatalogRecipe[]): Catalog {
  return { origin: 'online-provider', version: null, recipes, aliases: {}, recipeAliases: {}, availability: {} } as Catalog;
}
function candidates(type: 'meat' | 'vegetable', prefix = type): CatalogRecipe[] {
  return [1, 2, 3, 4].map((number) => recipe({ recipeId: `${prefix}:${number}`, familyId: `${prefix}:${number}`, name: `${prefix}${number}`, types: [type], ingredients: [{ ingredientId: 'reviewed-fixture-ingredient', form: '', part: null, raw: '审核测试原料', quantity: null, trust: 'reviewed', compoundResolved: true }] }));
}
function input(overrides: Partial<GenerateInput> = {}): GenerateInput {
  return { catalog: catalogOf([...candidates('meat'), ...candidates('vegetable')]), draft: draft(), hardExclusions: [], unresolvedExclusions: [], favoriteIds: [], actualMeals: [], today, seed: 123, ...overrides };
}
function actual(date: string, recipes: CatalogRecipe[]): ActualMeal {
  return { id: '00000000-0000-4000-8000-000000000001', date: date as LocalDate, meal: 'dinner', snapshots: recipes.map(snapshotRecipe), planId: null, note: '', createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z', timeZone: 'UTC', revision: 1, requestId: 'history-test' } as ActualMeal;
}
function generated(value: ReturnType<typeof generateMeal>) {
  if (!value.ok) throw new Error(value.error.message);
  return value.value;
}
describe('local meal default slots', () => {
  it.each([{ people: 1, types: ['meat', 'vegetable'] }, { people: 2, types: ['meat', 'vegetable'] }, { people: 3, types: ['meat', 'meat', 'vegetable'] }, { people: 4, types: ['meat', 'meat', 'vegetable'] }, { people: 5, types: ['meat', 'meat', 'vegetable', 'vegetable'] }, { people: 6, types: ['meat', 'meat', 'vegetable', 'vegetable'] }, { people: 7, types: ['meat', 'meat', 'meat', 'vegetable', 'vegetable'] }, { people: 8, types: ['meat', 'meat', 'meat', 'vegetable', 'vegetable'] }])('suggests the specified dinner slots for $people people', ({ people, types }) => {
    const result = defaultSlots(people, 'dinner', false); expect(result.ok).toBe(true); if (result.ok) expect(result.value.slots.map((s) => s.type)).toEqual(types);
  });
  it('uses vegetable slots for a vegetarian combination', () => {
    const result = defaultSlots(3, 'lunch', true); expect(result.ok).toBe(true); if (result.ok) expect(result.value.slots.map((s) => s.type)).toEqual(['vegetable', 'vegetable', 'vegetable']);
  });
  it('uses breakfast staple plus auxiliary and a single snack', () => {
    const breakfast = defaultSlots(2, 'breakfast', false); const snack = defaultSlots(2, 'snack', false);
    if (!breakfast.ok || !snack.ok) throw new Error('expected defaults');
    expect(breakfast.value.slots.map((s) => s.type)).toEqual(['staple', 'breakfastSnack']); expect(snack.value.slots.map((s) => s.type)).toEqual(['breakfastSnack']);
  });
  it.each([9, 50])('does not invent a group combination for %s people', (people) => {
    expect(defaultSlots(people, 'dinner', false)).toEqual({ ok: true, value: { slots: [], requiresConfirmation: true } });
  });
  it.each([0, 51, 1.5])('rejects unsupported serving count %s', (people) => expect(defaultSlots(people, 'dinner', false).ok).toBe(false));
});
describe('pure local seeded meal rules', () => {
  it('reproduces its seed without mutation or clock/network work', () => {
    const value = input(); const before = structuredClone(value); const first = generated(generateMeal(value));
    expect(first.draft.dishes).toHaveLength(2); expect(generateMeal(value)).toEqual(generateMeal(value)); expect(value).toEqual(before);
  });
  it.each([0, 21])('rejects unsupported slot count %s', (count) => {
    expect(generateMeal(input({ draft: draft({ slots: Array.from({ length: count }, (_, i) => ({ id: `${i}`, type: 'vegetable' })) }) })).ok).toBe(false);
  });
  it('requires explicit group count confirmation', () => expect(generateMeal(input({ draft: draft({ servings: 9, countsConfirmed: false }) }))).toMatchObject({ ok: false, error: { code: 'BLOCKED' } }));
  it('deduplicates family and normalized same-name records across multiple tags', () => {
    const rows = candidates('vegetable'); rows[0]!.types = ['meat', 'vegetable']; rows[1]!.familyId = rows[0]!.familyId; rows[2]!.name = `  ${rows[0]!.name.toUpperCase()}  `;
    const result = generated(generateMeal(input({ catalog: catalogOf([...rows, ...candidates('meat')]) })));
    expect(new Set(result.draft.dishes.map((d) => d.recipe.familyId)).size).toBe(result.draft.dishes.length);
    expect(new Set(result.draft.dishes.map((d) => d.recipe.name.trim().toLowerCase())).size).toBe(result.draft.dishes.length);
  });
  it('admits a reviewed tofu variant only through an explicit audited compatible type', () => {
    const tofu = recipe({ recipeId: 'fixture:tofu', familyId: 'fixture:tofu', name: '审核豆制品测试菜', types: ['meat', 'vegetable'], ingredients: candidates('vegetable')[0]!.ingredients });
    const result = generated(generateMeal(input({ draft: draft({ servings: 1, dishes: [{ slotId: 'meat-1', recipe: snapshotRecipe(tofu), locked: true }] }), catalog: catalogOf([tofu, ...candidates('vegetable')]) })));
    expect(result.conflicts).toEqual([]); expect(result.draft.dishes[0]?.recipe.recipeId).toBe('fixture:tofu');
  });
  it('does not infer tofu eligibility from its name', () => {
    const tofu = recipe({ name: '豆腐', types: ['vegetable'] });
    const result = generated(generateMeal(input({ draft: draft({ dishes: [{ slotId: 'meat-1', recipe: snapshotRecipe(tofu), locked: true }] }), catalog: catalogOf([tofu, ...candidates('meat')]) })));
    expect(result.conflicts[0]?.reason).toMatch(/类型/); expect(result.draft.dishes).toEqual([{ slotId: 'meat-1', recipe: snapshotRecipe(tofu), locked: true }]);
  });
  it('hard-filters matching IDs, unknown identity, and unresolved compounds even for favorites', () => {
    const rows = candidates('vegetable'); rows[0]!.ingredients[0]!.ingredientId = 'excluded-test-id'; rows[1]!.ingredients[0]!.ingredientId = null; rows[2]!.ingredients[0]!.compoundResolved = false;
    const result = generated(generateMeal(input({ catalog: catalogOf(rows), hardExclusions: ['excluded-test-id'], favoriteIds: rows.map((r) => r.recipeId), draft: draft({ slots: [{ id: 'v1', type: 'vegetable' }, { id: 'v2', type: 'vegetable' }] }) })));
    expect(result.draft.dishes.map((d) => d.recipe.recipeId)).toEqual([rows[3]!.recipeId]); expect(result.missing).toHaveLength(1); expect(result.missing[0]?.reason).toMatch(/忌口|原料/);
  });
  it('blocks unresolved exclusions instead of claiming them effective', () => expect(generateMeal(input({ unresolvedExclusions: ['未识别芝麻'] }))).toMatchObject({ ok: false, error: { code: 'BLOCKED', message: expect.stringContaining('未识别芝麻') } }));
  it('does not fill pools with fewer than three distinct eligible families', () => {
    const result = generated(generateMeal(input({ catalog: catalogOf(candidates('vegetable').slice(0, 2)) })));
    expect(result.draft.dishes).toEqual([]); expect(result.missing).toHaveLength(2); expect(result.missing[1]?.reason).toMatch(/3/);
  });
  it('preserves legal locked dishes and blocks the entire run before changing a conflicting lock', () => {
    const rows = candidates('vegetable'); const locked = { slotId: 'vegetable-1', recipe: snapshotRecipe(rows[0]!), locked: true };
    const legal = generated(generateMeal(input({ draft: draft({ dishes: [locked] }) }))); expect(legal.draft.dishes).toContainEqual(locked);
    const conflict = generated(generateMeal(input({ catalog: catalogOf(rows), draft: draft({ dishes: [locked] }), hardExclusions: ['reviewed-fixture-ingredient'] })));
    expect(conflict.conflicts[0]?.slotId).toBe('vegetable-1'); expect(conflict.draft.dishes).toEqual([locked]);
  });
  it('replaces only the target, excludes its current family, and retains other locked dishes', () => {
    const meat = candidates('meat')[0]!; const veg = candidates('vegetable')[0]!; const value = input({ draft: draft({ dishes: [{ slotId: 'meat-1', recipe: snapshotRecipe(meat), locked: false }, { slotId: 'vegetable-1', recipe: snapshotRecipe(veg), locked: true }] }) });
    const result = generated(replaceSlot(value, 'meat-1')); expect(result.draft.dishes[0]?.recipe.familyId).not.toBe(meat.familyId); expect(result.draft.dishes[1]).toEqual(value.draft.dishes[1]);
  });
  it('requires unlocking the target and retains the original when there is no replacement', () => {
    const rows = candidates('meat'); const original = { slotId: 'meat-1', recipe: snapshotRecipe(rows[0]!), locked: false }; rows.slice(1).forEach((r) => { r.ingredients[0]!.ingredientId = 'exclude'; });
    const value = input({ catalog: catalogOf(rows), hardExclusions: ['exclude'], draft: draft({ dishes: [original] }) });
    const result = generated(replaceSlot(value, 'meat-1')); expect(result.draft).toEqual(value.draft); expect(result.missing[0]?.reason).toMatch(/保留/);
    expect(generated(replaceSlot({ ...value, draft: draft({ dishes: [{ ...original, locked: true }] }) }, 'meat-1')).conflicts[0]?.reason).toMatch(/解除/);
  });
  it('uses favorite 2, ordinary 1, recent actual ×0.5 and never reduces by plan or repeated meals', () => {
    const row = candidates('vegetable')[0]!; const value = input(); expect(selectionWeight(row, value)).toBe(1);
    expect(selectionWeight(row, { ...value, favoriteIds: [row.recipeId] })).toBe(2);
    expect(selectionWeight(row, { ...value, actualMeals: [actual('2026-10-09', [row]), actual('2026-10-08', [row])] })).toBe(0.5);
    expect(selectionWeight(row, { ...value, favoriteIds: [row.recipeId], actualMeals: [actual('2026-10-03', [row])] })).toBe(1);
    expect(selectionWeight(row, { ...value, actualMeals: [actual('2026-10-02', [row])] })).toBe(1);
  });
  it('shows specific unknown raw ingredients and the matched exclusion for manual selection', () => {
    const row = recipe({ ingredients: [{ ingredientId: null, raw: '复合酱汁原文', form: '', part: null, quantity: null, trust: 'unknown', compoundResolved: false }] });
    expect(manualWarnings(row, ['fixture-exclusion'], ['未知忌口'] ).join(' ')).toMatch(/复合酱汁原文/); expect(manualWarnings(row, [], ['未知忌口']).join(' ')).toMatch(/未知忌口/);
    const known = candidates('vegetable')[0]!; expect(manualWarnings(known, ['reviewed-fixture-ingredient'], []).join(' ')).toMatch(/审核测试原料/);
  });
});
describe('recent seven local calendar dates', () => {
  it.each(['2026-10-09', '2026-10-08', '2026-10-03'])('includes %s', (date) => expect(isRecentLocalDate(date as LocalDate, today)).toBe(true));
  it.each(['2026-10-02', '2026-10-10'])('excludes %s', (date) => expect(isRecentLocalDate(date as LocalDate, today)).toBe(false));
  it('counts calendar boundaries across daylight saving without elapsed-hour arithmetic', () => {
    expect(isRecentLocalDate('2026-03-03' as LocalDate, '2026-03-09' as LocalDate)).toBe(true); expect(isRecentLocalDate('2026-03-02' as LocalDate, '2026-03-09' as LocalDate)).toBe(false);
    expect(isRecentLocalDate('2026-10-27' as LocalDate, '2026-11-02' as LocalDate)).toBe(true); expect(isRecentLocalDate('2026-10-26' as LocalDate, '2026-11-02' as LocalDate)).toBe(false);
  });
});

describe('fail-closed generator boundaries', () => {
  it('rejects null input and malformed candidate structures without throwing', () => {
    expect(() => generateMeal(null as unknown as GenerateInput)).not.toThrow(); expect(generateMeal(null as unknown as GenerateInput).ok).toBe(false);
    const value = input(); value.catalog.recipes[0]!.meals = null as unknown as CatalogRecipe['meals'];
    expect(() => generateMeal(value)).not.toThrow(); expect(generateMeal(value)).toMatchObject({ ok: false, error: { code: 'INVALID' } });
  });
  it('filters hard restrictions before choosing a family variant representative', () => {
    const rows = candidates('vegetable'); const unsafe = { ...structuredClone(rows[0]!), recipeId: 'a:unsafe' }; unsafe.ingredients[0]!.ingredientId = 'exclude';
    const result = generated(generateMeal(input({ catalog: catalogOf([unsafe, ...rows]), hardExclusions: ['exclude'], draft: draft({ slots: [{ id: 'v1', type: 'vegetable' }, { id: 'v2', type: 'vegetable' }, { id: 'v3', type: 'vegetable' }, { id: 'v4', type: 'vegetable' }] }) })));
    expect(result.draft.dishes).toHaveLength(4); expect(result.missing).toEqual([]); expect(result.draft.dishes.every((d) => d.recipe.recipeId !== 'a:unsafe')).toBe(true);
  });
  it('will not use an unverified candidate even with a generationEligible flag', () => {
    const rows = candidates('vegetable'); rows.forEach((row) => { row.reviewStatus = 'UNREVIEWED'; });
    const result = generated(generateMeal(input({ catalog: catalogOf(rows) }))); expect(result.draft.dishes).toEqual([]); expect(result.missing).toHaveLength(2);
  });
  it('retains every locked snapshot when a recipe was removed or a same-name lock conflicts', () => {
    const rows = candidates('vegetable'); const value = input({ draft: draft({ slots: [{ id: 'a', type: 'vegetable' }, { id: 'b', type: 'vegetable' }], dishes: [{ slotId: 'a', recipe: snapshotRecipe(rows[0]!), locked: true }, { slotId: 'b', recipe: snapshotRecipe({ ...rows[1]!, name: rows[0]!.name }), locked: true }] }) });
    const result = generated(generateMeal(value)); expect(result.conflicts).toHaveLength(1); expect(result.draft).toEqual(value.draft);
    const removed = generated(generateMeal({ ...value, catalog: catalogOf([]) })); expect(removed.conflicts).toHaveLength(2); expect(removed.draft).toEqual(value.draft);
  });
  it.each(['unknown-steps', 'missing-ingredients', 'unknown-identities'])('does not admit incomplete %s even if the eligibility flag is set', (problem) => {
    const rows = candidates('vegetable'); rows.forEach((row) => { if (problem === 'unknown-steps') row.stepStatus = 'UNKNOWN'; else if (problem === 'missing-ingredients') row.ingredients = []; else row.ingredients[0]!.trust = 'unknown'; });
    const result = generated(generateMeal(input({ catalog: catalogOf(rows) }))); expect(result.draft.dishes).toEqual([]);
  });

});

it('uses favorite and actual-history weights in the real seeded sampler', () => {
  const rows = candidates('vegetable'); const value = input({ catalog: catalogOf(rows), draft: draft({ slots: [{ id: 'v', type: 'vegetable' }] }), seed: 123 });
  expect(generated(generateMeal(value)).draft.dishes[0]?.recipe.recipeId).toBe('vegetable:4');
  expect(generated(generateMeal({ ...value, favoriteIds: ['vegetable:1'] })).draft.dishes[0]?.recipe.recipeId).toBe('vegetable:3');
  expect(generated(generateMeal({ ...value, actualMeals: [actual('2026-10-09', [rows[3]!])] })).draft.dishes[0]?.recipe.recipeId).toBe('vegetable:3');
  expect(generated(generateMeal({ ...value, favoriteIds: ['vegetable:1'], actualMeals: [actual('2026-10-09', [rows[0]!])] })).draft.dishes[0]?.recipe.recipeId).toBe('vegetable:4');
});

it('rejects null actual-history entries without throwing in generation or replacement', () => {
  const value = input({ actualMeals: [null as unknown as ActualMeal] });
  expect(() => generateMeal(value)).not.toThrow(); expect(generateMeal(value)).toMatchObject({ ok: false, error: { code: 'INVALID' } });
  expect(() => replaceSlot(value, 'meat-1')).not.toThrow();
});

describe('retained locked snapshot admission', () => {
  const problems = ['incompatible-type', 'missing-ingredients', 'missing-steps', 'unknown-ingredient', 'old-version', 'missing-version', 'changed-family', 'changed-name', 'changed-content-same-version', 'changed-ingredients-same-version', 'unknown-live-version'] as const;
  it.each(problems)('preserves the entire draft and reports %s for generation and replacement', (problem) => {
    const live = candidates('meat')[0]!;
    const retained = snapshotRecipe(live);
    if (problem === 'incompatible-type') retained.types = ['vegetable'];
    if (problem === 'missing-ingredients') retained.ingredients = [];
    if (problem === 'missing-steps') retained.steps = [];
    if (problem === 'unknown-ingredient') retained.ingredients[0]!.trust = 'unknown';
    if (problem === 'old-version') retained.contentVersion = 'older-reviewed-version';
    if (problem === 'missing-version') delete retained.contentVersion;
    if (problem === 'changed-family') retained.familyId = 'old-family';
    if (problem === 'changed-name') retained.name = 'old retained recipe name';
    if (problem === 'changed-ingredients-same-version') retained.ingredients[0]!.raw = '旧配料内容';
    if (problem === 'changed-content-same-version') retained.steps = ['以前的步骤，当前审核未涵盖'];
    const other = snapshotRecipe(candidates('vegetable')[0]!);
    const value = input({ draft: draft({ dishes: [{ slotId: 'meat-1', recipe: retained, locked: true }, { slotId: 'vegetable-1', recipe: other, locked: false }] }) });
    if (problem === 'unknown-live-version') value.catalog.recipes.find((row) => row.recipeId === live.recipeId)!.contentVersion = null;
    const before = structuredClone(value);
    for (const run of [() => generateMeal(value), () => replaceSlot(value, 'vegetable-1')]) {
      const result = generated(run());
      expect(result.conflicts).toEqual([{ slotId: 'meat-1', reason: expect.stringMatching(/快照.*(类型|完整|版本|内容).*解除锁定或移除/u) }]);
      expect(result.draft).toEqual(value.draft);
      expect(result.missing).toEqual([]);
    }
    expect(value).toEqual(before);
  });
  it('does not borrow a live reviewed version when the retained snapshot also lacks its own type and facts', () => {
    const live = candidates('meat')[0]!;
    const retained = snapshotRecipe(live); retained.types = ['vegetable']; retained.ingredients = []; retained.steps = [];
    const value = input({ draft: draft({ dishes: [{ slotId: 'meat-1', recipe: retained, locked: true }] }) });
    expect(generated(generateMeal(value)).conflicts[0]?.slotId).toBe('meat-1');
    expect(generated(replaceSlot(value, 'vegetable-1')).draft).toEqual(value.draft);
  });
});

it('admits identical reviewed snapshot facts regardless of object key order', () => {
  const live = candidates('meat')[0]!;
  const retained = snapshotRecipe(live);
  retained.source = { license: null, commit: null, url: null };
  retained.ingredients = retained.ingredients.map((ingredient) => ({ compoundResolved: ingredient.compoundResolved, trust: ingredient.trust, quantity: ingredient.quantity, raw: ingredient.raw, part: ingredient.part, form: ingredient.form, ingredientId: ingredient.ingredientId }));
  const value = input({ draft: draft({ dishes: [{ slotId: 'meat-1', recipe: retained, locked: true }] }) });
  const result = generated(generateMeal(value));
  expect(result.conflicts).toEqual([]);
  expect(result.draft.dishes.find((dish) => dish.slotId === 'meat-1')?.recipe).toEqual(retained);
});
