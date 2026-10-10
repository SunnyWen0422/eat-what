import { test, expect } from '@playwright/test';
// HTTP only. Does not execute a browser or prove live API non-regression.
// Set RELEASE_ACCEPTANCE_URL to an explicitly authorized isolated candidate server.
const base = process.env.RELEASE_ACCEPTANCE_URL;
test.describe('candidate static HTTP routing (not browser or production API evidence)', () => {
  test.skip(!base, 'No authorized isolated candidate URL; route acceptance NOT RUN');
  test('entry, fixed hash navigation, missing resources and reserved services do not share a broad HTML fallback', async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: base! });
    try {
      const entryBody = await (await request.get('/')).text();
      for (const path of ['/', '/#/today', '/#/recipes', '/#/calendar', '/#/my']) {
        const response = await request.get(path); expect(response.status()).toBe(200); expect(response.headers()['content-type']).toContain('text/html');
      }
      for (const path of ['/unknown', '/recipes', '/web-assets/missing/missing-abc12345.js']) {
        const response = await request.get(path); expect(await response.text()).not.toBe(entryBody);
        if (path === '/unknown' || path === '/recipes' || path.startsWith('/web-assets/')) expect(response.status()).toBe(404);
      }
      for (const path of ['/main', '/.well-known/acme-challenge/nonexistent-test-token']) {
        const response = await request.get(path); expect(await response.text()).not.toBe(entryBody);
      }
      for (const path of ['/api/public/catalog/dishes?page=1&pageSize=1', '/health']) {
        const response = await request.get(path); expect(response.headers()['content-type'] ?? '').not.toContain('text/html');
      }
    } finally { await request.dispose(); }
  });
});
