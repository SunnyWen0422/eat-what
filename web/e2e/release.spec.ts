import { test, expect } from '@playwright/test';
// Set RELEASE_ACCEPTANCE_URL to an explicitly authorized isolated candidate server.
// This helper intentionally returns 503 for public API reads; no production service is tested.
const base = process.env.RELEASE_ACCEPTANCE_URL;
if (base) {
  const target = new URL(base);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.pathname !== '/' || target.search || target.hash)
    throw new Error('Static acceptance requires an isolated root URL on http://127.0.0.1.');
}

test.describe('isolated static candidate acceptance (public API disabled)', () => {
  test.skip(!base, 'No authorized isolated candidate URL; route acceptance NOT RUN');
  test('HTTP entry paths, versioned resources and reserved services have distinct exact responses', async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: base! });
    try {
      const entry = await request.get('/'); expect(entry.status(), 'Static candidate root must be readable before route acceptance').toBe(200);
      expect(entry.headers()['content-type']).toContain('text/html'); const entryBody = await entry.text();
      // HTTP targets contain pathname/search only. Hash routes are exercised by Chrome below.
      for (const path of ['/', '/index.html', '/?static-acceptance=1']) {
        const response = await request.get(path); expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('text/html'); expect(response.headers()['cache-control']).toBe('no-cache');
        expect(await response.text()).toBe(entryBody);
      }
      const resources = [...entryBody.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]!);
      expect(resources.some(path => path.endsWith('.js'))).toBe(true); expect(resources.some(path => path.endsWith('.css'))).toBe(true);
      for (const path of resources) {
        expect(path).toMatch(/^\/web-assets\/[a-z0-9][a-z0-9-]{0,63}\//);
        const response = await request.get(path); expect(response.status(), `Candidate resource: ${path}`).toBe(200);
        expect(response.headers()['cache-control']).toContain('immutable');
      }
      for (const path of ['/unknown', '/recipes', '/web-assets/missing/missing-abc12345.js']) {
        const response = await request.get(path); expect(await response.text()).not.toBe(entryBody);
        expect(response.status()).toBe(404);
      }
      for (const path of ['/main', '/.well-known/acme-challenge/nonexistent-test-token']) {
        const response = await request.get(path); expect(response.status()).toBe(404); expect(await response.text()).not.toBe(entryBody);
      }
      const api = await request.get('/api/public/catalog/dishes?page=1&pageSize=1'); expect(api.status()).toBe(503);
      expect(api.headers()['content-type']).toContain('application/json'); expect(await api.json()).toEqual({ error: 'CANDIDATE_LOCAL_API_DISABLED' });
      const health = await request.get('/health'); expect(health.status()).toBe(200); expect(await health.text()).toBe('candidate-local-only\n');
      expect(health.headers()['content-type']).toContain('text/plain');
    } finally { await request.dispose(); }
  });

  test('built browser assets open every hash route and retain navigation with explicit public API degradation', async ({ page }) => {
    const origin = new URL(base!).origin, requests: string[] = [], scriptErrors: string[] = [];
    const assets: { path: string; status: number }[] = [];
    page.on('request', request => requests.push(request.url()));
    page.on('pageerror', error => scriptErrors.push(error.message));
    page.on('response', response => { const path = new URL(response.url()).pathname; if (path.startsWith('/web-assets/')) assets.push({ path, status: response.status() }); });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const routes = [['today', '今天吃什么'], ['recipes', '菜谱'], ['calendar', '日历'], ['my', '我的']] as const;
    for (const [route, label] of routes) {
      // A hash-only change returns no HTTP response; start each deep link in a fresh document.
      await page.goto('about:blank');
      const directory = page.waitForResponse(response => new URL(response.url()).pathname === '/api/public/catalog/dishes' && response.status() === 503);
      await Promise.all([
        page.goto(new URL(`/#/${route}`, base!).href).then(response => { expect(response?.status(), `Built candidate entry for ${route}`).toBe(200); }),
        directory,
      ]);
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
      await expect(page.getByRole('navigation').getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
      if (route === 'recipes') {
        await expect(page.getByRole('button', { name: '重试在线菜谱', exact: true })).toBeVisible();
        await expect(page.getByText('在线菜谱暂时无法读取。已有个人计划仍可查看，可在“我的”新建自定义菜谱。', { exact: true })).toBeVisible();
      }
    }
    const directoryReads = requests.filter(url => new URL(url).pathname === '/api/public/catalog/dishes').length;
    for (const [route, label] of routes) {
      await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new URL(`/#/${route}`, base!).href);
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    }
    await page.goBack(); await expect(page.getByRole('heading', { name: '日历', exact: true })).toBeVisible();
    expect(requests.filter(url => new URL(url).pathname === '/api/public/catalog/dishes')).toHaveLength(directoryReads);
    expect(requests.every(url => new URL(url).origin === origin)).toBe(true);
    expect(assets.some(asset => asset.path.endsWith('.js'))).toBe(true); expect(assets.some(asset => asset.path.endsWith('.css'))).toBe(true);
    expect(assets.every(asset => asset.status === 200)).toBe(true); expect(scriptErrors).toEqual([]);
  });
});
