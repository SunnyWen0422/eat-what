import { defineConfig } from 'vitest/config';
import { catalogProxy } from './scripts/dev-catalog-proxy.ts';

const releaseId = process.env.EATWHAT_RELEASE_ID;
if (releaseId !== undefined && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(releaseId)) throw new Error('Unsafe release ID');

export default defineConfig({
  publicDir: false,
  base: '/',
  server: { host: '127.0.0.1', proxy: catalogProxy(process.env.EATWHAT_CATALOG_PROXY) },
  build: { assetsDir: releaseId ? `web-assets/${releaseId}` : 'assets' },
  test: { environment: 'node', include: ['test/**/*.test.ts', 'test/**/*.test.tsx'] },
});
