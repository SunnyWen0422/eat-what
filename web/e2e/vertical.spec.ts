import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Deliberately test-only public DTOs. No production recipe fallback is installed.
const pageFixture = { page: 1, pageSize: 100, total: 1, list: [{
  id: 910001, name: '浏览器测试青菜', type: 'veg', cl: '测试原料', steps: '测试步骤', contentVersion: 'e2e-only', quality: null,
}] };
const catalogURL = '**/api/public/catalog/dishes?*';
async function directory(page: Page) { await page.route(catalogURL, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(pageFixture) })); }
async function choose(page: Page) {
  await page.getByRole('button', { name: '菜谱', exact: true }).click();
  await page.getByRole('button', { name: '手选 浏览器测试青菜', exact: true }).click();
  await expect(page.getByText('草稿已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '今天吃什么', exact: true }).click();
}
const screenshots = resolve('..', '.superpowers/sdd/2026-10-09-eatwhat-independent-web/screenshots');
test('empty database → manual selection → explicit date/meal → saved plan survives reload; actual stays empty', async ({ page }) => {
  const requests: string[] = []; page.on('request', (request) => requests.push(request.url()));
  await directory(page); await page.goto('/');
  await expect(page.getByText('计划为空', { exact: true })).toBeVisible(); await expect(page.getByText('实际饮食为空')).toBeVisible();
  await choose(page); await page.getByRole('button', { name: '保存到日历' }).click();
  await page.getByLabel('计划日期').fill('2026-10-09'); await page.getByLabel('计划餐次').selectOption('dinner');
  await page.getByRole('button', { name: '保存计划', exact: true }).click(); await expect(page.getByText('计划已保存', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText('2026-10-09 · 晚餐 · 2 人')).toBeVisible(); await expect(page.getByText('实际饮食为空')).toBeVisible();
  const records = await page.evaluate(async () => {
    const request = indexedDB.open('eatwhat-web'); const db = await new Promise<IDBDatabase>((ok, no) => { request.onsuccess = () => ok(request.result); request.onerror = () => no(request.error); });
    const tx = db.transaction(['plans', 'actualMeals']); const planRequest = tx.objectStore('plans').getAll(); const actualRequest = tx.objectStore('actualMeals').getAll();
    await new Promise((ok) => { tx.oncomplete = ok; }); db.close(); return { plans: planRequest.result, actual: actualRequest.result };
  });
  expect(records.plans).toHaveLength(1); expect(records.actual).toEqual([]); expect(records.plans[0].snapshots[0]).not.toHaveProperty('reviewStatus');
  expect(requests.filter((url) => new URL(url).pathname.startsWith('/api/')).every((url) => new URL(url).pathname === '/api/public/catalog/dishes')).toBe(true);
  expect(requests.every((url) => new URL(url).origin === 'http://127.0.0.1:4173')).toBe(true);
  await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: resolve(screenshots, 'task-2-plan-reloaded.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(screenshots, 'task-2-mobile-320.png'), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(screenshots, 'task-2-mobile-200-percent.png'), fullPage: true });
});

test('a second tab changes revision; stale confirmation is blocked until an explicit decision', async ({ page, context }) => {
  await directory(page); await page.goto('/'); await choose(page); await page.getByRole('button', { name: '保存到日历' }).click(); await page.getByLabel('计划日期').fill('2026-10-11');
  const second = await context.newPage(); await directory(second); await second.goto('/'); await choose(second);
  await page.bringToFront();
  await expect(page.getByRole('button', { name: '查看最新内容' })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存计划', exact: true })).toBeDisabled(); await expect(page.getByLabel('计划日期')).toHaveValue('2026-10-11');
  await expect(page.getByText('浏览器测试青菜', { exact: true })).toBeVisible(); await expect(page.getByText('计划已保存', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '查看最新内容' }).click(); await page.getByRole('button', { name: '保留当前编辑并继续' }).click(); await page.getByRole('button', { name: '保存计划', exact: true }).click();
  await expect(page.getByText('计划已保存', { exact: true })).toBeVisible();
});

test('disabled online endpoint shows retry while existing local records stay accessible', async ({ page }) => {
  await directory(page); await page.goto('/'); await choose(page); await page.getByRole('button', { name: '保存到日历' }).click(); await page.getByRole('button', { name: '保存计划', exact: true }).click();
  await page.unroute(catalogURL); await page.route(catalogURL, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })); await page.reload();
  await expect(page.getByText('浏览器测试青菜', { exact: true })).toHaveCount(2); await page.getByRole('button', { name: '菜谱', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试在线菜谱' })).toBeVisible();
});

test('upgrade obstruction is surfaced by IndexedDB; app versionchange releases its connection and newer schema is raw-readonly', async ({ page }) => {
  await directory(page); await page.goto('/'); await choose(page);
  const blocked = await page.evaluate(async () => {
    const oldRequest = indexedDB.open('eatwhat-web', 1); const held = await new Promise<IDBDatabase>((ok) => { oldRequest.onsuccess = () => ok(oldRequest.result); });
    held.onversionchange = () => { /* Test-only old tab deliberately refuses to close. */ };
    const upgrade = indexedDB.open('eatwhat-web', 2);
    const wasBlocked = await new Promise<boolean>((ok, no) => {
      upgrade.onblocked = () => { held.close(); ok(true); }; upgrade.onerror = () => no(upgrade.error);
      upgrade.onupgradeneeded = () => { upgrade.result.createObjectStore('unknown-future-store').put({ future: 'retain me' }, ['future', 7]); };
    });
    await new Promise((ok, no) => { upgrade.onsuccess = ok; upgrade.onerror = () => no(upgrade.error); }); upgrade.result.close(); return wasBlocked;
  });
  expect(blocked).toBe(true); await expect(page.getByText(/本地存储不可写/)).toBeVisible(); await page.reload();
  await expect(page.getByText(/本地数据来自更新版本/)).toBeVisible();
  const raw = await page.evaluate(async () => {
    const modulePath = '/src/data/repository.ts'; const { openRepository } = await import(modulePath); const result = await openRepository({ factory: indexedDB, now: () => new Date(), uuid: () => crypto.randomUUID() });
    if (!result.ok) throw new Error(result.error.message); const status = result.value.status(); const snapshot = await result.value.readRawSnapshot(); const attempted = await result.value.commit({ type: 'savePreferences', preferences: {} }, 0, 'no-write'); result.value.close(); return { status, snapshot, attempted };
  });
  expect(raw.status.writable).toBe(false); expect(raw.attempted).toMatchObject({ ok: false, error: { code: 'NEWER_SCHEMA' } });
  expect(raw.snapshot).toMatchObject({ ok: true, value: { version: 2, stores: expect.arrayContaining([{ name: 'unknown-future-store', entries: [{ key: ['future', 7], value: { future: 'retain me' } }] }]) } });
});

const generationPageFixture = {
  page: 1, pageSize: 100, total: 8,
  list: ['meat', 'veg'].flatMap((type, group) => [1, 2, 3, 4].map((number) => ({
    id: 920000 + group * 10 + number, name: `生成测试${type}${number}`, type, cl: '测试原料原文', steps: '测试步骤', contentVersion: 'e2e-generation-only',
    quality: { reviewStatus: 'VERIFIED', stepStatus: 'VERIFIED', ingredients: [{ name: '审核原料', rawText: '复合原料未知原文', identityStatus: 'VERIFIED' }] },
  }))),
};
async function readDraft(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('eatwhat-web');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(['draft', 'preferences']); const draft = tx.objectStore('draft').get('current'); const preferences = tx.objectStore('preferences').get('current');
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }); db.close();
    return { draft: draft.result, preferences: preferences.result };
  });
}

test('trusted online directory → local generate/lock/replace → settings survive reload without another generation', async ({ page }) => {
  let directoryReads = 0;
  await page.route(catalogURL, (route) => { directoryReads++; return route.fulfill({ contentType: 'application/json', body: JSON.stringify(generationPageFixture) }); });
  await page.goto('/'); await expect(page.getByText('正在读取本地记录…')).toHaveCount(0);
  await page.getByLabel('用餐人数', { exact: true }).fill('4'); await expect(page.getByText('设置和草稿已保存', { exact: true })).toBeVisible();
  const beforeGenerateReads = directoryReads;
  await page.getByRole('button', { name: '生成本餐菜单', exact: true }).click(); await expect(page.getByText('菜单已生成并保存', { exact: true })).toBeVisible();
  const first = await readDraft(page); expect(first.draft.dishes).toHaveLength(3);
  const retained = first.draft.dishes[2];
  await page.getByRole('button', { name: `锁定 ${retained.recipe.name}`, exact: true }).click(); await expect(page.getByText('锁定状态已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `换一道 ${first.draft.dishes[0].recipe.name}`, exact: true }).click(); await expect(page.getByText('换菜已保存', { exact: true })).toBeVisible();
  const changed = await readDraft(page); expect(changed.draft.dishes[0].recipe.familyId).not.toBe(first.draft.dishes[0].recipe.familyId); expect(changed.draft.dishes[2]).toEqual({ ...retained, locked: true });
  expect(directoryReads).toBe(beforeGenerateReads);
  await page.reload(); await expect(page.getByLabel('用餐人数', { exact: true })).toHaveValue('4'); expect(await readDraft(page)).toEqual(changed);
  await page.getByRole('button', { name: '放弃当前菜单', exact: true }).click(); expect(await readDraft(page)).toEqual(changed);
  await page.getByRole('button', { name: '继续编辑', exact: true }).click(); expect(await readDraft(page)).toEqual(changed);
  await page.setViewportSize({ width: 320, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: resolve(screenshots, 'task-3-local-menu-320.png'), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(screenshots, 'task-3-local-menu-200-percent.png'), fullPage: true });
});

test('group confirmation is saved and invalidated by combination edits; unresolved exclusion is never claimed effective', async ({ page }) => {
  await page.route(catalogURL, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(generationPageFixture) }));
  await page.goto('/'); await expect(page.getByText('正在读取本地记录…')).toHaveCount(0);
  await page.getByLabel('用餐人数', { exact: true }).fill('9'); await expect(page.getByText('设置和草稿已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '生成本餐菜单', exact: true }).click(); await expect(page.getByText('超过 8 人，请先确认菜数和类型组合。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '确认人数和组合', exact: true }).click(); await expect(page.getByText('人数和组合确认已保存', { exact: true })).toBeVisible();
  await page.getByLabel('菜数', { exact: true }).fill('3'); await expect(page.getByText('设置和草稿已保存', { exact: true })).toBeVisible(); expect((await readDraft(page)).draft.countsConfirmed).toBe(false);
  await page.getByRole('button', { name: '确认人数和组合', exact: true }).click(); await expect(page.getByText('人数和组合确认已保存', { exact: true })).toBeVisible();
  await page.getByLabel('硬忌口，每行一项').fill('芝麻'); await page.getByRole('button', { name: '保存忌口', exact: true }).click(); await expect(page.getByText('忌口已保存', { exact: true })).toBeVisible();
  const before = await readDraft(page); await page.getByRole('button', { name: '生成本餐菜单', exact: true }).click(); await expect(page.getByText('忌口尚未识别，未生效：芝麻。请补全、移除或手选。', { exact: true })).toBeVisible(); expect(await readDraft(page)).toEqual(before);
});
