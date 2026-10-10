import { expect, test } from '@playwright/test';
import { choose, createCustom, directory, longSourceBackup } from './ui-fixtures.ts';

test('only same-origin static assets and fixed credential-free public GETs; personal actions produce no requests', async ({ page }) => {
  const requests: { url: string; method: string; body: string | null; headers: Record<string, string> }[] = [];
  page.on('request', request => { if (!request.url().startsWith('blob:')) requests.push({ url: request.url(), method: request.method(), body: request.postData(), headers: request.headers() }); });
  await directory(page); await page.goto('/'); await choose(page); await createCustom(page, 'NETWORK_PRIVACY_NAME');
  const loadedApi = requests.filter(request => new URL(request.url).pathname.startsWith('/api/'));
  await page.getByRole('button', { name: '今天吃什么', exact: true }).click(); await page.getByLabel('硬忌口，每行一项').fill('NETWORK_PRIVACY_EXCLUSION'); await page.getByRole('button', { name: '保存忌口', exact: true }).click(); await expect(page.getByText('忌口已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '保存到日历', exact: true }).click(); await page.getByRole('button', { name: '保存计划', exact: true }).click(); await expect(page.getByText('计划已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '记录本餐实际饮食', exact: true }).click(); await page.getByLabel('实际备注').fill('NETWORK_PRIVACY_NOTE'); await page.getByRole('button', { name: '确认记录实际', exact: true }).click(); await expect(page.getByText('实际记录已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '保存为菜单模板', exact: true }).click(); await page.getByLabel('模板名称').fill('NETWORK_PRIVACY_TEMPLATE'); await page.getByRole('button', { name: '确认保存模板', exact: true }).click(); await expect(page.getByText('菜单模板已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '从当前草稿建采购清单', exact: true }).click(); await page.getByRole('button', { name: '预览采购合计', exact: true }).click(); await page.getByRole('button', { name: '确认保存新清单', exact: true }).click(); await expect(page.getByText('采购清单已保存', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出已保存个人备份', exact: true }).click(); await download;
  const backup = await longSourceBackup(); await page.getByLabel('选择 JSON 备份').setInputFiles({ name: 'private-import.json', mimeType: 'application/json', buffer: backup.buffer }); await expect(page.getByText('备份已验证，尚未替换任何数据。', { exact: true })).toBeVisible(); await page.getByLabel('我已保存旧库备份，或接受覆盖且无法撤回').check(); await page.getByRole('button', { name: '确认替换全部个人数据', exact: true }).click(); await expect(page.getByText('个人备份已恢复。', { exact: true })).toBeVisible();
  await page.getByText('查看食材、步骤和来源', { exact: true }).first().click(); await expect(page.getByRole('link', { name: backup.source, exact: true })).toHaveAttribute('rel', 'noopener noreferrer'); expect(requests.some(request => request.url.includes('source.example'))).toBe(false);
  await page.getByRole('button', { name: '菜谱', exact: true }).click(); await page.getByLabel('搜索名称或食材').fill('NETWORK_PRIVACY_SEARCH'); await page.getByLabel('仅看收藏').check();
  expect(requests.filter(request => new URL(request.url).pathname.startsWith('/api/'))).toEqual(loadedApi); expect(JSON.stringify(requests)).not.toMatch(/NETWORK_PRIVACY|name=|exclusions=|userId=|Bearer/);
  for (const request of requests) {
    const url = new URL(request.url); expect(url.origin).toBe('http://127.0.0.1:4173'); expect(request.method).toBe('GET'); expect(request.body).toBeNull();
    if (!url.pathname.startsWith('/api/')) expect(url.pathname).toMatch(/^\/$|^\/src\/|^\/@(?:vite|id|react-refresh)\b|^\/node_modules\//);
    if (url.pathname.startsWith('/api/')) { expect(url.pathname).toBe('/api/public/catalog/dishes'); expect([...url.searchParams.keys()].sort()).toEqual(['page', 'pageSize']); expect(request.headers.authorization).toBeUndefined(); expect(request.headers.cookie).toBeUndefined(); }
  }
  expect(await page.evaluate(() => 'serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations().then(registrations => registrations.length) : 0)).toBe(0);
});
