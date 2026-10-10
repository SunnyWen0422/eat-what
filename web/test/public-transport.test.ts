import { describe, expect, it, vi } from 'vitest';
import { createSameOriginPublicCatalogTransport } from '../src/catalog/public-transport.ts';
import { createPublicCatalogProvider, loadCatalog } from '../src/catalog/catalog.ts';
import type { PublicDishQuery } from '../src/domain/types.ts';

const empty = { list: [], total: 0, page: 1, pageSize: 100 };
const response = (body: unknown = empty, status = 200, type = 'application/json') => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': type } });
const cleanFetch = (value: Response) => vi.fn<typeof fetch>().mockResolvedValue(value);

describe('same-origin deliberate public catalog transport', () => {
  it('does not fetch until explicitly called and only sends whitelisted query fields', async () => {
    const fetcher = cleanFetch(response()); const transport = createSameOriginPublicCatalogTransport(fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(transport({ page: 1, pageSize: 100 })).resolves.toEqual(empty);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe('/api/public/catalog/dishes?page=1&pageSize=100');
    expect(options).toMatchObject({ method: 'GET', credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' } });
    expect(JSON.stringify(options)).not.toMatch(/Authorization|Bearer|token|userId|cookie|body/);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it('supports only the exact database type filter', async () => {
    const fetcher = cleanFetch(response({ ...empty, page: 2, pageSize: 50 }));
    await createSameOriginPublicCatalogTransport(fetcher)({ page: 2, pageSize: 50, type: 'veg' });
    expect(fetcher.mock.calls[0]![0]).toBe('/api/public/catalog/dishes?page=2&pageSize=50&type=veg');
  });
  it.each([{ page: 0, pageSize: 100 }, { page: 501, pageSize: 100 }, { page: Number.MAX_SAFE_INTEGER, pageSize: 100 }, { page: 1, pageSize: 101 }, { page: 1, pageSize: 100, userId: 5 }, { page: 1, pageSize: 100, type: 'https://private.example' }, { page: 1, pageSize: 100, keyword: 'allergy' }])('rejects non-whitelisted and unbounded queries %j without requests', async (query) => {
    const fetcher = cleanFetch(response()); await expect(createSameOriginPublicCatalogTransport(fetcher)(query as PublicDishQuery)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([404, 503, 500])('returns retryable unavailability on HTTP %d with no static fallback', async (status) => {
    const fetcher = cleanFetch(response({ message: 'private internal exception' }, status));
    const result = await loadCatalog(createPublicCatalogProvider(createSameOriginPublicCatalogTransport(fetcher)));
    expect(result.ok).toBe(false); expect(Object.hasOwn(result, 'value')).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: 'UNAVAILABLE', retryable: true });
    expect(JSON.stringify(result)).not.toContain('private'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['text/html', 'text/plain', ''])('rejects non-JSON content type %s', async (type) => {
    const fetcher = cleanFetch(response(empty, 200, type)); const result = await createPublicCatalogProvider(createSameOriginPublicCatalogTransport(fetcher)).list({ page: 1, pageSize: 100 }); expect(result.ok).toBe(false);
  });
  it('rejects malformed JSON and oversized response bodies', async () => {
    for (const value of [new Response('{bad', { headers: { 'Content-Type': 'application/json' } }), new Response(' '.repeat(20 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'application/json' } }), new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': String(20 * 1024 * 1024 + 1) } })]) {
      await expect(createSameOriginPublicCatalogTransport(cleanFetch(value))({ page: 1, pageSize: 100 })).rejects.toThrow();
    }
  });
  it('uses the provider whitelist to strip all private, media, provenance and nutrition fields', async () => {
    const row = { id: 1, name: '测试菜', type: 'veg', cl: '青菜', step: '煮熟', contentVersion: 'content', userId: 7, image: 'private image', kcal: 9, quality: { reviewStatus: 'UNKNOWN', reviewedBy: 'private reviewer', sourceRef: 'private source', ingredients: [], issueCodes: [] } };
    const fetcher = cleanFetch(response({ ...empty, total: 1, list: [row], privateOwner: 'secret' }));
    const result = await createPublicCatalogProvider(createSameOriginPublicCatalogTransport(fetcher)).list({ page: 1, pageSize: 100 });
    expect(result.ok).toBe(true); expect(JSON.stringify(result)).not.toMatch(/private|userId|kcal|secret/);
  });
  it('keeps a previously loaded in-memory catalog usable after a later failed refresh', async () => {
    const fetcher = cleanFetch(response()); const provider = createPublicCatalogProvider(createSameOriginPublicCatalogTransport(fetcher));
    const first = await loadCatalog(provider); expect(first.ok).toBe(true); fetcher.mockRejectedValue(new Error('offline'));
    const next = await loadCatalog(provider); expect(next.ok).toBe(false); if (first.ok) expect(first.value.recipes).toEqual([]);
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith('/api/public/catalog/dishes?'))).toBe(true);
  });
  it('rejects redirected responses even if an injected fetch ignores redirect:error', async () => {
    const value = response(); Object.defineProperty(value, 'redirected', { value: true });
    await expect(createSameOriginPublicCatalogTransport(cleanFetch(value))({ page: 1, pageSize: 100 })).rejects.toThrow();
  });
});
