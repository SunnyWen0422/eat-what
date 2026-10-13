// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { App } from '../src/ui/App.tsx';
import { openRepository, type Repository } from '../src/data/repository.ts';
import { draft, recipe } from './fixtures.ts';
import { snapshotRecipe } from '../src/domain/snapshots.ts';
import { buildShopping, sourceFromDraft } from '../src/shopping/shopping.ts';
const repos: Repository[]=[];
const status={readable:true,writable:true,origin:'https://test.invalid',estimate:null,persisted:null,error:null};
const loader=async()=>({ok:false as const,error:{code:'UNAVAILABLE' as const,message:'Network disabled'}});
beforeEach(()=>{history.replaceState(null,'','/');vi.stubGlobal('crypto',webcrypto);});
afterEach(()=>{cleanup();repos.splice(0).forEach(repo=>repo.close());vi.unstubAllGlobals();vi.restoreAllMocks();});
async function open(factory=new IDBFactory()) {const result=await openRepository({factory,now:()=>new Date(),uuid:()=>crypto.randomUUID()});if(!result.ok)throw Error(result.error.message);repos.push(result.value);return result.value;}
async function read(repo:Repository){const result=await repo.read();if(!result.ok)throw Error(result.error.message);return result.value;}
async function commit(repo:Repository,command:Parameters<Repository['commit']>[0]){const result=await repo.commit(command,(await read(repo)).meta.revision,crypto.randomUUID());expect(result.ok).toBe(true);}
function app(repo:Repository){render(<App repository={repo} catalogLoader={loader} storageStatus={status}/>);}
async function click(name:string){const button=await screen.findByRole('button',{name});await waitFor(()=>expect(button).toHaveProperty('disabled',false));await act(async()=>fireEvent.click(button));}
for(const [slotId,locked] of [['slot-3',false],['template-1',false],['template-1',true]] as const){
  it(`same meal preserves ${slotId}, locked=${locked}, through repository reopen`,async()=>{
    const factory=new IDBFactory(),repo=await open(factory);
    await commit(repo,{type:'saveDraft',draft:draft({slots:[{id:slotId,type:'vegetable'}],dishes:[{slotId,recipe:snapshotRecipe(recipe()),locked}]})});
    const before=await read(repo);app(repo);await screen.findByText('测试青菜');await click('晚餐');
    expect(await read(repo)).toEqual(before);
    cleanup();repo.close();const reopened=await open(factory);app(reopened);await screen.findByText('测试青菜');expect(await read(reopened)).toEqual(before);
  });
}
it('unchanged meal select is also a settings no-op',async()=>{
 const repo=await open();await commit(repo,{type:'saveDraft',draft:draft({slots:[{id:'slot-3',type:'vegetable'}],dishes:[{slotId:'slot-3',recipe:snapshotRecipe(recipe()),locked:true}]})});
 app(repo);await screen.findByText('测试青菜');const before=await read(repo);
 await act(async()=>fireEvent.change(screen.getByLabelText('草稿餐次'),{target:{value:'dinner'}}));expect(await read(repo)).toEqual(before);
});
it('same-name shopping items expose form and part and persist only the selected edits',async()=>{
 const repo=await open();const current=draft({dishes:[{slotId:'vegetable-1',locked:false,recipe:snapshotRecipe(recipe({ingredients:[
 {ingredientId:null,raw:'鸡肉',form:'冷冻',part:'鸡腿',quantity:null,trust:'unknown',compoundResolved:false},
 {ingredientId:null,raw:'鸡肉',form:'新鲜',part:'鸡胸',quantity:null,trust:'unknown',compoundResolved:false}
 ]}))}]});
 await commit(repo,{type:'saveDraft',draft:current});
 await commit(repo,{type:'saveShoppingList',list:buildShopping([sourceFromDraft((await read(repo)).draft!)]),expectedObjectRevision:null});
 const original=(await read(repo)).shoppingLists[0]!;app(repo);await click('我的');await click('编辑采购清单 '+original.id);
 const dialog=screen.getByRole('dialog',{name:'编辑采购清单'});
 fireEvent.change(within(dialog).getByLabelText('手改用量 鸡肉 · 形态 冷冻 · 部位 鸡腿'),{target:{value:'一包'}});
 fireEvent.click(within(dialog).getByLabelText('已购 鸡肉 · 形态 新鲜 · 部位 鸡胸'));
 await click('保存采购编辑');await screen.findByText('采购编辑已保存');
 const items=(await read(repo)).shoppingLists[0]!.items;
 expect(items[0]).toEqual({...original.items[0],userQuantity:'一包'});expect(items[1]).toEqual({...original.items[1],purchased:true});
 await click('编辑采购清单 '+original.id);expect(screen.getByLabelText('手改用量 鸡肉 · 形态 冷冻 · 部位 鸡腿')).toHaveProperty('value','一包');expect(screen.getByLabelText('已购 鸡肉 · 形态 新鲜 · 部位 鸡胸')).toHaveProperty('checked',true);
});
it('same-name trash entries identify the object in the list and confirmation; cancel and conflict never write',async()=>{
 const repo=await open();await commit(repo,{type:'saveCustomRecipe',recipe:{name:'同名菜',types:[],ingredients:[],steps:[],baseServings:null},expectedObjectRevision:null});
 const custom=(await read(repo)).customRecipes[0]!;await commit(repo,{type:'saveFavorite',snapshot:custom.snapshot});
 const favorite=(await read(repo)).favorites[0]!;
 await commit(repo,{type:'deleteObject',store:'customRecipes',id:custom.id,expectedObjectRevision:custom.revision});
 await commit(repo,{type:'deleteObject',store:'favorites',id:favorite.id,expectedObjectRevision:favorite.revision});
 await commit(repo,{type:'saveFavorite',snapshot:custom.snapshot});app(repo);await click('我的');
 for(const type of ['自定义菜谱','收藏']){
   const before=await read(repo);await click(`恢复 ${type} · 同名菜`);
   const dialog=screen.getByRole('dialog',{name:'恢复已删除项目'});expect(within(dialog).getByText(`${type} · 同名菜`)).not.toBeNull();
   if(type==='收藏')expect(within(dialog).getByRole('button',{name:'确认恢复'})).toHaveProperty('disabled',true);
   await click('取消恢复');expect(await read(repo)).toEqual(before);
 }
 await click('恢复 自定义菜谱 · 同名菜');await click('确认恢复');await screen.findByText('已恢复');
 const restored=await read(repo);expect(restored.customRecipes[0]!.snapshot).toEqual(custom.snapshot);expect(restored.favorites).toHaveLength(1);expect(restored.trash.map(entry=>entry.store)).toEqual(['favorites']);
});
