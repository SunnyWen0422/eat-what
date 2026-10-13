import { test, expect, type Page } from '@playwright/test';
// Only the self-started loopback Vite server is reachable. No real API or model calls.
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ context, page }) => {
  await context.route('**/*', async route => {
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/api/')) return route.fulfill({status:503,contentType:'application/json',body:'{}'});
    if(url.origin==='http://127.0.0.1:4173') return route.continue();
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  await page.goto('/');await expect(page.getByText('正在读取本地记录…')).toHaveCount(0);
});
async function seed(page:Page,mode:'draft'|'shopping'|'trash'){
 await page.evaluate(async mode=>{
  const repositoryPath='/src/data/repository.ts',fixturePath='/test/fixtures.ts',snapshotPath='/src/domain/snapshots.ts',shoppingPath='/src/shopping/shopping.ts';
  const {openRepository}=await import(repositoryPath),{draft,recipe}=await import(fixturePath),{snapshotRecipe}=await import(snapshotPath),{sourceFromDraft,buildShopping}=await import(shoppingPath);
  const opened=await openRepository({factory:indexedDB,now:()=>new Date(),uuid:()=>crypto.randomUUID()});if(!opened.ok)throw Error(opened.error.message);const repo=opened.value;
  async function read(){const result=await repo.read();if(!result.ok)throw Error(result.error.message);return result.value;}
  async function commit(command:unknown){const result=await repo.commit(command,(await read()).meta.revision,crypto.randomUUID());if(!result.ok)throw Error(result.error.message);}
  try {
   if(mode==='trash'){
    await commit({type:'saveCustomRecipe',recipe:{name:'同名菜',types:[],ingredients:[],steps:[],baseServings:null},expectedObjectRevision:null});
    const custom=(await read()).customRecipes[0];await commit({type:'saveFavorite',snapshot:custom.snapshot});const favorite=(await read()).favorites[0];
    await commit({type:'deleteObject',store:'customRecipes',id:custom.id,expectedObjectRevision:custom.revision});await commit({type:'deleteObject',store:'favorites',id:favorite.id,expectedObjectRevision:favorite.revision});
    await commit({type:'saveFavorite',snapshot:custom.snapshot});
   } else {
    const r=recipe({ingredients:[{ingredientId:null,raw:'鸡肉',form:'冷冻',part:'鸡腿',quantity:null,trust:'unknown',compoundResolved:false},{ingredientId:null,raw:'鸡肉',form:'新鲜',part:'鸡胸',quantity:null,trust:'unknown',compoundResolved:false}]});
    await commit({type:'saveDraft',draft:draft({slots:[{id:'template-1',type:'vegetable'}],dishes:[{slotId:'template-1',recipe:snapshotRecipe(r),locked:true}]})});
    if(mode==='shopping')await commit({type:'saveShoppingList',list:buildShopping([sourceFromDraft((await read()).draft)]),expectedObjectRevision:null});
   }
  } finally {repo.close();}
 },mode);
 await page.reload();await expect(page.getByText('正在读取本地记录…')).toHaveCount(0);
}
async function read(page:Page){return page.evaluate(async()=>{const path='/src/data/repository.ts';const {openRepository}=await import(path);const opened=await openRepository({factory:indexedDB,now:()=>new Date(),uuid:()=>crypto.randomUUID()});if(!opened.ok)throw Error(opened.error.message);try {const result=await opened.value.read();if(!result.ok)throw Error(result.error.message);return result.value;}finally{opened.value.close();}});}
test('active meal preserves locked template draft across reload and keyboard activation',async({page})=>{
 await seed(page,'draft');const before=await read(page);const dinner=page.getByRole('button',{name:'晚餐',exact:true});await dinner.click();await dinner.focus();await page.keyboard.press('Enter');await page.keyboard.press('Space');expect(await read(page)).toEqual(before);await page.reload();await expect(page.getByText('测试青菜',{exact:true})).toBeVisible();expect(await read(page)).toEqual(before);
});
test('form and part identify independent shopping edits after reload',async({page})=>{
 await seed(page,'shopping');const before=await read(page),list=before.shoppingLists[0];await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'编辑采购清单 '+list.id,exact:true}).click();
 await page.getByLabel('手改用量 鸡肉 · 形态 冷冻 · 部位 鸡腿',{exact:true}).fill('一包');await page.getByLabel('已购 鸡肉 · 形态 新鲜 · 部位 鸡胸',{exact:true}).check();await page.getByRole('button',{name:'保存采购编辑',exact:true}).click();await expect(page.getByText('采购编辑已保存',{exact:true})).toBeVisible();
 await page.reload();const saved=(await read(page)).shoppingLists[0];expect(saved.items[0]).toEqual({...list.items[0],userQuantity:'一包'});expect(saved.items[1]).toEqual({...list.items[1],purchased:true});
 await page.getByRole('button',{name:'我的',exact:true}).click();await page.setViewportSize({width:320,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('trash types survive dialog cancel and duplicate restore is blocked',async({page})=>{
 await seed(page,'trash');await page.getByRole('button',{name:'我的',exact:true}).click();const before=await read(page);
 for(const type of ['自定义菜谱','收藏']){await page.getByRole('button',{name:`恢复 ${type} · 同名菜`,exact:true}).click();const dialog=page.getByRole('dialog',{name:'恢复已删除项目'});await expect(dialog.getByText(`${type} · 同名菜`,{exact:true})).toBeVisible();if(type==='收藏')await expect(dialog.getByRole('button',{name:'确认恢复',exact:true})).toBeDisabled();await dialog.getByRole('button',{name:'取消恢复',exact:true}).click();expect(await read(page)).toEqual(before);}
 await page.getByRole('button',{name:'恢复 自定义菜谱 · 同名菜',exact:true}).click();await page.getByRole('button',{name:'确认恢复',exact:true}).click();await expect(page.getByText('已恢复',{exact:true})).toBeVisible();await page.reload();const saved=await read(page);expect(saved.customRecipes).toHaveLength(1);expect(saved.favorites).toHaveLength(1);expect(saved.trash.map((entry:{store:string})=>entry.store)).toEqual(['favorites']);
});
