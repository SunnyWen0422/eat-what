import { describe, expect, it } from 'vitest';
import { canGenerate, createPublicCatalogProvider, loadCatalog, normalizePublicDish } from '../src/catalog/catalog.ts';
import type { PublicDish, PublicDishPage, PublicDishQuery } from '../src/domain/types.ts';
import { isRecipeSnapshot } from '../src/domain/validation.ts';
import { recipe } from './fixtures.ts';

const catalogOnlyKeys = ['meals', 'reviewStatus', 'generationEligible', 'reviewedAt', 'issues', 'stepStatus', 'servingsStatus', 'familyIdentity', 'mealEligibility'];

function dish(id = 1, overrides: Partial<PublicDish> = {}): PublicDish {
  return { id, name: `测试菜${id}`, type: 'veg', cl: '青菜', fl: null, step: '洗净并煮熟。', steps: null, tips: null, ingredientsAmounts: '青菜100g', contentVersion: `fixture-content-${id}`,
    quality: { reviewStatus: 'VERIFIED', basePeople: 2, servingsStatus: 'VERIFIED', stepStatus: 'VERIFIED', timeStatus: 'UNKNOWN', issueCodes: [], ingredients: [{ name: '青菜', unit: 'g', rawText: '青菜100g', rawQuantity: '100', rawUnit: 'g', displayQuantity: '100g', quantityValue: 100, preparation: null, role: null, identityStatus: 'VERIFIED', quantityStatus: 'VERIFIED' }] }, ...overrides };
}
function page(rows = [dish()], query: PublicDishQuery = { page: 1, pageSize: 100 }): PublicDishPage {
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
  it.each([{ id: 0 }, { id: Number.MAX_SAFE_INTEGER + 1 }, { name: 7 }, { step: { html: 'bad' } }, { quality: { ingredients: 'invalid' } }])('rejects invalid API fields %j', async (bad) => {
    const response = { ...dish(), ...bad }; const result = await createPublicCatalogProvider(async (query) => ({ ...page([], query), list: [response], total: 1 })).list({ page: 1, pageSize: 100 });
    expect(result.ok).toBe(false);
  });
  it('drops private, owner, evidence, media and nutritional fields from the public projection', async () => {
    const row = { ...dish(), userId: 7, isCustom: 1, isPublished: 1, image: 'https://private.example/owner.png', stepImages: ['https://private.example/image'], kcal: 999, quality: { ...dish().quality!, reviewedBy: 'private reviewer', sourceRef: 'private source', nutritionKcal: 888, ingredients: [{ ...dish().quality!.ingredients[0], identityEvidence: 'private identity', quantityEvidence: 'private quantity', sourceLabel: 'private evidence' }] } };
    const result = await createPublicCatalogProvider(async (query) => ({ ...page([], query), list: [row], total: 1, owner: 'secret' })).list({ page: 1, pageSize: 100 });
    expect(result.ok).toBe(true); if (result.ok) { const text = JSON.stringify(result.value); expect(text).not.toMatch(/private|secret|userId|isPublished|nutritionKcal|stepImages/); }
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

describe('truthful online normalization', () => {
  it.each([null, '', '   ', '\t\n', undefined])('keeps an unknown version %j browsable as a valid snapshot', (contentVersion) => {
    const row = dish();
    if (contentVersion === undefined) Reflect.deleteProperty(row, 'contentVersion');
    else row.contentVersion = contentVersion;
    const result = normalizePublicDish(row); expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isRecipeSnapshot(result.value, catalogOnlyKeys)).toBe(true);
      expect(result.value.contentVersion).toBe(null);
      expect(result.value.generationEligible).toBe(false);
      expect(result.value.baseServings).toBe(null);
      expect(result.value.ingredients.every((i) => i.quantity === null)).toBe(true);
    }
  });
  it('uses provider-reachable eligibility and identity facts in the shared recipe fixture', () => {
    const result = normalizePublicDish(dish()); expect(result.ok).toBe(true);
    if (result.ok) {
      const fixture = recipe();
      const identities = (ingredients: typeof fixture.ingredients) => ingredients.map(({ trust, ingredientId, compoundResolved }) => ({ trust, ingredientId, compoundResolved }));
      expect(fixture.generationEligible).toBe(result.value.generationEligible);
      expect(identities(fixture.ingredients)).toEqual(identities(result.value.ingredients));
    }
  });
  it('never upgrades publication flags or absent quality to verified', async () => {
    const result = await createPublicCatalogProvider(async (query) => ({ ...page([], query), list: [{ ...dish(), quality: null, isPublished: 1, reviewStatus: 'VERIFIED' }], total: 1 })).list({ page: 1, pageSize: 100 });
    expect(result.ok).toBe(true); if (!result.ok) return;
    const normalized = normalizePublicDish(result.value.list[0]!); expect(normalized.ok).toBe(true);
    if (normalized.ok) { expect(normalized.value.reviewStatus).toBe('UNKNOWN'); expect(normalized.value.generationEligible).toBe(false); expect(normalized.value.baseServings).toBe(null); expect(normalized.value.ingredients.every((i) => i.quantity === null && i.ingredientId === null && i.trust === 'unknown' && !i.compoundResolved)).toBe(true); }
  });
  it('keeps unknown quantities and servings unknown even when numbers are present', () => {
    const row = dish(); row.quality!.servingsStatus = 'UNKNOWN'; row.quality!.ingredients[0]!.quantityStatus = 'UNKNOWN';
    const normalized = normalizePublicDish(row); expect(normalized.ok).toBe(true);
    if (normalized.ok) { expect(normalized.value.baseServings).toBe(null); expect(normalized.value.ingredients[0]!.quantity).toBe(null); }
  });
  it('retains verified exact quantities without inventing standard ids or compound composition', () => {
    const normalized = normalizePublicDish(dish()); expect(normalized.ok).toBe(true);
    if (normalized.ok) { expect(normalized.value.baseServings).toBe(2); expect(normalized.value.ingredients[0]!.quantity).toEqual({ kind: 'exact', value: 100, unit: 'g' }); expect(normalized.value.ingredients[0]!.ingredientId).toBe(null); expect(normalized.value.ingredients[0]!.compoundResolved).toBe(false); }
  });
  it('uses deterministic database recipe/family fallback ids without fake provenance', () => {
    const first = normalizePublicDish(dish(42)); const renamed = normalizePublicDish(dish(42, { name: '新显示名称' })); expect(first.ok).toBe(true); expect(renamed.ok).toBe(true);
    if (first.ok && renamed.ok) { expect(first.value.recipeId).toBe('eatwhat-db:42'); expect(renamed.value.recipeId).toBe(first.value.recipeId); expect(first.value.familyId).toBe(first.value.recipeId); expect(first.value.variantId).toBe(null); expect(first.value.source).toEqual({ url: null, commit: null, license: null }); expect(first.value.catalogVersion).toBe(null); expect(first.value.reviewedAt).toBe(null); expect(first.value.contentVersion).toBe('fixture-content-42'); }
  });
  it.each([['meat', 'meat'], ['veg', 'vegetable'], ['soup', 'soup'], ['staple', 'staple'], ['dessert', 'breakfastSnack']] as const)('maps database %s to %s as an explicit local convention', (type, mapped) => {
    const result = normalizePublicDish(dish(1, { type })); expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.types).toEqual([mapped]); expect(result.value.mealEligibility).toBe('local-convention'); expect(result.value.familyIdentity).toBe('database-id-fallback'); }
  });
  it('keeps safe-text unknown-type rows browsable but unavailable to selection', async () => {
    const value = await catalog([dish(1, { type: 'unmapped' }), dish(2, { type: null }), dish(3, { type: 'unmapped' })]);
    expect(value.recipes).toHaveLength(3); expect(value.recipes.every((r) => !r.generationEligible && r.types.length === 0)).toBe(true); expect(canGenerate(value, 'dinner', 'vegetable')).toBe(false);
  });
  it('excludes incomplete or unverified steps from automatic selection', async () => {
    const incomplete = dish(1, { step: null, steps: null }); const unverified = dish(2); unverified.quality!.stepStatus = 'UNKNOWN';
    const value = await catalog([incomplete, unverified, dish(3)]); expect(canGenerate(value, 'dinner', 'vegetable')).toBe(false);
    expect(value.recipes.filter((r) => r.generationEligible)).toHaveLength(1);
  });
  it('opens only three distinct successful provider families and rejects imported clones', async () => {
    const value = await catalog(); expect(canGenerate(value, 'dinner', 'vegetable')).toBe(true); expect(canGenerate(value, 'breakfast', 'vegetable')).toBe(false);
    expect(canGenerate(structuredClone(value), 'dinner', 'vegetable')).toBe(false); expect(value.origin).toBe('online-provider'); expect(value.aliases).toEqual({}); expect(value.version).toBe(null);
  });
  it('preserves HTML-like strings only as inert text with no resource fields', async () => {
    const text = '<img src="https://example.com/a" onerror="alert(1)">'; const value = await catalog([dish(1, { name: text, step: text })]);
    expect(value.recipes[0]!.name).toBe(text); expect(value.recipes[0]!.steps[0]).toBe(text); expect(Object.keys(value.recipes[0]!)).not.toContain('image');
  });
});

it('keeps provider failure details private and explicitly retryable', async () => {
  const result = await loadCatalog({ async list() { return { ok: false, error: { code: 'UNAVAILABLE', message: 'Bearer private endpoint identity' } }; } });
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toMatch(/Bearer|private|identity/);
  if (!result.ok) expect(result.error.retryable).toBe(true);
});
