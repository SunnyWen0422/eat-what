import { expect, test } from '@playwright/test';
import { choose, createCustom, directory, publicRoute, recipeName } from './ui-fixtures.ts';

test('four routes, local search, detail, plan and independent actual recording', async ({ page }) => {
  await directory(page); await page.goto('/');
  await expect(page.getByRole('navigation', { name: '主导航' }).getByRole('button')).toHaveText(['今天吃什么', '菜谱', '日历', '我的']);
  await expect(page.getByText('无需登录。记录保存在当前浏览器，建议定期导出备份。')).toBeVisible();
  await expect(page.getByRole('button', { name: '生成本餐菜单', exact: true })).toHaveClass('primary');
  await page.getByRole('button', { name: '菜谱', exact: true }).click(); await page.getByLabel('搜索名称或食材').fill('原料原文');
  await page.getByRole('button', { name: `查看详情 ${recipeName}`, exact: true }).click();
  const detail = page.getByRole('dialog', { name: recipeName }); await expect(detail.getByRole('listitem').filter({ hasText: '原料原文，不推断用量' })).toBeVisible(); await expect(detail.getByText(/许可：未知/)).toBeVisible(); await page.keyboard.press('Escape');
  await choose(page); await expect(page.locator('button.primary')).toHaveCount(1); await page.getByRole('button', { name: '保存到日历', exact: true }).click();
  await page.getByRole('button', { name: '保存计划', exact: true }).click(); await expect(page.getByText('计划已保存', { exact: true })).toBeVisible(); await expect(page.getByText('实际饮食为空', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '记录本餐实际饮食', exact: true }).click(); await page.getByRole('button', { name: '确认记录实际', exact: true }).click(); await expect(page.getByText('实际记录已保存', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText('已记录 1 餐', { exact: true })).toBeVisible();
});

test('online missing and malformed responses recover through explicit retry without a fake catalog', async ({ page }) => {
  let reads = 0;
  await page.route(publicRoute, route => { reads++; return route.fulfill(reads === 1 ? { status: 503, contentType: 'application/json', body: '{}' } : reads === 2 ? { contentType: 'application/json', body: '{"page":1,"list":[{"invalid":"bad digest or schema"}]}' } : { contentType: 'application/json', body: JSON.stringify({ page: 1, pageSize: 100, total: 0, list: [] }) }); });
  await page.goto('/#/recipes'); await expect(page.getByRole('button', { name: /^手选 / })).toHaveCount(0); await page.getByRole('button', { name: '重试在线菜谱', exact: true }).click(); await expect(page.getByText(/在线菜谱暂时无法读取/)).toBeVisible();
  await page.getByRole('button', { name: '重试在线菜谱', exact: true }).click(); await expect(page.getByText('当前没有可浏览的在线菜谱。')).toBeVisible();
  await createCustom(page, '目录不可用时的本地菜'); await expect(page.getByRole('button', { name: '手选 目录不可用时的本地菜', exact: true })).toBeVisible();
});

test('already loaded personal workflows remain usable offline and new origin starts empty', async ({ page, context }) => {
  await directory(page); await page.goto('/'); await choose(page); await context.setOffline(true);
  await page.getByRole('button', { name: '保存到日历', exact: true }).click(); await page.getByRole('button', { name: '保存计划', exact: true }).click(); await expect(page.getByText('计划已保存', { exact: true })).toBeVisible();
  await createCustom(page, '断网自定义菜'); await context.setOffline(false);
  const clean = await context.newPage();
  // The same browser profile already has 127.0.0.1 records; only the origin changes.
  await directory(clean); await clean.goto('http://localhost:4173/'); await expect(clean.getByText('计划为空', { exact: true })).toBeVisible(); await expect(clean.getByText('实际饮食为空', { exact: true })).toBeVisible();
  await page.bringToFront(); await page.reload(); await expect(page.getByRole('button', { name: '手选 断网自定义菜', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '今天吃什么', exact: true }).click();
  const savedPlans = page.locator('.card').filter({ has: page.getByRole('heading', { name: '已保存计划', exact: true }) });
  await expect(savedPlans.getByText(recipeName, { exact: true })).toBeVisible(); await clean.close();
});
