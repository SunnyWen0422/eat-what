import type { PublicCatalogTransport, PublicDishQuery } from '../domain/types.ts';
import { exactKeys, isObject } from '../domain/validation.ts';

const endpoint = '/api/public/catalog/dishes';
const databaseTypes = ['meat', 'veg', 'soup', 'staple', 'dessert'] as const;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
function validQuery(query: unknown): query is PublicDishQuery {
  if (!isObject(query)) return false;
  return exactKeys(query, Object.hasOwn(query, 'type') ? ['page', 'pageSize', 'type'] : ['page', 'pageSize'])
    && typeof query.page === 'number' && Number.isSafeInteger(query.page) && query.page >= 1 && query.page <= 500
    && typeof query.pageSize === 'number' && Number.isSafeInteger(query.pageSize) && query.pageSize >= 1 && query.pageSize <= 100
    && (!Object.hasOwn(query, 'type') || databaseTypes.includes(query.type as typeof databaseTypes[number]));
}
/** No configurable URL, auth data or personal filters. Calling the factory performs no I/O. */
export function createSameOriginPublicCatalogTransport(fetcher: typeof fetch = globalThis.fetch): PublicCatalogTransport {
  return async (query) => {
    if (!validQuery(query)) throw new Error('Invalid public directory query');
    const parameters = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
    if (query.type) parameters.set('type', query.type);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetcher(`${endpoint}?${parameters}`, {
        method: 'GET', credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store',
        headers: { Accept: 'application/json' }, signal: controller.signal,
      });
      if (!response.ok || response.redirected || !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('Content-Type') ?? '')) throw new Error('Public directory is unavailable');
      const length = response.headers.get('Content-Length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) throw new Error('Public directory response is too large');
      if (response.body === null) throw new Error('Public directory response is empty');
      const reader = response.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true });
      let bytes = 0; let body = '';
      try {
        for (;;) {
          const chunk = await reader.read(); if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('Public directory response is too large'); }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      } finally { reader.releaseLock(); }
      // Provider applies the field whitelist, page limits and domain validation after parsing.
      return JSON.parse(body) as unknown;
    } finally { clearTimeout(timeout); }
  };
}
