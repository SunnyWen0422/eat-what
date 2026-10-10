import { expect, test } from '@playwright/test';
import { createCustom, directory } from './ui-fixtures.ts';

test('denied IndexedDB getter leaves routes usable and retry reopens the existing records', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await directory(page); await page.goto('/'); await createCustom(page, '存储限制前已保存的菜');
  await page.evaluate(() => sessionStorage.setItem('deny-storage-test', 'yes'));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('deny-storage-test') === 'yes') Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('denied', 'SecurityError'); } });
  });
  await page.reload();
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
  await expect(page.getByText('正在打开本地记录…', { exact: true })).toHaveCount(0);
  await expect(page.getByText('本地存储不可写，本次内容不会保存。可以临时手选菜谱。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('button', { name: '新建自定义菜谱', exact: true })).toBeDisabled();
  await page.evaluate(() => sessionStorage.removeItem('deny-storage-test'));
  await page.getByRole('button', { name: '重新打开本地记录', exact: true }).click();
  await expect(page.getByRole('button', { name: '手选 存储限制前已保存的菜', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
