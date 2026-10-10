// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/ui/App.tsx';
import { openRepository, type Repository } from '../src/data/repository.ts';
import { createPublicCatalogProvider, loadCatalog } from '../src/catalog/catalog.ts';
import type { Catalog, Result } from '../src/domain/types.ts';

const repositories: Repository[] = [];
const status = { readable: true, writable: true, origin: 'https://test.invalid', estimate: null, persisted: null, error: null };
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); history.replaceState(null, '', '/'); });
afterEach(() => { cleanup(); repositories.splice(0).forEach(repository => repository.close()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function setup() {
  const opened = await openRepository({ factory: new IDBFactory(), now: () => new Date(), uuid: () => crypto.randomUUID() });
  if (!opened.ok) throw new Error(opened.error.message);
  const repository = opened.value; repositories.push(repository);
  const rows = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `设置验证菜 ${index + 1}`, type: index < 3 ? 'meat' : 'veg', steps: '做好', contentVersion: 'test-settings', quality: { reviewStatus: 'VERIFIED', stepStatus: 'VERIFIED', ingredients: [{ name: '原料', rawText: '原料', identityStatus: 'VERIFIED' }] } }));
  const catalogLoader = (): Promise<Result<Catalog>> => loadCatalog(createPublicCatalogProvider(async query => ({ ...query, total: rows.length, list: rows })));
  render(<App repository={repository} storageStatus={status} catalogLoader={catalogLoader} />);
  await waitFor(() => expect(screen.queryByText('正在读取本地记录…')).toBeNull());
  return repository;
}
async function read(repository: Repository) { const result = await repository.read(); if (!result.ok) throw new Error(result.error.message); return result.value; }

describe('complete numeric setting entry before committing', () => {
  it('accepts both digits and applies the explicit people/count pair atomically during a slow save', async () => {
    const repository = await setup(), original = repository.commit.bind(repository);
    let finish!: () => Promise<void>;
    vi.spyOn(repository, 'commit').mockImplementationOnce((command, revision, id) => new Promise(resolve => { finish = async () => resolve(await original(command, revision, id)); }));
    const user = userEvent.setup(), people = screen.getByLabelText('用餐人数'), count = screen.getByLabelText('菜数');
    await user.clear(people); await user.type(people, '12');
    expect(people).toHaveProperty('value', '12'); expect(people).toHaveProperty('disabled', false);
    await user.clear(count); await user.type(count, '12');
    expect(count).toHaveProperty('value', '12'); expect((await read(repository)).meta.revision).toBe(0);
    await user.click(screen.getByRole('button', { name: '应用人数和菜数' }));
    expect(people).toHaveProperty('value', '12'); expect(count).toHaveProperty('value', '12');
    expect(people).toHaveProperty('disabled', true);
    await act(async () => { await finish(); });
    await screen.findByText('设置和草稿已保存');
    const data = await read(repository);
    expect(data.draft).toMatchObject({ servings: 12, countsConfirmed: false });
    expect(data.draft!.slots).toHaveLength(12); expect(data.preferences.slots).toHaveLength(12);
  });
  it.each(['', '0', '51', '1.5'])('keeps invalid people input "%s" separate from the saved settings', async value => {
    const repository = await setup(); fireEvent.change(screen.getByLabelText('用餐人数'), { target: { value } });
    expect(screen.getByRole('button', { name: '应用人数和菜数' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '生成本餐菜单' })).toHaveProperty('disabled', true);
    expect((await read(repository)).preferences.servings).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: '撤销人数和菜数修改' }));
    expect(screen.getByLabelText('用餐人数')).toHaveProperty('value', '2');
  });
  it('blocks generation while valid numbers are unapplied and uses the applied combination afterwards', async () => {
    const repository = await setup(); fireEvent.change(screen.getByLabelText('用餐人数'), { target: { value: '3' } });
    expect(screen.getByRole('button', { name: '生成本餐菜单' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: '生成本餐菜单' })); expect((await read(repository)).draft).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '应用人数和菜数' })); await screen.findByText('设置和草稿已保存');
    expect(screen.getByLabelText('菜数')).toHaveProperty('value', '3');
    fireEvent.click(screen.getByRole('button', { name: '生成本餐菜单' })); await screen.findByText('菜单已生成并保存');
    const data = await read(repository); expect(data.draft!.servings).toBe(3); expect(data.draft!.dishes).toHaveLength(3);
  });
  it('preserves staged numeric input across an explicit conflict review and saves it after keeping local edits', async () => {
    const repository = await setup(); fireEvent.change(screen.getByLabelText('用餐人数'), { target: { value: '12' } });
    await act(async () => { await repository.commit({ type: 'savePreferences', preferences: { ...(await read(repository)).preferences, servings: 5 } }, 0, 'other-tab'); });
    fireEvent.click(screen.getByRole('button', { name: '查看最新内容' })); await screen.findByRole('button', { name: '保留当前编辑并继续' });
    expect(screen.getByLabelText('用餐人数')).toHaveProperty('value', '12');
    fireEvent.click(screen.getByRole('button', { name: '保留当前编辑并继续' }));
    fireEvent.click(screen.getByRole('button', { name: '应用人数和菜数' })); await screen.findByText('设置和草稿已保存');
    expect((await read(repository)).preferences.servings).toBe(12);
  });
  it('discards staged numbers only when the user explicitly adopts the latest settings', async () => {
    const repository = await setup(); fireEvent.change(screen.getByLabelText('用餐人数'), { target: { value: '12' } });
    await act(async () => { await repository.commit({ type: 'savePreferences', preferences: { ...(await read(repository)).preferences, servings: 5 } }, 0, 'latest-tab'); });
    fireEvent.click(screen.getByRole('button', { name: '查看最新内容' })); await screen.findByRole('button', { name: '采用最新草稿' });
    fireEvent.click(screen.getByRole('button', { name: '采用最新草稿' }));
    await waitFor(() => expect(screen.getByLabelText('用餐人数')).toHaveProperty('value', '5'));
    expect(screen.getByRole('button', { name: '应用人数和菜数' })).toHaveProperty('disabled', true);
    expect((await read(repository)).meta.revision).toBe(1);
  });
});
