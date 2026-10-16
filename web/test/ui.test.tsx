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
  it('browser only boundary remains explicit at relevant entry', async () => {
    await setup(); await tab('我的'); expect(screen.getByText('个人备份仅恢复到当前浏览器，不与微信账号同步。')).not.toBeNull();
    expect(screen.getByRole('button', { name: '导出已保存个人备份' })).not.toBeNull();
    expect(screen.queryByText('已经同步微信')).toBeNull();
  });
  it('return preserves filters and calendar target', async () => {
    await setup(); await tab('菜谱');
    fireEvent.change(screen.getByLabelText('搜索名称或食材'), { target: { value: '青菜' } });
    fireEvent.change(screen.getByLabelText('菜谱分类'), { target: { value: 'vegetable' } });
    fireEvent.click(screen.getByRole('button', { name: '查看详情 清炒青菜' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭菜谱详情' }));
    fireEvent.click(screen.getByLabelText('仅看收藏'));
    await tab('日历'); fireEvent.change(screen.getByLabelText('查看日期'), { target: { value: '2026-09-11' } });
    fireEvent.click(screen.getByRole('button', { name: '月选日' }));
    fireEvent.change(screen.getByLabelText('选择月份'), { target: { value: '2026-08' } });
    await tab('菜谱');
    expect(screen.getByLabelText('搜索名称或食材')).toHaveProperty('value', '青菜');
    expect(screen.getByLabelText('菜谱分类')).toHaveProperty('value', 'vegetable');
    expect(screen.getByLabelText('仅看收藏')).toHaveProperty('checked', true);
    await tab('日历'); expect(screen.getByLabelText('查看日期')).toHaveProperty('value', '2026-09-11');
    expect(screen.getByLabelText('选择月份')).toHaveProperty('value', '2026-08');
  });
  it('save readback rejection clears busy without duplicate write', async () => {
    const repo = await setup(); await select();
    const commit = vi.spyOn(repo, 'commit');
    vi.spyOn(repo, 'read').mockRejectedValueOnce(new Error('read failed'));
    fireEvent.click(screen.getByRole('button', { name: '保存到日历' }));
    fireEvent.click(screen.getByRole('button', { name: /^保存计划$/ }));
    await screen.findByRole('button', { name: '重新读取已保存记录' });
    expect(screen.getByRole('button', { name: '重新读取已保存记录' })).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('button', { name: '重新读取已保存记录' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '重新读取已保存记录' })).toBeNull());
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]![2]).toBeTruthy();
    const result = await repo.read(); if (result.ok) expect(result.value.plans).toHaveLength(1);
  });
  it('uncertain save retries the original command and requestId', async () => {
    const repo = await setup(); const original = repo.commit.bind(repo);
    const commit = vi.spyOn(repo, 'commit').mockImplementationOnce(async (...args) => { await original(...args); throw new Error('receipt lost'); });
    await tab('菜谱'); fireEvent.click(screen.getByRole('button', { name: '手选 清炒青菜' }));
    const retry = await screen.findByRole('button', { name: '重试保存当前编辑' });
    expect(retry).toHaveProperty('disabled', false); fireEvent.click(retry);
    await screen.findByText('草稿已保存');
    expect(commit).toHaveBeenCalledTimes(2); expect(commit.mock.calls[1]).toEqual(commit.mock.calls[0]);
    const result = await repo.read(); if (result.ok) { expect(result.value.meta.revision).toBe(1); expect(result.value.draft?.dishes).toHaveLength(1); }
  });
  it.each(['failed', 'unknown committed'] as const)('independent readback recovery retains the %s App command and requestId', async outcome => {
    const repo = await setup(); const original = repo.commit.bind(repo);
    let first = true;
    const commit = vi.spyOn(repo, 'commit').mockImplementation(async (...args) => {
      if (args[0].type === 'saveDraft' && first) {
        first = false;
        if (outcome === 'failed') return { ok: false, error: { code: 'QUOTA', message: 'full' } };
        await original(...args); throw new Error('acknowledgement lost after commit');
      }
      return original(...args);
    });
    await tab('菜谱'); fireEvent.click(screen.getByRole('button', { name: '手选 清炒青菜' }));
    await screen.findByRole('button', { name: '重试保存当前编辑' });
    expect(screen.queryByText('草稿已保存')).toBeNull();
    await tab('我的'); fireEvent.click(screen.getByRole('button', { name: '新建自定义菜谱' }));
    fireEvent.change(screen.getByLabelText('自定义菜名'), { target: { value: '独立保存的菜' } });
    if (outcome === 'unknown committed') {
      // The independent editor explicitly reviews the committed draft's newer revision.
      fireEvent.click(screen.getByRole('button', { name: '保存自定义菜谱' }));
      await screen.findByText('另一个页面有更新，输入已保留。');
      fireEvent.click(screen.getByRole('button', { name: '查看此表单的最新记录' }));
      fireEvent.click(await screen.findByRole('button', { name: '保留此表单编辑并继续' }));
    }
    const stale = await repo.read(); let began!: () => void;
    const reading = new Promise<void>(resolve => { began = resolve; });
    let finish: ((result: Awaited<ReturnType<Repository['read']>>) => void) | undefined;
    if (outcome === 'failed') vi.spyOn(repo, 'read').mockRejectedValueOnce(new Error('independent readback rejected'));
    else vi.spyOn(repo, 'read').mockImplementationOnce(() => { vi.useFakeTimers(); began(); return new Promise(resolve => { finish = resolve; }); });
    try {
      fireEvent.click(screen.getByRole('button', { name: '保存自定义菜谱' }));
      if (outcome === 'unknown committed') {
        await act(async () => { await reading; });
        await act(async () => { await vi.advanceTimersByTimeAsync(15001); }); vi.useRealTimers();
      }
      const reread = await screen.findByRole('button', { name: '重新读取已保存记录' });
      expect(reread).toHaveProperty('disabled', false);
      expect(screen.getByText('自定义菜谱已保存')).not.toBeNull();
      expect(screen.queryByRole('dialog', { name: '新建自定义菜谱' })).toBeNull();
      fireEvent.click(reread);
      await waitFor(() => expect(screen.queryByRole('button', { name: '重新读取已保存记录' })).toBeNull());
      const retry = screen.getByRole('button', { name: '重试保存当前编辑' });
      expect(retry).toHaveProperty('disabled', false);
      expect(commit.mock.calls.filter(([command]) => command.type === 'saveCustomRecipe' && command.recipe.name === '独立保存的菜')).toHaveLength(outcome === 'failed' ? 1 : 2);
      if (finish) await act(async () => { finish!(stale); });
      expect(screen.getByRole('button', { name: '手选 独立保存的菜' })).not.toBeNull();
      expect(screen.queryByText('草稿已保存')).toBeNull();
      fireEvent.click(retry); await screen.findByText('草稿已保存');
      const drafts = commit.mock.calls.filter(([command]) => command.type === 'saveDraft');
      expect(drafts).toHaveLength(2); expect(drafts[1]![0]).toEqual(drafts[0]![0]); expect(drafts[1]![2]).toBe(drafts[0]![2]);
      const result = await repo.read(); expect(result.ok).toBe(true);
      if (result.ok) { expect(result.value.customRecipes).toHaveLength(1); expect(result.value.draft?.dishes).toHaveLength(1); expect(result.value.meta.revision).toBe(2); }
    } finally { vi.useRealTimers(); }
  });
  it('a late presentation recovery cannot clear a newer unconfirmed App request', async () => {
    const repo = await setup(); await select(); const originalRead = repo.read.bind(repo);
    const read = vi.spyOn(repo, 'read').mockRejectedValueOnce(new Error('plan readback rejected'));
    fireEvent.click(screen.getByRole('button', { name: '保存到日历' }));
    fireEvent.click(screen.getByRole('button', { name: /^保存计划$/ }));
    const reread = await screen.findByRole('button', { name: '重新读取已保存记录' });
    const oldData = await originalRead(); let finish!: (result: Awaited<ReturnType<Repository['read']>>) => void;
    read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(reread); // This recovery remains pending while the second one succeeds.
    fireEvent.click(reread);
    await waitFor(() => expect(screen.queryByRole('button', { name: '重新读取已保存记录' })).toBeNull());
    const commit = vi.spyOn(repo, 'commit').mockRejectedValueOnce(new Error('new settings result unknown'));
    fireEvent.change(screen.getByLabelText('用餐人数'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '应用人数和菜数' }));
    await screen.findByRole('button', { name: '重试保存当前编辑' });
    await act(async () => { finish(oldData); });
    const retry = screen.getByRole('button', { name: '重试保存当前编辑' }); expect(retry).toHaveProperty('disabled', false);
    fireEvent.click(retry); await screen.findByText('设置和草稿已保存');
    expect(commit).toHaveBeenCalledTimes(2); expect(commit.mock.calls[1]![0]).toEqual(commit.mock.calls[0]![0]); expect(commit.mock.calls[1]![2]).toBe(commit.mock.calls[0]![2]);
    const latest = await originalRead(); if (latest.ok) { expect(latest.value.plans).toHaveLength(1); expect(latest.value.preferences.servings).toBe(3); }
  });
  it('a timed out readback releases busy and late data cannot replace recovered records', async () => {
    const repo = await setup(); await select(); const before = await repo.read();
    const commit = vi.spyOn(repo, 'commit');
    let began!: () => void; const reading = new Promise<void>(resolve => { began = resolve; });
    let finish!: (result: Awaited<ReturnType<Repository['read']>>) => void;
    vi.spyOn(repo, 'read').mockImplementationOnce(() => { vi.useFakeTimers(); began(); return new Promise(resolve => { finish = resolve; }); });
    try {
      fireEvent.click(screen.getByRole('button', { name: '保存到日历' }));
      fireEvent.click(screen.getByRole('button', { name: /^保存计划$/ }));
      await act(async () => { await reading; });
      await act(async () => { await vi.advanceTimersByTimeAsync(15001); });
      const reread = screen.getByRole('button', { name: '重新读取已保存记录' }); expect(reread).toHaveProperty('disabled', false);
      vi.useRealTimers(); fireEvent.click(reread);
      await waitFor(() => expect(screen.queryByRole('button', { name: '重新读取已保存记录' })).toBeNull());
      await act(async () => { finish(before); }); await tab('日历');
      expect(screen.getByText('清炒青菜')).not.toBeNull(); expect(commit).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('refresh abort preserves last complete catalog and ignores obsolete generation', async () => {
    const repo = await setup(); cleanup();
    const first = async () => ({ ok: true as const, value: source });
    const view = render(<App repository={repo} storageStatus={status} catalogLoader={first} />);
    await tab('菜谱'); await screen.findByRole('button', { name: '手选 清炒青菜' });
    let complete!: (result: Result<Catalog>) => void; let signal: AbortSignal | undefined;
    const slow = (options?: import('../src/domain/types.ts').CatalogLoadOptions) => { signal = options?.signal; return new Promise<Result<Catalog>>(resolve => { complete = resolve; }); };
    vi.useFakeTimers();
    try {
      view.rerender(<App repository={repo} storageStatus={status} catalogLoader={slow} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(20001); });
      expect(signal?.aborted).toBe(true); expect(screen.getByRole('button', { name: '手选 清炒青菜' })).not.toBeNull();
      expect(screen.getByText('刷新未完成，继续使用上次完整菜库。')).not.toBeNull();
      const latest = async () => ({ ok: true as const, value: { ...source, recipes: [meat] } });
      await act(async () => { view.rerender(<App repository={repo} storageStatus={status} catalogLoader={latest} />); });
      await act(async () => { complete({ ok: true, value: source }); });
      expect(screen.queryByRole('button', { name: '手选 清炒青菜' })).toBeNull();
      expect(screen.getByRole('button', { name: '手选 红烧鸡肉' })).not.toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it('uses exactly four navigation entries, explicit first-use privacy copy and accurate defaults', async () => {
    await setup();
    expect(within(screen.getByRole('navigation', { name: '主导航' })).getAllByRole('button').map(button => button.textContent)).toEqual(['今天吃什么', '菜谱', '日历', '我的']);
    expect(screen.getByText('记录保存在当前浏览器')).not.toBeNull();
    expect(screen.getByText('有忌口时，请核对完整配料与交叉接触风险。')).not.toBeNull();
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
    await setup(loader); await tab('菜谱'); fireEvent.click(screen.getByRole('button', { name: '重试在线菜谱' })); expect(await screen.findByRole('button', { name: '手选 清炒青菜' })).not.toBeNull(); expect(screen.getByText(/^2 道菜$/)).not.toBeNull();
  });
});

describe('dialog keyboard and pending boundaries', () => {
  it.each(['Escape', 'button'])('dirty form owns exactly one decision per close request (%s)', async kind => {
    const repo = await setup(); await tab('我的'); fireEvent.click(screen.getByRole('button', { name: '新建自定义菜谱' }));
    fireEvent.change(screen.getByLabelText('自定义菜名'), { target: { value: '未保存菜名' } });
    const before = await repo.read(); const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const close = () => kind === 'Escape' ? fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }) : fireEvent.click(screen.getByRole('button', { name: '取消自定义编辑' }));
    close(); expect(confirm).toHaveBeenCalledTimes(1); expect(screen.getByLabelText('自定义菜名')).toHaveProperty('value', '未保存菜名');
    close(); expect(confirm).toHaveBeenCalledTimes(2); expect(screen.queryByRole('dialog')).toBeNull(); expect(await repo.read()).toEqual(before);
  });
  it('independent editor uses the original request after a lost commit acknowledgement', async () => {
    const repo = await setup(); await tab('我的'); fireEvent.click(screen.getByRole('button', { name: '新建自定义菜谱' }));
    fireEvent.change(screen.getByLabelText('自定义菜名'), { target: { value: '原请求菜名' } });
    const original = repo.commit.bind(repo);
    const commit = vi.spyOn(repo, 'commit').mockImplementationOnce(async (...args) => { await original(...args); throw new Error('receipt lost'); });
    fireEvent.click(screen.getByRole('button', { name: '保存自定义菜谱' })); await screen.findByText('保存结果未确认，请保留输入并用原请求重试。');
    expect(screen.getByRole('button', { name: '保存自定义菜谱' })).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('button', { name: '保存自定义菜谱' })); await screen.findByText('自定义菜谱已保存');
    expect(commit.mock.calls[1]).toEqual(commit.mock.calls[0]); const result = await repo.read(); if (result.ok) expect(result.value.customRecipes).toHaveLength(1);
  });
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
      const discard = vi.spyOn(window, 'confirm').mockReturnValue(true);
      await user.keyboard('{Escape}'); expect(discard).toHaveBeenCalledTimes(1); expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(opener); expect(await repo.read()).toEqual(before);
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
