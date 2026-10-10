import { expect, it } from 'vitest';
import { catalogProxy } from '../scripts/dev-catalog-proxy.ts';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

it('only proxies the public recipe directory to the fixed HTTPS service in online development mode', () => {
  const options = catalogProxy('online');
  expect(Object.keys(options)).toEqual(['^/api/public/catalog/dishes(?:\\?|$)']);
  const proxy = Object.values(options)[0]!;
  expect(proxy.target).toBe('https://chishenme.icu');
  expect(proxy.secure).toBe(true);
  expect(proxy.changeOrigin).toBe(true);
  expect(catalogProxy(undefined)).toEqual({});
});

it('does not enable arbitrary proxy addresses or private API paths', () => {
  expect(() => catalogProxy('https://other.example')).toThrow();
  expect(Object.keys(catalogProxy('online')).some(key => key === '/api')).toBe(false);
});

it('rejects writes and websocket upgrades before contacting the upstream service', async () => {
  const proxy = Object.values(catalogProxy('online'))[0]!;
  const request = new IncomingMessage(new Socket());
  request.method = 'POST'; request.url = '/api/public/catalog/dishes';
  const response = new ServerResponse(request);
  expect(await proxy.bypass!(request, response, proxy)).toBe(request.url);
  expect(response.statusCode).toBe(405);
  expect(response.getHeader('Allow')).toBe('GET');
  expect(response.writableEnded).toBe(true);
  expect(await proxy.bypass!(request, undefined, proxy)).toBe(false);
  request.method = 'GET';
  expect(await proxy.bypass!(request, response, proxy)).toBeUndefined();
});

it('strips credentials from the public upstream request', () => {
  const proxy = Object.values(catalogProxy('online'))[0]!;
  const removed: string[] = [];
  let listener: ((request: { removeHeader(name: string): void }) => void) | undefined;
  const fake = { on(event: string, callback: typeof listener) { expect(event).toBe('proxyReq'); listener = callback; } };
  proxy.configure!(fake as Parameters<NonNullable<typeof proxy.configure>>[0], proxy);
  listener!({ removeHeader: name => removed.push(name) });
  expect(removed).toEqual(['authorization', 'cookie']);
});
