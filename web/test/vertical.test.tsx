// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/ui/App.tsx';
import type { Repository, CommitReceipt } from '../src/data/repository.ts';
import type { Catalog, Result } from '../src/domain/types.ts';
import { personalData, recipe } from './fixtures.ts';

const catalog = { origin:'online-provider',version:null,recipes:[recipe()],aliases:{},recipeAliases:{},availability:{} } as Catalog;
const status = { readable: true, writable: true, origin:'https://test.invalid',estimate:null,persisted:null,error:null };
const makeRepo = (commit:Repository['commit']):Repository => ({ read:async()=>({ok:true,value:personalData()}),commit,subscribe:()=>()=>{},close:()=>{},status:()=>({readable:true,writable:true,schemaVersion:1,reason:null}),readRawSnapshot:async()=>({ok:false,error:{code:'UNAVAILABLE',message:'not needed'}}) });
beforeEach(()=>{history.replaceState(null,'','/');});
afterEach(cleanup);
async function select() { fireEvent.click(await screen.findByRole('button',{name:'菜谱'})); fireEvent.click(await screen.findByRole('button',{name:'手选 测试青菜'})); }
describe('first page vertical flow',()=>{
  it('does not show success while a local transaction is pending',async()=>{
    let resolve!:(value:Result<CommitReceipt>)=>void; const repo=makeRepo(()=>new Promise(r=>{resolve=r}));
    render(<App repository={repo} catalogLoader={async()=>({ok:true,value:catalog})} storageStatus={status}/>); await select();
    expect(screen.getByText('正在保存草稿…')).not.toBeNull(); expect(screen.queryByText('草稿已保存')).toBeNull();
    resolve({ok:true,value:{globalRevision:1,objectId:'current',objectRevision:1,replayed:false}}); await waitFor(()=>expect(screen.getByText('草稿已保存')).not.toBeNull());
  });
  it('keeps the selected recipe and confirmation input after a failed save',async()=>{
    const commit=vi.fn<Repository['commit']>().mockResolvedValueOnce({ok:true,value:{globalRevision:1,objectId:'current',objectRevision:1,replayed:false}}).mockResolvedValue({ok:false,error:{code:'QUOTA',message:'Disk full'}});
    render(<App repository={makeRepo(commit)} catalogLoader={async()=>({ok:true,value:catalog})} storageStatus={status}/>); await select();
    fireEvent.click(await screen.findByRole('button',{name:'今天吃什么'})); fireEvent.click(await screen.findByRole('button',{name:'保存到日历'}));
    fireEvent.change(screen.getByLabelText('计划日期'),{target:{value:'2026-10-10'}}); fireEvent.click(screen.getByRole('button',{name:'保存计划'}));
    expect(await screen.findByText(/存储空间不足/)).not.toBeNull(); expect((screen.getByLabelText('计划日期') as HTMLInputElement).value).toBe('2026-10-10'); expect(screen.getByText('测试青菜')).not.toBeNull(); expect(screen.queryByText('计划已保存')).toBeNull();
  });
  it('allows temporary manual selection but disables saving when storage is unwritable',async()=>{
    const commit=vi.fn<Repository['commit']>();
    render(<App repository={makeRepo(commit)} catalogLoader={async()=>({ok:true,value:catalog})} storageStatus={{...status,writable:false}}/>); await select();
    expect(screen.getByText(/本次内容不会保存/)).not.toBeNull(); fireEvent.click(screen.getByRole('button',{name:'今天吃什么'}));
    expect(screen.getByText('测试青菜')).not.toBeNull(); expect((screen.getByRole('button',{name:'保存到日历'}) as HTMLButtonElement).disabled).toBe(true); expect(commit).not.toHaveBeenCalled();
  });
});

it('explains a blocked open and asks to close old tabs, without claiming persistence',async()=>{
  render(<App repository={null} catalogLoader={async()=>({ok:true,value:catalog})} storageStatus={{...status,writable:false,error:{code:'BLOCKED',message:'blocked'}}}/>);
  expect(await screen.findByText(/数据升级被旧页面阻塞/)).not.toBeNull(); expect(screen.queryByText('计划已保存')).toBeNull();
});

it('persists a real public DTO through normalization, manual choice and strict snapshots',async()=>{
  const { IDBFactory } = await import('fake-indexeddb'); const { webcrypto } = await import('node:crypto');
  const { openRepository } = await import('../src/data/repository.ts'); const { createPublicCatalogProvider, loadCatalog } = await import('../src/catalog/catalog.ts');
  vi.stubGlobal('crypto',webcrypto);
  const opened = await openRepository({factory:new IDBFactory(),now:()=>new Date('2026-10-09T00:00:00.000Z'),uuid:()=> '00000000-0000-4000-8000-000000000001'});
  if (!opened.ok) throw new Error(opened.error.message);
  const provider=createPublicCatalogProvider(async()=>({page:1,pageSize:100,total:1,list:[{id:910001,name:'接口测试菜',type:'veg',cl:'接口原料',steps:'接口步骤',contentVersion:'integration-test-only',quality:null}]}));
  try {
    render(<App repository={opened.value} catalogLoader={()=>loadCatalog(provider)} storageStatus={status}/>);
    fireEvent.click(await screen.findByRole('button',{name:'菜谱'})); const selection = await screen.findByRole('button',{name:'手选 接口测试菜'}); await waitFor(()=>expect((selection as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(selection);
    await screen.findByText('草稿已保存'); fireEvent.click(screen.getByRole('button',{name:'今天吃什么'})); fireEvent.click(screen.getByRole('button',{name:'保存到日历'}));
    fireEvent.click(screen.getByRole('button',{name:'保存计划'})); await screen.findByText('计划已保存');
    const read=await opened.value.read(); expect(read.ok).toBe(true); if(read.ok){expect(read.value.plans[0]?.snapshots[0]).toMatchObject({recipeId:'eatwhat-db:910001',contentVersion:'integration-test-only',source:{url:null,commit:null,license:null}});expect(read.value.plans[0]?.snapshots[0]).not.toHaveProperty('reviewStatus');expect(read.value.actualMeals).toEqual([]);}
  } finally {cleanup();opened.value.close();vi.unstubAllGlobals();}
});

it('waits for existing local records before allowing a new manual selection',async()=>{
  let resolve!:(value:Result<ReturnType<typeof personalData>>)=>void;
  const repo=makeRepo(vi.fn());repo.read=()=>new Promise(r=>{resolve=r});
  render(<App repository={repo} catalogLoader={async()=>({ok:true,value:catalog})} storageStatus={status}/>);
  fireEvent.click(await screen.findByRole('button',{name:'菜谱'})); const selectButton=await screen.findByRole('button',{name:'手选 测试青菜'});expect((selectButton as HTMLButtonElement).disabled).toBe(true);
  resolve({ok:true,value:personalData()});await waitFor(()=>expect((selectButton as HTMLButtonElement).disabled).toBe(false));
});

it('keeps failed local reads in temporary mode instead of enabling save controls',async()=>{
  const repo=makeRepo(async()=>({ok:false,error:{code:'INVALID',message:'corrupt local records'}}));repo.read=async()=>({ok:false,error:{code:'INVALID',message:'corrupt local records'}});
  render(<App repository={repo} catalogLoader={async()=>({ok:true,value:catalog})} storageStatus={status}/>);await select();
  fireEvent.click(screen.getByRole('button',{name:'今天吃什么'}));expect((screen.getByRole('button',{name:'保存到日历'}) as HTMLButtonElement).disabled).toBe(true);
});

describe('post-save concurrent draft protection', () => {
  const meatA = recipe({ recipeId: 'eatwhat-db:11', familyId: 'eatwhat-db:11', name: 'A荤菜', types: ['meat'] });
  const vegetableA = recipe({ recipeId: 'eatwhat-db:12', familyId: 'eatwhat-db:12', name: 'A素菜', types: ['vegetable'] });
  const meatB = recipe({ recipeId: 'eatwhat-db:13', familyId: 'eatwhat-db:13', name: 'B荤菜', types: ['meat'] });
  const raceCatalog = { ...catalog, recipes: [meatA, vegetableA] };
  async function exerciseRace(notifyRevision: number | null, postSaveRevision: number) {
    const { draft: makeDraft } = await import('./fixtures.ts');
    const { snapshotRecipe } = await import('../src/domain/snapshots.ts');
    const latest = personalData();
    latest.meta.revision = 2;
    latest.draft = makeDraft({ revision: 2, dishes: [{ slotId: 'meat-1', recipe: snapshotRecipe(meatB), locked: false }] });
    const postSave = structuredClone(latest);
    postSave.meta.revision = postSaveRevision;
    let listener: (revision: number) => void = () => {};
    let finish!: (result: Result<CommitReceipt>) => void;
    const commit = vi.fn<Repository['commit']>()
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValue({ ok: true, value: { globalRevision: 3, objectId: 'current', objectRevision: 3, replayed: false } });
    const repo = makeRepo(commit);
    repo.read = vi.fn<Repository['read']>()
      .mockResolvedValueOnce({ ok: true, value: personalData() })
      .mockResolvedValueOnce({ ok: true, value: postSave })
      .mockResolvedValue({ ok: true, value: latest });
    repo.subscribe = (next) => { listener = next; return () => {}; };
    render(<App repository={repo} catalogLoader={async () => ({ ok: true, value: raceCatalog })} storageStatus={status} />);
    fireEvent.click(await screen.findByRole('button', { name: '菜谱' }));
    const firstSelection = await screen.findByRole('button', { name: '手选 A荤菜' });
    await waitFor(() => expect((firstSelection as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(firstSelection);
    if (notifyRevision !== null) listener(notifyRevision);
    finish({ ok: true, value: { globalRevision: 1, objectId: 'current', objectRevision: 1, replayed: false } });
    await screen.findByText('草稿已保存');
    await screen.findByRole('button', { name: '查看最新内容' });
    fireEvent.click(screen.getByRole('button', { name: '手选 A素菜' }));
    expect(commit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '今天吃什么' }));
    expect(screen.getByText('A荤菜', { exact: true })).not.toBeNull();
    expect(screen.getByText('A素菜', { exact: true })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '查看最新内容' }));
    await screen.findByRole('button', { name: '采用最新草稿' });
    fireEvent.click(screen.getByRole('button', { name: '菜谱' }));
    fireEvent.click(screen.getByRole('button', { name: '手选 A素菜' }));
    expect(commit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '今天吃什么' }));
    return { commit, notify: (revision: number) => listener(revision) };
  }

  it.each([
    { name: 'pending notification and newer read', notification: 2, read: 2 },
    { name: 'newer read without BroadcastChannel notification', notification: null, read: 2 },
    { name: 'pending notification even if the separate read is older', notification: 2, read: 1 },
  ])('does not silently rebase old dishes after $name', async ({ notification, read }) => {
    const { commit } = await exerciseRace(notification, read);
    fireEvent.click(screen.getByRole('button', { name: '采用最新草稿' }));
    fireEvent.click(screen.getByRole('button', { name: '菜谱' }));
    fireEvent.click(screen.getByRole('button', { name: '手选 A素菜' }));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
    const [command, expectedRevision] = commit.mock.calls[1]!;
    expect(expectedRevision).toBe(2);
    if (command.type !== 'saveDraft') throw new Error('Expected draft command');
    expect(command.draft.dishes.map((dish) => dish.recipe.name)).toEqual(['B荤菜', 'A素菜']);
    await screen.findByText('草稿已保存');
  });

  it('rebases retained local input only after an explicit keep-editing decision', async () => {
    const { commit } = await exerciseRace(null, 2);
    fireEvent.click(screen.getByRole('button', { name: '保留当前编辑并继续' }));
    fireEvent.click(screen.getByRole('button', { name: '菜谱' }));
    fireEvent.click(screen.getByRole('button', { name: '手选 A素菜' }));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
    const [command, expectedRevision] = commit.mock.calls[1]!;
    expect(expectedRevision).toBe(2);
    if (command.type !== 'saveDraft') throw new Error('Expected draft command');
    expect(command.draft.dishes.map((dish) => dish.recipe.name)).toEqual(['A荤菜', 'A素菜']);
    await screen.findByText('草稿已保存');
  });
  it('requires a fresh review when another notification arrives before the explicit choice', async () => {
    const { commit, notify } = await exerciseRace(null, 2);
    const { act } = await import('@testing-library/react');
    act(() => notify(3));
    expect(screen.queryByRole('button', { name: '采用最新草稿' })).toBeNull();
    expect(screen.queryByRole('button', { name: '保留当前编辑并继续' })).toBeNull();
    expect(screen.getByText('A荤菜', { exact: true })).not.toBeNull();
    expect(commit).toHaveBeenCalledTimes(1);
  });

});

describe('local meal controls through the real repository', () => {
  async function mealSetup(options: { forged?: boolean; failSettings?: boolean; failSettingsOnce?: boolean; failDraftOnce?: boolean } = {}) {
    const { IDBFactory } = await import('fake-indexeddb'); const { webcrypto } = await import('node:crypto');
    const { openRepository } = await import('../src/data/repository.ts'); const { createPublicCatalogProvider, loadCatalog } = await import('../src/catalog/catalog.ts');
    vi.stubGlobal('crypto', webcrypto);
    const opened = await openRepository({ factory: new IDBFactory(), now: () => new Date('2026-10-09T00:00:00.000Z'), uuid: () => '00000000-0000-4000-8000-000000000001' });
    if (!opened.ok) throw new Error(opened.error.message);
    const rows = ['meat', 'veg'].flatMap((type, index) => [1, 2, 3, 4].map((n) => ({ id: 100 + index * 10 + n, name: `接口${type}${n}`, type, cl: '原料原文', steps: '测试步骤', contentVersion: 'test-only-generation', quality: { reviewStatus: 'VERIFIED', stepStatus: 'VERIFIED', ingredients: [{ name: '审核原料', rawText: '未知复合配料原文', identityStatus: 'VERIFIED' }] } })));
    const loaded = await loadCatalog(createPublicCatalogProvider(async () => ({ list: rows, total: rows.length, page: 1, pageSize: 100 })));
    if (!loaded.ok) throw new Error(loaded.error.message);
    const source = options.forged ? structuredClone(loaded.value) : loaded.value;
    let failedDraft = false;
    let failedSettings = false;
    const attempts: { command: Parameters<Repository['commit']>[0]; revision: number; requestId: string }[] = [];
    const repo = options.failSettings || options.failSettingsOnce || options.failDraftOnce ? {
      ...opened.value,
      commit: async (command: Parameters<Repository['commit']>[0], revision: number, requestId: string): ReturnType<Repository['commit']> => {
        attempts.push({ command: structuredClone(command), revision, requestId });
        if (command.type === 'saveSettings' && (options.failSettings || (options.failSettingsOnce && !failedSettings))) {
          failedSettings = true;
          return { ok: false, error: { code: 'QUOTA', message: 'full' } };
        }
        if (command.type === 'saveDraft' && options.failDraftOnce && !failedDraft) {
          failedDraft = true;
          return { ok: false, error: { code: 'QUOTA', message: 'full' } };
        }
        return opened.value.commit(command, revision, requestId);
      },
    } : opened.value;
    const view = render(<App repository={repo} catalogLoader={async () => ({ ok: true, value: source })} storageStatus={status} />);
    await waitFor(() => expect(screen.queryByText('正在读取本地记录…')).toBeNull());
    return { repo: opened.value, source, view, attempts, close: () => { cleanup(); opened.value.close(); vi.unstubAllGlobals(); } };
  }
  it('generates, locks and replaces locally, preserving every other slot and persisted snapshots', async () => {
    const test = await mealSetup(); try {
      fireEvent.click(screen.getByRole('button', { name: '生成本餐菜单' })); await screen.findByText('菜单已生成并保存');
      const first = await test.repo.read(); if (!first.ok || !first.value.draft) throw new Error('missing draft');
      const saved = first.value.draft;
      fireEvent.click(screen.getByRole('button', { name: `锁定 ${saved.dishes[1]!.recipe.name}` })); await screen.findByText('锁定状态已保存');
      fireEvent.click(screen.getByRole('button', { name: `换一道 ${saved.dishes[0]!.recipe.name}` })); await screen.findByText('换菜已保存');
      const next = await test.repo.read(); if (!next.ok || !next.value.draft) throw new Error('missing draft');
      expect(next.value.draft.dishes[0]?.recipe.familyId).not.toBe(saved.dishes[0]?.recipe.familyId); expect(next.value.draft.dishes[1]).toEqual({ ...saved.dishes[1], locked: true }); expect(next.value.actualMeals).toEqual([]);
    } finally { test.close(); }
  });
  it('does not accept a copied catalog as an automatic UI source, including replacement', async () => {
    const test = await mealSetup({ forged: true }); try {
      fireEvent.click(screen.getByRole('button', { name: '生成本餐菜单' })); expect(await screen.findByText(/在线目录尚未满足.*自动选择/)).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: '菜谱' })); fireEvent.click(await screen.findByRole('button', { name: '手选 接口meat1' })); await screen.findByText('草稿已保存');
      fireEvent.click(screen.getByRole('button', { name: '今天吃什么' })); fireEvent.click(screen.getByRole('button', { name: '换一道 接口meat1' })); expect(await screen.findByText(/在线目录尚未满足.*自动选择/)).not.toBeNull();
      const read = await test.repo.read(); if (!read.ok) throw new Error('read'); expect(read.value.draft?.dishes.map((d) => d.recipe.name)).toEqual(['接口meat1']);
    } finally { test.close(); }
  });
  it('restores saved settings and draft without regenerating; confirmed discard keeps preferences', async () => {
    const test = await mealSetup(); try {
      fireEvent.change(screen.getByLabelText('用餐人数'), { target: { value: '4' } }); fireEvent.click(screen.getByRole('button', { name: '应用人数和菜数' })); await screen.findByText('设置和草稿已保存');
      fireEvent.click(screen.getByRole('button', { name: '生成本餐菜单' })); await screen.findByText('菜单已生成并保存');
      const before = await test.repo.read(); if (!before.ok) throw new Error('read');
      test.view.unmount(); render(<App repository={test.repo} catalogLoader={async () => ({ ok: true, value: test.source })} storageStatus={status} />);
      await waitFor(() => expect((screen.getByLabelText('用餐人数') as HTMLInputElement).value).toBe('4')); expect(await test.repo.read()).toEqual(before);
      fireEvent.click(screen.getByRole('button', { name: '放弃当前菜单' })); expect(screen.getByRole('button', { name: '确认放弃菜单' })).not.toBeNull(); expect(await test.repo.read()).toEqual(before);
      fireEvent.click(screen.getByRole('button', { name: '确认放弃菜单' })); await screen.findByText('已放弃菜单，设置已保留');
      const after = await test.repo.read(); if (!after.ok) throw new Error('read'); expect(after.value.draft?.dishes).toEqual([]); expect(after.value.preferences.servings).toBe(4);
    } finally { test.close(); }
  });
  it('persists group confirmation, revokes it on a combination edit, and blocks generation and plan save', async () => {
    const test = await mealSetup(); try {
      fireEvent.change(screen.getByLabelText('用餐人数'), { target: { value: '9' } }); fireEvent.click(screen.getByRole('button', { name: '应用人数和菜数' })); await screen.findByText('设置和草稿已保存');
      fireEvent.click(screen.getByRole('button', { name: '生成本餐菜单' })); expect(await screen.findByText(/超过 8 人，请先确认/)).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: '确认人数和组合' })); await screen.findByText('人数和组合确认已保存');
      const confirmed = await test.repo.read(); if (!confirmed.ok) throw new Error('read'); expect(confirmed.value.draft?.countsConfirmed).toBe(true);
      fireEvent.change(screen.getByLabelText('菜数'), { target: { value: '3' } }); fireEvent.click(screen.getByRole('button', { name: '应用人数和菜数' })); await screen.findByText('设置和草稿已保存');
      const changed = await test.repo.read(); if (!changed.ok) throw new Error('read'); expect(changed.value.draft).toMatchObject({ servings: 9, countsConfirmed: false }); expect(changed.value.preferences.slots).toHaveLength(3);
      fireEvent.click(screen.getByRole('button', { name: '菜谱' })); fireEvent.click(await screen.findByRole('button', { name: '手选 接口meat1' })); await screen.findByText('草稿已保存');
      fireEvent.click(screen.getByRole('button', { name: '今天吃什么' })); expect((screen.getByRole('button', { name: '保存到日历' }) as HTMLButtonElement).disabled).toBe(true);
    } finally { test.close(); }
  });
  it('retains changed settings after an atomic save failure and suppresses success', async () => {
    const test = await mealSetup({ failSettings: true }); try {
      fireEvent.change(screen.getByLabelText('用餐人数'), { target: { value: '5' } }); fireEvent.click(screen.getByRole('button', { name: '应用人数和菜数' })); expect(await screen.findByText(/存储空间不足/)).not.toBeNull();
      expect((screen.getByLabelText('用餐人数') as HTMLInputElement).value).toBe('5'); expect(screen.queryByText('设置和草稿已保存')).toBeNull();
      const read = await test.repo.read(); if (!read.ok) throw new Error('read'); expect(read.value.preferences.servings).toBe(2); expect(read.value.draft).toBeNull();
    } finally { test.close(); }
  });
  it('shows unresolved exclusions, blocks automatic results, and explains exact unknown manual ingredients', async () => {
    const test = await mealSetup(); try {
      fireEvent.change(screen.getByLabelText('硬忌口，每行一项'), { target: { value: '芝麻' } }); fireEvent.click(screen.getByRole('button', { name: '保存忌口' })); await screen.findByText('忌口已保存');
      expect(screen.getByText(/尚未识别，未生效：芝麻/)).not.toBeNull(); fireEvent.click(screen.getByRole('button', { name: '生成本餐菜单' })); expect(await screen.findByText(/请补全、移除或手选/)).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: '菜谱' })); expect(screen.getAllByText(/原料身份或复合成分未知：未知复合配料原文/)).toHaveLength(8); fireEvent.click(await screen.findByRole('button', { name: '手选 接口meat1' })); await screen.findByText('草稿已保存');
      fireEvent.click(screen.getByRole('button', { name: '今天吃什么' })); expect(screen.getByText(/原料身份或复合成分未知：未知复合配料原文/)).not.toBeNull();
    } finally { test.close(); }
  });
  it('converts vegetarian slots but does not invent ingredient-based suitability', async () => {
    const test = await mealSetup(); try {
      fireEvent.click(screen.getByLabelText('素食组合（完整配料需审核）')); await screen.findByText('设置和草稿已保存');
      const read = await test.repo.read(); if (!read.ok) throw new Error('read'); expect(read.value.preferences.softPreferences).toContain('vegetarian'); expect(read.value.draft?.slots.map((s) => s.type)).toEqual(['vegetable', 'vegetable']);
      fireEvent.click(screen.getByRole('button', { name: '生成本餐菜单' })); expect(await screen.findByText(/当前目录没有完整配料的素食适用审核/)).not.toBeNull(); expect((await test.repo.read())).toEqual(read);
    } finally { test.close(); }
  });
  it('saves retained failed preferences with the next draft edit rather than falsely losing them', async () => {
    const test = await mealSetup({ failSettingsOnce: true }); try {
      fireEvent.change(screen.getByLabelText('用餐人数'), { target: { value: '5' } }); fireEvent.click(screen.getByRole('button', { name: '应用人数和菜数' })); await screen.findByText(/存储空间不足/);
      fireEvent.click(screen.getByRole('button', { name: '菜谱' })); fireEvent.click(await screen.findByRole('button', { name: '手选 接口meat1' })); await screen.findByText('草稿已保存');
      const read = await test.repo.read(); if (!read.ok) throw new Error('read'); expect(read.value.draft?.servings).toBe(5); expect(read.value.preferences.servings).toBe(5);
    } finally { test.close(); }
  });
  it('retains the settings edit baseline after read-only latest viewing', async () => {
    const test = await mealSetup(); try {
      const latest = personalData().preferences; latest.servings = 6;
      const { act } = await import('@testing-library/react'); await act(async () => { await test.repo.commit({ type: 'savePreferences', preferences: latest }, 0, 'foreign-setting'); });
      fireEvent.change(screen.getByLabelText('用餐人数'), { target: { value: '4' } }); fireEvent.click(screen.getByRole('button', { name: '应用人数和菜数' }));
      expect((screen.getByLabelText('用餐人数') as HTMLInputElement).value).toBe('4'); fireEvent.click(screen.getByRole('button', { name: '查看最新内容' })); await screen.findByRole('button', { name: '采用最新草稿' });
      fireEvent.change(screen.getByLabelText('菜数'), { target: { value: '4' } }); fireEvent.click(screen.getByRole('button', { name: '应用人数和菜数' }));
      const before = await test.repo.read(); if (!before.ok) throw new Error('read'); expect(before.value.preferences.servings).toBe(6); expect(before.value.meta.revision).toBe(1);
      fireEvent.click(screen.getByRole('button', { name: '保留当前编辑并继续' })); fireEvent.change(screen.getByLabelText('菜数'), { target: { value: '5' } }); fireEvent.click(screen.getByRole('button', { name: '应用人数和菜数' })); await screen.findByText('设置和草稿已保存');
      const after = await test.repo.read(); if (!after.ok) throw new Error('read'); expect(after.value.preferences.servings).toBe(4); expect(after.value.preferences.slots).toHaveLength(5); expect(after.value.meta.revision).toBe(2);
    } finally { test.close(); }
  });

  it('does not save a plan over an unsaved draft; exact retry preserves the selected input', async () => {
    const test = await mealSetup({ failDraftOnce: true }); try {
      fireEvent.click(screen.getByRole('button', { name: '菜谱' })); fireEvent.click(await screen.findByRole('button', { name: '手选 接口meat1' })); await screen.findByText(/存储空间不足/);
      fireEvent.click(screen.getByRole('button', { name: '今天吃什么' })); fireEvent.click(screen.getByRole('button', { name: '保存到日历' })); fireEvent.click(screen.getByRole('button', { name: '保存计划' }));
      expect(await screen.findByText(/草稿仍有未保存编辑/)).not.toBeNull(); const before = await test.repo.read(); if (!before.ok) throw new Error('read'); expect(before.value.plans).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: '重试保存当前编辑' })); await screen.findByText('草稿已保存'); fireEvent.click(screen.getByRole('button', { name: '保存计划' })); await screen.findByText('计划已保存');
      const after = await test.repo.read(); if (!after.ok) throw new Error('read'); expect(after.value.plans[0]?.snapshots[0]?.name).toBe('接口meat1');
    } finally { test.close(); }
  });
  it('atomically saves the unchanged dirty draft when exclusions are saved after a draft failure', async () => {
    const test = await mealSetup({ failDraftOnce: true }); try {
      fireEvent.click(screen.getByRole('button', { name: '菜谱' }));
      fireEvent.click(await screen.findByRole('button', { name: '手选 接口meat1' }));
      await screen.findByText(/存储空间不足/);
      fireEvent.click(screen.getByRole('button', { name: '今天吃什么' }));
      fireEvent.change(screen.getByLabelText('硬忌口，每行一项'), { target: { value: '芝麻' } });
      fireEvent.click(screen.getByRole('button', { name: '保存忌口' }));
      await screen.findByText('忌口已保存');
      const saved = await test.repo.read(); if (!saved.ok) throw new Error('read');
      expect(saved.value.draft?.dishes.map((dish) => dish.recipe.name)).toEqual(['接口meat1']);
      expect(saved.value.preferences.hardExclusions).toEqual([{ ingredientId: null, raw: '芝麻' }]);
      fireEvent.click(screen.getByRole('button', { name: '保存到日历' }));
      fireEvent.click(screen.getByRole('button', { name: '保存计划' }));
      await screen.findByText('计划已保存');
      const plan = await test.repo.read(); if (!plan.ok) throw new Error('read');
      expect(plan.value.plans[0]?.snapshots.map((snapshot) => snapshot.name)).toEqual(['接口meat1']);
    } finally { test.close(); }
  });
  it('retains an exact atomic retry if both the original draft and exclusions save fail', async () => {
    const test = await mealSetup({ failDraftOnce: true, failSettingsOnce: true }); try {
      fireEvent.click(screen.getByRole('button', { name: '菜谱' }));
      fireEvent.click(await screen.findByRole('button', { name: '手选 接口meat1' }));
      await screen.findByText(/存储空间不足/);
      fireEvent.click(screen.getByRole('button', { name: '今天吃什么' }));
      fireEvent.change(screen.getByLabelText('硬忌口，每行一项'), { target: { value: '芝麻' } });
      fireEvent.click(screen.getByRole('button', { name: '保存忌口' }));
      await screen.findByText(/存储空间不足/);
      const failed = test.attempts.at(-1)!;
      expect(failed.command.type).toBe('saveSettings');
      const before = await test.repo.read(); if (!before.ok) throw new Error('read');
      expect(before.value.draft).toBeNull(); expect(before.value.preferences.hardExclusions).toEqual([]);
      expect(screen.getByText('接口meat1', { exact: true })).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: '重试保存当前编辑' }));
      await screen.findByText('忌口已保存');
      expect(test.attempts.at(-1)).toEqual(failed);
      const saved = await test.repo.read(); if (!saved.ok) throw new Error('read');
      expect(saved.value.draft?.dishes.map((dish) => dish.recipe.name)).toEqual(['接口meat1']);
      expect(saved.value.preferences.hardExclusions).toEqual([{ ingredientId: null, raw: '芝麻' }]);
      fireEvent.click(screen.getByRole('button', { name: '保存到日历' }));
      fireEvent.click(screen.getByRole('button', { name: '保存计划' })); await screen.findByText('计划已保存');
      const plans = await test.repo.read(); if (!plans.ok) throw new Error('read');
      expect(plans.value.plans[0]?.snapshots.map((snapshot) => snapshot.name)).toEqual(['接口meat1']);
    } finally { test.close(); }
  });
  it.each([{ label: '用餐人数', value: '0' }, { label: '用餐人数', value: '' }, { label: '菜数', value: '21' }, { label: '菜数', value: '' }])('blocks both automatic entry points for invalid $label input "$value"', async ({ label, value }) => {
    const test = await mealSetup(); try {
      fireEvent.click(screen.getByRole('button', { name: '菜谱' }));
      fireEvent.click(await screen.findByRole('button', { name: '手选 接口meat1' }));
      await screen.findByText('草稿已保存');
      fireEvent.click(screen.getByRole('button', { name: '今天吃什么' }));
      const before = await test.repo.read();
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      expect((screen.getByRole('button', { name: '重生成整餐' }) as HTMLButtonElement).disabled).toBe(true);
      const replace = screen.getByRole('button', { name: '换一道 接口meat1' });
      expect((replace as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(replace);
      expect(await test.repo.read()).toEqual(before);
    } finally { test.close(); }
  });
  it('retains incomplete numeric input and disables generation instead of applying the previous value', async () => {
    const test = await mealSetup(); try {
      fireEvent.change(screen.getByLabelText('用餐人数'), { target: { value: '0' } }); expect((screen.getByLabelText('用餐人数') as HTMLInputElement).value).toBe('0'); expect((screen.getByRole('button', { name: '生成本餐菜单' }) as HTMLButtonElement).disabled).toBe(true);
      const read = await test.repo.read(); if (!read.ok) throw new Error('read'); expect(read.value.meta.revision).toBe(0);
    } finally { test.close(); }
  });

  it('requires resolving a locked type conflict before any whole-meal changes', async () => {
    const test = await mealSetup(); try {
      fireEvent.click(screen.getByRole('button', { name: '生成本餐菜单' })); await screen.findByText('菜单已生成并保存'); const first = await test.repo.read(); if (!first.ok || !first.value.draft) throw new Error('read'); const meat = first.value.draft.dishes[0]!;
      fireEvent.click(screen.getByRole('button', { name: `锁定 ${meat.recipe.name}` })); await screen.findByText('锁定状态已保存'); fireEvent.change(screen.getByLabelText('第 1 槽类型'), { target: { value: 'vegetable' } }); await screen.findByText('设置和草稿已保存');
      expect(screen.getByText(/此菜不匹配当前槽位类型/)).not.toBeNull(); const before = await test.repo.read();
      fireEvent.click(screen.getByRole('button', { name: '重生成整餐' })); await screen.findByText('锁定菜与当前条件冲突，请先解除锁定或移除。当前菜单已保留。'); expect(await test.repo.read()).toEqual(before);
      fireEvent.click(screen.getByRole('button', { name: `解除锁定 ${meat.recipe.name}` })); await screen.findByText('锁定状态已保存'); fireEvent.click(screen.getByRole('button', { name: '重生成整餐' })); await screen.findByText('菜单已生成并保存');
      const after = await test.repo.read(); if (!after.ok) throw new Error('read'); expect(after.value.draft?.dishes.every((d) => d.recipe.types.includes('vegetable'))).toBe(true);
    } finally { test.close(); }
  });

});

it('holds plan confirmation inputs stable while its save is pending', async () => {
  let finish!: (value: Result<CommitReceipt>) => void;
  const repo = makeRepo(async (command) => command.type === 'savePlan' ? new Promise((resolve) => { finish = resolve; }) : { ok: true, value: { globalRevision: 1, objectId: 'current', objectRevision: 1, replayed: false } });
  render(<App repository={repo} catalogLoader={async () => ({ ok: true, value: catalog })} storageStatus={status} />);
  await select(); await screen.findByText('草稿已保存'); fireEvent.click(screen.getByRole('button', { name: '今天吃什么' })); fireEvent.click(screen.getByRole('button', { name: '保存到日历' }));
  fireEvent.change(screen.getByLabelText('计划日期'), { target: { value: '2026-10-10' } }); fireEvent.click(screen.getByRole('button', { name: '保存计划' }));
  expect((screen.getByLabelText('计划日期') as HTMLInputElement).disabled).toBe(true); expect((screen.getByLabelText('计划餐次') as HTMLSelectElement).disabled).toBe(true); expect((screen.getByLabelText('计划日期') as HTMLInputElement).value).toBe('2026-10-10');
  finish({ ok: true, value: { globalRevision: 2, objectId: '00000000-0000-4000-8000-000000000001', objectRevision: 1, replayed: false } }); await screen.findByText('计划已保存');
});
