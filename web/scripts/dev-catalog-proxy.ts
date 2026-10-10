import type { ProxyOptions } from 'vite';

/** Development server only: the browser retains its fixed same-origin public GET contract. */
export function catalogProxy(mode: string | undefined): Record<string, ProxyOptions> {
  if (mode === undefined || mode === 'off') return {};
  if (mode !== 'online') throw new Error('Catalog proxy mode must be online or off; arbitrary targets are not supported.');
  return {
    '^/api/public/catalog/dishes(?:\\?|$)': {
      target: 'https://chishenme.icu', changeOrigin: true, secure: true, timeout: 15000, proxyTimeout: 15000,
      configure(proxy) {
        proxy.on('proxyReq', request => { request.removeHeader('authorization'); request.removeHeader('cookie'); });
      },
      bypass(request, response) {
        if (request.method !== 'GET') {
          // WebSocket upgrade calls have no HTTP response and must also be refused.
          if (!response) return false;
          response.statusCode = 405; response.setHeader('Allow', 'GET'); response.setHeader('Content-Type', 'application/json');
          response.end('{"error":"PUBLIC_CATALOG_GET_ONLY"}');
          // Vite's false branch writes a 404. An ended string bypass preserves this 405.
          return request.url ?? '/api/public/catalog/dishes';
        }
        return undefined;
      },
    },
  };
}
