import { expect, type Page } from '@playwright/test';
export const publicRoute = '**/api/public/catalog/dishes?*';
export const recipeName = '界面验证青菜';
export const publicPage = { page: 1, pageSize: 100, total: 1, list: [{ id: 930001, name: recipeName, type: 'veg', cl: '原料原文，不推断用量', steps: '第一步\n第二步', contentVersion: 'e2e-ui-only', quality: null }] };
export async function directory(page: Page) { await page.route(publicRoute, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(publicPage) })); }
export async function choose(page: Page) {
  await page.getByRole('button', { name: '菜谱', exact: true }).click(); await page.getByRole('button', { name: `手选 ${recipeName}`, exact: true }).click();
  await expect(page.getByText('草稿已保存', { exact: true })).toBeVisible(); await page.getByRole('button', { name: '今天吃什么', exact: true }).click();
}
export async function createCustom(page: Page, name: string) {
  await page.getByRole('button', { name: '我的', exact: true }).click(); await page.getByRole('button', { name: '新建自定义菜谱', exact: true }).click();
  await page.getByLabel('自定义菜名').fill(name); await page.getByRole('button', { name: '保存自定义菜谱', exact: true }).click(); await expect(page.getByText('自定义菜谱已保存', { exact: true })).toBeVisible();
}

/** Valid normal-v1 test backup; source links are inert until the user chooses to open them. */
export async function longSourceBackup() {
  const { exportBackup } = await import('../src/backup/backup.ts');
  const { personalData, recipe } = await import('../test/fixtures.ts');
  const { snapshotRecipe } = await import('../src/domain/snapshots.ts');
  const data = personalData();
  const saved = snapshotRecipe(recipe({ name: '很长的个人菜名'.repeat(28), source: { url: 'https://source.example/' + 'very-long-source/'.repeat(60), commit: null, license: null } }));
  const at = '2026-10-09T00:00:00.000Z' as import('../src/domain/types.ts').UtcIso;
  data.favorites = [{ id: '00000000-0000-4000-8000-000000000001', recipeId: saved.recipeId, snapshot: saved, revision: 1, createdAt: at, updatedAt: at, requestId: 'e2e-long-source' }];
  const backup = exportBackup(data, { appVersion: '0.1.0', catalogVersion: null, exportedAt: at, timeZone: 'UTC' as import('../src/domain/types.ts').TimeZone });
  if (!backup.ok) throw new Error(backup.error.message);
  return { name: saved.name, source: saved.source.url!, buffer: Buffer.from(await backup.value.arrayBuffer()) };
}
