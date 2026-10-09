import { defineConfig } from 'vitest/config';

const releaseId = process.env.EATWHAT_RELEASE_ID;
if (releaseId !== undefined && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(releaseId)) throw new Error('Unsafe release ID');

export default defineConfig({
  publicDir: false,
  base: '/',
  build: { assetsDir: releaseId ? `web-assets/${releaseId}` : 'assets' },
  test: { environment: 'node', include: ['test/**/*.test.ts', 'test/**/*.test.tsx'] },
});
