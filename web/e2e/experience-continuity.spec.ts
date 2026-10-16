import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';

async function open(context:BrowserContext){
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin==='http://127.0.0.1:4173'&&url.pathname==='/api/public/catalog/dishes')return route.fulfill({status:503,contentType:'application/json',body:'{}'});
  if(url.origin==='http://127.0.0.1:4173'&&!url.pathname.startsWith('/api/'))return route.continue();
  return route.abort('blockedbyclient');
 });
 await context.routeWebSocket('**/*',socket=>socket.close());
 const page=await context.newPage();await page.goto('http://127.0.0.1:4173/');
 await expect(page.getByText('正在读取本地记录…')).toHaveCount(0);
 await page.getByRole('button',{name:'我的',exact:true}).click();return page;
}
async function read(page:Page){return page.evaluate(async()=>{
 const path='/src/data/repository.ts';const {openRepository}=await import(path);
 const opened=await openRepository({factory:indexedDB,now:()=>new Date(),uuid:()=>crypto.randomUUID()});
 if(!opened.ok)throw Error('IndexedDB unavailable');
 try{const value=await opened.value.read();if(!value.ok)throw Error('Read failed');return value.value;}finally{opened.value.close();}
});}
async function seed(page:Page,name:string){
 await page.getByRole('button',{name:'新建自定义菜谱'}).click();await page.getByLabel('自定义菜名').fill(name);
 await page.getByRole('button',{name:'保存自定义菜谱'}).click();await expect(page.getByText('自定义菜谱已保存',{exact:true})).toBeVisible();
}
test('J11 real browser process restart retains IndexedDB; cancelled and aborted restore preserve data',async({playwright},info)=>{
 const profile=process.env.EATWHAT_E17_BROWSER_PROFILE;
 test.skip(!profile,'Explicit new external E17 browser profile required');
 if(!profile||existsSync(profile))throw Error('Fresh browser profile required');
 const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
 const options={headless:true,...(executable?{executablePath:executable}:{}),serviceWorkers:'block' as const};
 let context=await playwright.chromium.launchPersistentContext(profile,options);
 try{
  let page=await open(context);await seed(page,'E17 原始个人菜');const before=await read(page);
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'导出已保存个人备份'}).click();
  const download=await downloading,downloadPath=await download.path();if(!downloadPath)throw Error('Missing backup');const backup=await readFile(downloadPath);
  await expect.poll(async()=>(await read(page)).meta.lastBackupRequestedAt).not.toBeNull();
  const beforeRestart=await read(page);
  await context.close();context=await playwright.chromium.launchPersistentContext(profile,options);page=await open(context);
  expect(await read(page)).toEqual(beforeRestart);
  await seed(page,'E17 重启后保留菜');const changed=await read(page);
  const select=async()=>{await page.getByLabel('选择 JSON 备份').setInputFiles({name:'e17.json',mimeType:'application/json',buffer:backup});await expect(page.getByText('备份已验证，尚未替换任何数据。')).toBeVisible();};
  await select();await page.getByRole('button',{name:'取消备份恢复'}).click();expect(await read(page)).toEqual(changed);
  await select();await page.evaluate(()=>{
   const original=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){if(this.name==='meta')this.transaction.abort();return original.apply(this,args);};
   (globalThis as unknown as {e17RestorePut:()=>void}).e17RestorePut=()=>{IDBObjectStore.prototype.put=original;};
  });
  await page.getByLabel('我已保存旧库备份，或接受覆盖且无法撤回').check();await page.getByRole('button',{name:'确认替换全部个人数据'}).click();
  await expect(page.getByText('本地保存未完成，输入已保留。请重试。')).toBeVisible();expect(await read(page)).toEqual(changed);
  await page.evaluate(()=>(globalThis as unknown as {e17RestorePut:()=>void}).e17RestorePut());
  await page.getByRole('button',{name:'确认替换全部个人数据'}).click();await expect(page.getByText('个人备份已恢复。',{exact:true})).toBeVisible();
  expect((await read(page)).customRecipes.map((r:{snapshot:unknown})=>r.snapshot)).toEqual(before.customRecipes.map((r:{snapshot:unknown})=>r.snapshot));
  await page.screenshot({path:info.outputPath('J11-restored.png')});
 }finally{await context.close();}
});
