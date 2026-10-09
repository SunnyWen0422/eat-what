// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/ui/App.tsx';
import { openRepository, type Repository } from '../src/data/repository.ts';
import { snapshotRecipe } from '../src/domain/snapshots.ts';
import type { Catalog, Result } from '../src/domain/types.ts';
import { recipe } from './fixtures.ts';

const status = { readable: true, writable: true, origin: 'https://test.invalid', estimate: null, persisted: null, error: null };
const vegetables = recipe({ name: '清炒青菜', source: { url: 'https://source.example/recipe', commit: null, license: null } });
const meat = recipe({ recipeId: 'eatwhat-db:2', familyId: 'eatwhat-db:2', name: '红烧鸡肉', types: ['meat'], ingredients: [{ ...vegetables.ingredients[0]!, raw: '鸡肉一份' }], source: { url: null, commit: null, license: null } });
const source = { origin: 'online-provider', version: null, recipes: [vegetables, meat], aliases: {}, recipeAliases: {}, availability: {} } as Catalog;
const repos: Repository[] = [];
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); history.replaceState(null, '', '/'); });
afterEach(() => { cleanup(); repos.splice(0).forEach(repo => repo.close()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function setup(loader: () => Promise<Result<Catalog>> = async () => ({ ok: true, value: source })) {
  let id = 0;
  const opened = await openRepository({ factory: new IDBFactory(), now: () => new Date(), uuid: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}` });
  if (!opened.ok) throw new Error(opened.error.message);
  repos.push(opened.value);
  render(<App repository={opened.value} storageStatus={status} catalogLoader={loader} />);
  await waitFor(() => expect(screen.queryByText('正在读取本地记录…')).toBeNull());
  return opened.value;
}
async function tab(label: string) { fireEvent.click(screen.getByRole('button', { name: label })); }
async function select() { await tab('菜谱'); fireEvent.click(await screen.findByRole('button', { name: '手选 清炒青菜' })); await screen.findByText('草稿已保存'); await tab('今天吃什么'); }

describe('workspace navigation and action hierarchy', () => {
  it('uses exactly four navigation entries, explicit first-use privacy copy and accurate defaults', async () => {
    await setup();
    expect(within(screen.getByRole('navigation', { name: '主导航' })).getAllByRole('button').map(button => button.textContent)).toEqual(['今天吃什么', '菜谱', '日历', '我的']);
    expect(screen.getByText('无需登录。记录保存在当前浏览器，建议定期导出备份。')).not.toBeNull();
    expect(screen.getByText('筛选依据已知食材信息，无法保证过敏安全。请核对原料、调味料及交叉接触风险。')).not.toBeNull();
    expect(screen.getByLabelText('用餐人数')).toHaveProperty('value', '2');
    expect(screen.getByLabelText('草稿餐次')).toHaveProperty('value', 'dinner');
    expect(screen.getByLabelText('菜数')).toHaveProperty('value', '2');
    expect(screen.getByRole('button', { name: '生成本餐菜单' }).classList.contains('primary')).toBe(true);
  });
  it('changes the sole prominent action to calendar save after a selection; cancel changes no records', async () => {
    const repo = await setup(); await select();
    const primary = screen.getByRole('button', { name: '保存到日历' });
    expect(document.querySelectorAll('button.primary')).toHaveLength(1);
    expect(primary.classList.contains('primary')).toBe(true);
    expect(screen.getByRole('button', { name: '记录本餐实际饮食' }).classList.contains('primary')).toBe(false);
    const before = await repo.read(); primary.focus(); fireEvent.click(primary);
    const dialog = screen.getByRole('dialog', { name: '保存到日历' });
    expect(within(dialog).getByLabelText('计划日期')).toBe(document.activeElement);
    fireEvent.click(within(dialog).getByRole('button', { name: '取消保存计划' }));
    expect(await repo.read()).toEqual(before); expect(document.activeElement).toBe(primary);
  });
  it('keeps URLs restricted to fixed routes through navigation, filters and personal editing', async () => {
    await setup(); await tab('菜谱'); expect(location.hash).toBe('#/recipes');
    fireEvent.change(screen.getByLabelText('搜索名称或食材'), { target: { value: '私有忌口查询' } });
    expect(location.hash).toBe('#/recipes'); expect(location.search).toBe('');
    await tab('我的'); expect(location.hash).toBe('#/my');
    fireEvent.click(screen.getByRole('button', { name: '新建自定义菜谱' }));
    fireEvent.change(screen.getByLabelText('自定义菜名'), { target: { value: '个人菜名' } });
    expect(location.hash).toBe('#/my'); expect(location.href).not.toContain('个人菜名');
  });
  it('loads fixed routes and responds to back navigation without storing personal fields', async () => {
    history.replaceState(null, '', '/#/calendar'); await setup();
    // setup resets no history; the fixed hash selects the corresponding page.
    expect(screen.getByRole('heading', { name: '日历' })).not.toBeNull();
    await act(async () => { history.replaceState(null, '', '/#/recipes'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(screen.getByRole('heading', { name: '菜谱' })).not.toBeNull();
  });
  it('exposes skip navigation and announces committed save state with a polite atomic live region', async () => {
    await setup(); expect(screen.getByRole('link', { name: '跳到主要内容' })).not.toBeNull(); await select();
    const statusNode = screen.getByText('草稿已保存');
    expect(statusNode.getAttribute('role')).toBe('status'); expect(statusNode.getAttribute('aria-live')).toBe('polite'); expect(statusNode.getAttribute('aria-atomic')).toBe('true');
  });
});

describe('local recipe discovery and truthful detail', () => {
  it('filters by name, ingredient and category locally with recoverable empty results', async () => {
    await setup(); await tab('菜谱'); const input = screen.getByLabelText('搜索名称或食材');
    fireEvent.change(input, { target: { value: '鸡肉' } }); expect(screen.queryByRole('button', { name: '手选 清炒青菜' })).toBeNull(); expect(screen.getByRole('button', { name: '手选 红烧鸡肉' })).not.toBeNull();
    fireEvent.change(input, { target: { value: '100g' } }); expect(screen.getByRole('button', { name: '手选 清炒青菜' })).not.toBeNull();
    fireEvent.change(input, { target: { value: '' } }); fireEvent.change(screen.getByLabelText('菜谱分类'), { target: { value: 'meat' } }); expect(screen.queryByRole('button', { name: '手选 清炒青菜' })).toBeNull();
    fireEvent.change(input, { target: { value: '不存在的内容' } }); expect(screen.getByText('没有匹配的菜谱，试试调整筛选。')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' })); expect(screen.getAllByRole('button', { name: /^手选 / })).toHaveLength(2);
  });
  it('filters current catalog favorites without replacing their immutable saved snapshots', async () => {
    const repo = await setup(); await act(async () => { await repo.commit({ type: 'saveFavorite', snapshot: snapshotRecipe(meat) }, 0, 'seed-favorite'); });
    fireEvent.click(screen.getByRole('button', { name: '查看最新内容' })); await screen.findByRole('button', { name: '保留当前编辑并继续' }); fireEvent.click(screen.getByRole('button', { name: '保留当前编辑并继续' }));
    await tab('菜谱'); fireEvent.click(screen.getByLabelText('仅看收藏')); expect(screen.getAllByRole('button', { name: /^手选 / })).toHaveLength(1); expect(screen.getByRole('button', { name: '手选 红烧鸡肉' })).not.toBeNull();
  });
  it('opens safe HTTPS sources only on user activation and shows原文, steps and unknown provenance', async () => {
    await setup(); await tab('菜谱'); fireEvent.click(screen.getByRole('button', { name: '查看详情 清炒青菜' }));
    const dialog = screen.getByRole('dialog', { name: '清炒青菜' });
    expect(within(dialog).getByText('青菜 100g')).not.toBeNull(); expect(within(dialog).getByText('青菜洗净，煮熟。')).not.toBeNull(); expect(within(dialog).getByText(/许可：未知/)).not.toBeNull(); expect(within(dialog).getByText(/无法保证过敏安全/)).not.toBeNull();
    const link = within(dialog).getByRole('link', { name: 'https://source.example/recipe' }); expect(link.getAttribute('target')).toBe('_blank'); expect(link.getAttribute('rel')).toBe('noopener noreferrer'); expect(link.getAttribute('referrerpolicy')).toBe('no-referrer');
  });
  it('renders potentially executable or remote-media text as text, never as fetched assets', async () => {
    const unsafe = recipe({ name: '<img src=x onerror=alert(1)>', steps: ['<script>bad()</script>'], source: { url: 'javascript:alert(1)', commit: null, license: null } });
    await setup(async () => ({ ok: true, value: { ...source, recipes: [unsafe] } })); await tab('菜谱'); fireEvent.click(screen.getByRole('button', { name: `查看详情 ${unsafe.name}` }));
    expect(screen.queryByRole('link', { name: unsafe.source.url! })).toBeNull(); expect(screen.getByText('<script>bad()</script>')).not.toBeNull(); expect(document.querySelector('img[src="x"]')).toBeNull();
  });
  it('shows online-only retry and manual personal paths, without fabricated inventory', async () => {
    const loader = vi.fn<() => Promise<Result<Catalog>>>().mockResolvedValueOnce({ ok: false, error: { code: 'CATALOG', message: 'corrupt directory' } }).mockResolvedValue({ ok: true, value: source });
    await setup(loader); await tab('菜谱'); fireEvent.click(screen.getByRole('button', { name: '重试在线菜谱' })); expect(await screen.findByRole('button', { name: '手选 清炒青菜' })).not.toBeNull(); expect(screen.getByText(/已读取 2 道在线菜谱/)).not.toBeNull();
  });
});

describe('dialog keyboard and pending boundaries', () => {
  it.each([false, true])('keeps pending inherited-disabled controls out of forward/reverse Tab order (reverse=$0) and recovers after failure', async reverse => {
    const repo = await setup(); await tab('我的'); const opener = screen.getByRole('button', { name: '新建自定义菜谱' }); const user = userEvent.setup();
    await user.click(opener); fireEvent.change(screen.getByLabelText('自定义菜名'), { target: { value: '失败后保留的菜名' } });
    const before = await repo.read(); let finish: (() => void) | undefined;
    vi.spyOn(repo, 'commit').mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ ok: false, error: { code: 'QUOTA', message: 'full' } }); }));
    try {
      const dialog = screen.getByRole('dialog', { name: '新建自定义菜谱' }); await user.click(within(dialog).getByRole('button', { name: '保存自定义菜谱' }));
      expect(dialog.getAttribute('aria-busy')).toBe('true');
      const categoryControls = within(dialog).getAllByRole('checkbox'); expect(categoryControls).toHaveLength(5); expect(categoryControls.every(control => control.matches(':disabled'))).toBe(true);
      await user.tab({ shift: reverse }); expect(document.activeElement).toBe(dialog);
      await user.tab({ shift: !reverse }); expect(document.activeElement).toBe(dialog);
      await user.keyboard('{Escape}'); expect(screen.getByRole('dialog')).toBe(dialog);
      await act(async () => { finish!(); }); finish = undefined;
      expect(within(dialog).getByLabelText('自定义菜名')).toHaveProperty('value', '失败后保留的菜名'); expect(within(dialog).getByText(/存储空间不足/)).not.toBeNull();
      await user.tab(); expect(document.activeElement).toBe(within(dialog).getByLabelText('自定义菜名'));
      await user.tab({ shift: true }); expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '取消自定义编辑' }));
      await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(opener); expect(await repo.read()).toEqual(before);
    } finally { if (finish) await act(async () => { finish!(); }); }
  });
  it('keeps explicit conflict review and exact failure retry reachable inside plan confirmation', async () => {
    const repo = await setup(); await select(); fireEvent.click(screen.getByRole('button', { name: '保存到日历' }));
    const dialog = screen.getByRole('dialog', { name: '保存到日历' });
    await act(async () => { await repo.commit({ type: 'saveFavorite', snapshot: snapshotRecipe(meat) }, 1, 'other-tab'); });
    expect(within(dialog).getByRole('button', { name: '保存计划' })).toHaveProperty('disabled', true);
    fireEvent.click(within(dialog).getByRole('button', { name: '查看最新内容' }));
    await within(dialog).findByRole('button', { name: '保留当前编辑并继续' }); fireEvent.click(within(dialog).getByRole('button', { name: '保留当前编辑并继续' }));
    vi.spyOn(repo, 'commit').mockResolvedValueOnce({ ok: false, error: { code: 'QUOTA', message: 'full' } }); fireEvent.click(within(dialog).getByRole('button', { name: '保存计划' })); await within(dialog).findByText(/存储空间不足/);
    expect(within(dialog).getByRole('button', { name: '重试保存当前编辑' })).not.toBeNull();
  });
  it('keeps plan-save pending and failure feedback in the active dialog for assistive technology', async () => {
    const repo = await setup(); await select(); const original = repo.commit.bind(repo); let finish!: () => void;
    vi.spyOn(repo, 'commit').mockImplementation((command, revision, id) => command.type === 'savePlan' ? new Promise(resolve => { finish = () => resolve({ ok: false, error: { code: 'QUOTA', message: 'full' } }); }) : original(command, revision, id));
    fireEvent.click(screen.getByRole('button', { name: '保存到日历' })); fireEvent.click(screen.getByRole('button', { name: '保存计划' }));
    const dialog = screen.getByRole('dialog', { name: '保存到日历' });
    expect(within(dialog).getByText('正在保存计划…').getAttribute('aria-live')).toBe('polite');
    fireEvent.keyDown(dialog, { key: 'Escape' }); expect(screen.getByRole('dialog')).not.toBeNull();
    await act(async () => { finish(); }); expect(within(dialog).getByText(/存储空间不足/).getAttribute('role')).toBe('alert');
    expect(within(dialog).getByLabelText('计划日期')).not.toBeNull();
  });
  it('traps tab in the dialog, supports Escape, and restores focus with zero cancellation writes', async () => {
    const repo = await setup(); await tab('我的'); const opener = screen.getByRole('button', { name: '新建自定义菜谱' }); opener.focus(); fireEvent.click(opener); const before = await repo.read();
    const dialog = screen.getByRole('dialog', { name: '新建自定义菜谱' }); expect(document.activeElement).toBe(within(dialog).getByLabelText('自定义菜名'));
    expect(screen.getByRole('main').closest('[inert]')).not.toBeNull();
    const last = within(dialog).getByRole('button', { name: '取消自定义编辑' }); last.focus(); await userEvent.setup().tab(); expect(document.activeElement).toBe(within(dialog).getByLabelText('自定义菜名'));
    await userEvent.setup().keyboard('{Escape}'); expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(opener); expect(screen.getByRole('main').closest('[inert]')).toBeNull(); expect(await repo.read()).toEqual(before);
  });
  it('cannot dismiss a pending editor and retains failure inputs for the existing exact retry', async () => {
    const repo = await setup(); const original = repo.commit.bind(repo); let reject!: () => void;
    vi.spyOn(repo, 'commit').mockImplementationOnce(() => new Promise(resolve => { reject = () => resolve({ ok: false, error: { code: 'QUOTA', message: 'full' } }); }));
    await tab('我的'); fireEvent.click(screen.getByRole('button', { name: '新建自定义菜谱' })); fireEvent.change(screen.getByLabelText('自定义菜名'), { target: { value: '保留此菜名' } }); fireEvent.click(screen.getByRole('button', { name: '保存自定义菜谱' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }); expect(screen.getByRole('dialog')).not.toBeNull(); expect(screen.getByRole('button', { name: '取消自定义编辑' })).toHaveProperty('disabled', true);
    await act(async () => { reject(); }); expect(await screen.findByText(/存储空间不足/)).not.toBeNull(); expect(screen.getByLabelText('自定义菜名')).toHaveProperty('value', '保留此菜名');
    vi.spyOn(repo, 'commit').mockImplementation(original); fireEvent.click(screen.getByRole('button', { name: '保存自定义菜谱' })); await screen.findByText('自定义菜谱已保存'); expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('discard uses an explicit dialog; Escape retains the menu and restores its trigger', async () => {
    const repo = await setup(); await select(); const before = await repo.read(); const trigger = screen.getByRole('button', { name: '放弃当前菜单' }); trigger.focus(); fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog', { name: '放弃当前菜单' }), { key: 'Escape' }); expect(await repo.read()).toEqual(before); expect(document.activeElement).toBe(trigger);
  });
  it('clear confirmation accurately points to available backup management', async () => {
    await setup(); await tab('我的'); fireEvent.click(screen.getByRole('button', { name: '清空本应用全部数据' }));
    expect(screen.getByRole('dialog', { name: '清空本应用全部数据' })).not.toBeNull(); expect(screen.queryByText(/备份管理尚未提供/)).toBeNull(); expect(screen.getByText(/请先在数据管理导出备份/)).not.toBeNull();
  });
});
