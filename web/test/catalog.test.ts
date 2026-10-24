import { describe, expect, it, vi } from 'vitest';
import { canGenerate, createPublicCatalogProvider, loadCatalog, normalizePublicDish } from '../src/catalog/catalog.ts';
import type { PublicDish, PublicDishPage, PublicDishQuery } from '../src/domain/types.ts';
import { isRecipeSnapshot } from '../src/domain/validation.ts';
import { canonicalPublicDish, canonicalRecipeFixture, CANONICAL_FIXTURE_REVISION } from './canonical-fixture.ts';

const catalogOnlyKeys = ['meals', 'generationEligible', 'issues', 'familyIdentity', 'mealEligibility'];

it('refresh abort preserves last complete catalog: total deadline includes all pages', async () => {
  vi.useFakeTimers();
  try {
    const old = await catalog();
    const progress = vi.fn(); let signal: AbortSignal | undefined;
    const rows = Array.from({ length: 101 }, (_, i) => dish(i + 1));
    const next = loadCatalog({ list: async (query, options) => {
      signal = options?.signal;
      if (query.page === 1) {
        await new Promise(resolve => setTimeout(resolve, 14000));
        return { ok: true, value: { ...query, list: rows.slice(0, 100), total: 101 } };
      }
      return new Promise(() => {});
    } }, { onProgress: progress });
    await vi.advanceTimersByTimeAsync(20001);
    expect((await next).ok).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(progress).toHaveBeenCalledWith({ loaded: 100, total: 101 });
    expect(old.recipes).toHaveLength(3); expect(canGenerate(old, 'dinner', 'vegetable')).toBe(true);
  } finally { vi.useRealTimers(); }
});

it('aborts a provider that ignores cancellation without publishing partial rows', async () => {
  const controller = new AbortController();
  const next = loadCatalog({ list: () => new Promise(() => {}) }, { signal: controller.signal });
  controller.abort(); expect((await next).ok).toBe(false);
});

it('a single page has at most fifteen seconds and an oversized directory is rejected', async () => {
  vi.useFakeTimers();
  try {
    const pending = loadCatalog({ list: () => new Promise(() => {}) });
    await vi.advanceTimersByTimeAsync(15001); expect((await pending).ok).toBe(false);
    const overLimit = await loadCatalog(createPublicCatalogProvider(async query => ({ ...query, total: 10001, list: Array.from({ length: 100 }, (_, i) => dish(i + 1)) })));
    expect(overLimit.ok).toBe(false); expect(Object.hasOwn(overLimit, 'value')).toBe(false);
  } finally { vi.useRealTimers(); }
});

const dish = canonicalPublicDish;
function page(rows: PublicDish[] = [dish()], query: PublicDishQuery = { page: 1, pageSize: 100 }): PublicDishPage {
  return { list: rows, total: rows.length, page: query.page, pageSize: query.pageSize };
}
function provider(rows: PublicDish[] = [dish()]) { return createPublicCatalogProvider(async (query) => page(rows, query)); }
async function catalog(rows: PublicDish[] = [dish(1), dish(2), dish(3)]) {
  const result = await loadCatalog(provider(rows)); expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message); return result.value;
}

describe('injectable public online contract', () => {
  it('returns retryable provider errors without static fallback recipes', async () => {
    const result = await loadCatalog(createPublicCatalogProvider(async () => { throw new Error('network unavailable'); }));
    expect(result.ok).toBe(false); if (!result.ok) { expect(result.error.code).toBe('UNAVAILABLE'); expect(result.error.retryable).toBe(true); }
    expect(Object.hasOwn(result, 'value')).toBe(false);
  });
  it('fails closed without an approved/configured transport', async () => {
    const result = await loadCatalog(); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.retryable).toBe(true);
  });
  it('accepts an empty successful online directory without local recipes', async () => {
    const result = await loadCatalog(provider([])); expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.recipes).toEqual([]); expect(canGenerate(result.value, 'dinner', 'meat')).toBe(false); }
  });
  it.each([{ id: 0 }, { id: Number.MAX_SAFE_INTEGER + 1 }, { recipe: null }, { recipe: { ...canonicalRecipeFixture(), name: '' } }, { recipe: { ...canonicalRecipeFixture(), steps: [{ id: 's1', text: { html: 'bad' }, ingredientLineIds: [] }] } }])('rejects invalid API fields %j', async (bad) => {
    const response = { ...dish(), ...bad }; const result = await createPublicCatalogProvider(async (query) => ({ ...page([], query), list: [response], total: 1 })).list({ page: 1, pageSize: 100 });
    expect(result.ok).toBe(false);
  });
  it('drops owner and legacy evidence fields while retaining canonical public photos', async () => {
    const row = { ...dish(1, {}, { imageUrl: 'https://images.example/food.png' }), userId: 7, isCustom: 1, isPublished: 1, image: 'https://private.example/legacy', stepImages: ['https://private.example/image'], kcal: 999, quality: { reviewedBy: 'private reviewer', sourceRef: 'private source', nutritionKcal: 888, ingredients: [{ identityEvidence: 'private identity', quantityEvidence: 'private quantity', sourceLabel: 'private evidence' }] } };
    const result = await createPublicCatalogProvider(async (query) => ({ ...page([], query), list: [row], total: 1, owner: 'secret' })).list({ page: 1, pageSize: 100 });
    expect(result.ok).toBe(true); if (result.ok) { const text = JSON.stringify(result.value); expect(text).not.toMatch(/private|secret|userId|isPublished|nutritionKcal|stepImages/); expect(result.value.list[0]?.image).toBe('https://images.example/food.png'); }
  });
  it('never sends personal input or credentials through paginated requests', async () => {
    const seen: PublicDishQuery[] = []; const result = await loadCatalog(createPublicCatalogProvider(async (query) => { seen.push(query); return page([], query); }));
    expect(result.ok).toBe(true); expect(seen).toEqual([{ page: 1, pageSize: 100 }]);
    const invalid = await createPublicCatalogProvider(async () => { throw new Error('must not run'); }).list({ page: 1, pageSize: 100, keyword: 'allergy' } as PublicDishQuery);
    expect(invalid.ok).toBe(false);
  });
  it('rejects a changed or inconsistent pagination snapshot without partial catalog exposure', async () => {
    const rows = Array.from({ length: 101 }, (_, i) => dish(i + 1));
    const result = await loadCatalog(createPublicCatalogProvider(async (query) => ({ list: query.page === 1 ? rows.slice(0, 100) : [rows[100]], total: query.page === 1 ? 101 : 102, ...query })));
    expect(result.ok).toBe(false); expect(Object.hasOwn(result, 'value')).toBe(false);
  });
});

describe('truthful canonical online normalization', () => {
  it.each([null, '', '   ', '\t\n', undefined])('rejects unknown content version %j instead of promoting a stale snapshot', (contentVersion) => {
    const row = dish();
    if (contentVersion === undefined) Reflect.deleteProperty(row, 'contentVersion');
    else row.contentVersion = contentVersion;
    expect(normalizePublicDish(row).ok).toBe(false);
  });
  it('normalizes canonical ingredient facts into a valid saved snapshot', () => {
    const result = normalizePublicDish(dish()); expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isRecipeSnapshot(result.value, catalogOnlyKeys)).toBe(true);
      expect(result.value.ingredients).toEqual([{ ingredientId: 'ing_green', form: '', part: null, raw: '青菜', quantity: { kind: 'exact', value: 100, unit: 'g' }, trust: 'reviewed', compoundResolved: true }]);
      expect(result.value.canonical?.revision).toBe(CANONICAL_FIXTURE_REVISION);
    }
  });
  it('rejects legacy publication or quality claims without a canonical recipe', async () => {
    const row = { ...dish(), recipe: undefined, isPublished: 1, reviewStatus: 'VERIFIED', cl: '青菜100g', step: '煮熟', quality: { reviewStatus: 'VERIFIED' } };
    const result = await createPublicCatalogProvider(async (query) => ({ ...page([], query), list: [row], total: 1 })).list({ page: 1, pageSize: 100 });
    expect(result.ok).toBe(false); expect(Object.hasOwn(result, 'value')).toBe(false);
  });
  it('keeps discretionary quantities and unknown original servings without reading legacy numeric text', () => {
    const recipe = canonicalRecipeFixture(1, { baseServings: null }); recipe.ingredients[0]!.quantity = null; recipe.ingredients[0]!.quantityKind = 'discretionary'; recipe.ingredients[0]!.quantityDisplay = '适量';
    const normalized = normalizePublicDish(dish(1, { recipe, fl: '2人', ingredientsAmounts: '青菜100g' })); expect(normalized.ok).toBe(true);
    if (normalized.ok) { expect(normalized.value.baseServings).toBe(null); expect(normalized.value.ingredients[0]!.quantity).toBe(null); expect(normalized.value.ingredients[0]!.quantityDisplay).toBe('适量'); expect(normalized.value.generationEligible).toBe(true); }
  });
  it('retains exact source quantities and canonical ingredient identity', () => {
    const normalized = normalizePublicDish(dish()); expect(normalized.ok).toBe(true);
    if (normalized.ok) { expect(normalized.value.baseServings).toBe(2); expect(normalized.value.ingredients[0]!.quantity).toEqual({ kind: 'exact', value: 100, unit: 'g' }); expect(normalized.value.ingredients[0]!.ingredientId).toBe('ing_green'); expect(normalized.value.ingredients[0]!.compoundResolved).toBe(true); }
  });
  it('uses stable recipe ids and the supplied canonical family without inventing provenance', () => {
    const first = normalizePublicDish(dish(42)); const renamed = normalizePublicDish(dish(42, {}, { name: '新显示名称' })); expect(first.ok).toBe(true); expect(renamed.ok).toBe(true);
    if (first.ok && renamed.ok) { expect(first.value.recipeId).toBe('eatwhat-db:42'); expect(renamed.value.recipeId).toBe(first.value.recipeId); expect(first.value.familyId).toBe('family-42'); expect(first.value.variantId).toBe(null); expect(first.value.source).toEqual({ url: null, commit: null, license: null }); expect(first.value.catalogVersion).toBe(CANONICAL_FIXTURE_REVISION); expect(first.value.reviewedAt).toBeUndefined(); expect(first.value.contentVersion).toBe('fixture-content-42'); }
  });
  it.each([['CAT_MEAT_FISH', 'meat'], ['CAT_VEGETABLE', 'vegetable'], ['CAT_SOUP', 'soup'], ['CAT_STAPLE', 'staple'], ['CAT_DESSERT', 'breakfastSnack']] as const)('maps canonical category %s to %s independently of legacy type', (categoryCode, mapped) => {
    const result = normalizePublicDish(dish(1, { type: 'unmapped' }, { categoryCode })); expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.types).toEqual([mapped]); expect(result.value.mealEligibility).toBe('canonical'); expect(result.value.familyIdentity).toBe('canonical'); }
  });
  it('keeps unsupported canonical categories browsable but unavailable to automatic selection', async () => {
    const value = await catalog([1, 2, 3].map(id => dish(id, { type: 'veg' }, { categoryCode: 'CAT_UNMAPPED' })));
    expect(value.recipes).toHaveLength(3); expect(value.recipes.every((r) => !r.generationEligible && r.types.length === 0)).toBe(true); expect(canGenerate(value, 'dinner', 'vegetable')).toBe(false);
  });
  it('rejects missing canonical steps even when legacy prose is present', async () => {
    const result = await loadCatalog(provider([dish(1, { step: '旧文本看似完整' }, { steps: [] }), dish(2), dish(3)]));
    expect(result.ok).toBe(false); expect(Object.hasOwn(result, 'value')).toBe(false);
  });
  it.each(['REJECTED', 'BROWSE_ONLY'] as const)('ignores legacy %s flags and uses the canonical serving role', status => {
    const row = dish(); row.quality = { reviewStatus: status, basePeople: null, servingsStatus: 'UNKNOWN', stepStatus: 'UNKNOWN', timeStatus: 'UNKNOWN', issueCodes: [], ingredients: [] };
    const result = normalizePublicDish(row); expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.generationEligible).toBe(true); expect(result.value.reviewStatus).toBeUndefined(); }
    const condiment = normalizePublicDish(dish(2, {}, { servingRole: 'condiment' })); expect(condiment.ok).toBe(true); if (condiment.ok) expect(condiment.value.generationEligible).toBe(false);
  });
  it('opens only three distinct provider families and rejects imported catalog clones', async () => {
    const value = await catalog(); expect(canGenerate(value, 'dinner', 'vegetable')).toBe(true); expect(canGenerate(value, 'breakfast', 'vegetable')).toBe(false);
    expect(canGenerate(structuredClone(value), 'dinner', 'vegetable')).toBe(false); expect(value.origin).toBe('online-provider'); expect(value.aliases).toEqual({ 青菜: 'ing_green', 小青菜: 'ing_green' }); expect(value.version).toBe(CANONICAL_FIXTURE_REVISION);
    const repeated = await catalog([1, 2, 3].map(id => dish(id, {}, { dishGroupId: 'same-family' }))); expect(canGenerate(repeated, 'dinner', 'vegetable')).toBe(false);
  });
  it('preserves HTML-like strings as inert text without introducing resource fields', async () => {
    const text = '<img src="https://example.com/a" onerror="alert(1)">'; const value = await catalog([dish(1, {}, { name: text, steps: [{ id: 's1', text, ingredientLineIds: ['i1'] }] })]);
    expect(value.recipes[0]!.name).toBe(text); expect(value.recipes[0]!.steps[0]).toBe(text); expect(Object.keys(value.recipes[0]!)).not.toContain('image');
  });
  it('rejects old quantity policies and active scaling rules', () => {
    const stale = dish(); Reflect.set(stale.recipe!, 'quantityPolicy', 'linear'); expect(normalizePublicDish(stale).ok).toBe(false);
    const batched = dish(); batched.recipe!.scaling = { available: true }; expect(normalizePublicDish(batched).ok).toBe(false);
    const linked = dish(); Reflect.set(linked.recipe!.ingredients[0]!, 'scaleRule', { type: 'linked' }); expect(normalizePublicDish(linked).ok).toBe(false);
  });
  it('rejects mixed catalog revisions without publishing partial rows', async () => {
    const rows = Array.from({ length: 101 }, (_, i) => dish(i + 1)); rows[100]!.catalogRevision = 'other-revision';
    const result = await loadCatalog(createPublicCatalogProvider(async query => ({ ...query, total: 101, list: query.page === 1 ? rows.slice(0, 100) : [rows[100]] })));
    expect(result.ok).toBe(false); expect(Object.hasOwn(result, 'value')).toBe(false);
  });
});

it('keeps provider failure details private and explicitly retryable', async () => {
  const result = await loadCatalog({ async list() { return { ok: false, error: { code: 'UNAVAILABLE', message: 'Bearer private endpoint identity' } }; } });
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toMatch(/Bearer|private|identity/);
  if (!result.ok) expect(result.error.retryable).toBe(true);
});
