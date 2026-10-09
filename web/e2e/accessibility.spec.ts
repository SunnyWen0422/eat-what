import { expect, test } from '@playwright/test';
import { createCustom, directory, longSourceBackup } from './ui-fixtures.ts';

for (const width of [320, 390, 768, 1440]) test(`responsive ${width}px and 200% text preserve visible reachable actions`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await directory(page); await page.goto('/');
  for (const label of ['今天吃什么', '菜谱', '日历', '我的']) { await page.getByRole('button', { name: label, exact: true }).click(); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width); }
  const backup = await longSourceBackup();
  await page.getByLabel('选择 JSON 备份').setInputFiles({ name: 'long-source.json', mimeType: 'application/json', buffer: backup.buffer });
  await page.getByLabel('我已保存旧库备份，或接受覆盖且无法撤回').check(); await page.getByRole('button', { name: '确认替换全部个人数据', exact: true }).click();
  await expect(page.getByText('个人备份已恢复。', { exact: true })).toBeVisible(); await page.getByText('查看食材、步骤和来源', { exact: true }).first().click();
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const button = page.getByRole('button', { name: `手选收藏 ${backup.name}`, exact: true }); await button.scrollIntoViewIfNeeded();
  const point = await button.boundingBox(); expect(point).not.toBeNull(); expect(point!.height).toBeGreaterThanOrEqual(44); expect(point!.width).toBeGreaterThanOrEqual(44);
  expect(await button.evaluate(node => { const r = node.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return at === node || node.contains(at); })).toBe(true);
  await createCustom(page, '可操作的长文本后新菜');
});

test('keyboard navigation, dialog Tab trap, Escape, focus return and live status', async ({ page }) => {
  await directory(page); await page.goto('/'); await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused(); await page.keyboard.press('Enter'); await expect(page.locator('#main-content')).toBeFocused();
  const nav = page.getByRole('button', { name: '我的', exact: true }); await nav.focus(); await page.keyboard.press('Enter'); await expect(page).toHaveURL(/#\/my$/);
  const trigger = page.getByRole('button', { name: '新建自定义菜谱', exact: true }); await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '新建自定义菜谱' }); await expect(dialog.getByLabel('自定义菜名')).toBeFocused();
  await dialog.getByRole('button', { name: '取消自定义编辑', exact: true }).focus(); await page.keyboard.press('Tab'); await expect(dialog.getByLabel('自定义菜名')).toBeFocused(); await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: '取消自定义编辑' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused(); await page.keyboard.press('Enter'); await page.getByLabel('自定义菜名').fill('键盘记录'); await page.getByRole('button', { name: '保存自定义菜谱', exact: true }).focus(); await page.keyboard.press('Enter');
  const status = page.getByText('自定义菜谱已保存', { exact: true }); await expect(status).toHaveAttribute('aria-live', 'polite'); await expect(status).toHaveAttribute('aria-atomic', 'true');
});
