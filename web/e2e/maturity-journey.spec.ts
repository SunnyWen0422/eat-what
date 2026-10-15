import {test,expect,type Page} from '@playwright/test';
import {publicPage,recipeName} from './ui-fixtures.ts';
test.use({serviceWorkers:'block'});
test.beforeEach(async({context,page})=>{
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.pathname==='/api/public/catalog/dishes')return route.fulfill({contentType:'application/json',body:JSON.stringify(publicPage)});if(url.origin==='http://127.0.0.1:4173'&&!url.pathname.startsWith('/api/'))return route.continue();return route.abort('blockedbyclient');});
 await context.routeWebSocket('**/*',socket=>socket.close());await page.goto('/');await expect(page.getByText('正在读取本地记录…')).toHaveCount(0);
});
async function state(page:Page){return page.evaluate(async()=>{const path='/src/data/repository.ts';const {openRepository}=await import(path),opened=await openRepository({factory:indexedDB,now:()=>new Date(),uuid:()=>crypto.randomUUID()});if(!opened.ok)throw Error('isolated store unavailable');try{const value=await opened.value.read();if(!value.ok)throw Error('read failed');return value.value;}finally{opened.value.close();}});}
async function openDetails(page:Page,buttonName:string){const button=page.getByRole('button',{name:buttonName,exact:true,includeHidden:true});for(const details of await button.locator('xpath=ancestor::details').all())if(await details.getAttribute('open')===null)await details.locator(':scope > summary').click();await expect(button).toBeVisible();return button;}
test('meal save, plan edit cancellation and shopping retain original data',async({page})=>{
 await page.getByRole('button',{name:'菜谱',exact:true}).click();await page.getByRole('button',{name:`手选 ${recipeName}`,exact:true}).click();await expect(page.getByText('草稿已保存',{exact:true})).toBeVisible();await page.getByRole('button',{name:'今天吃什么',exact:true}).click();
 const before=await state(page);await page.getByRole('button',{name:'晚餐',exact:true}).click();expect(await state(page)).toEqual(before);
 await page.getByRole('button',{name:'保存到日历',exact:true}).click();await page.getByRole('button',{name:'保存计划',exact:true}).click();await expect(page.getByText('计划已保存',{exact:true})).toBeVisible();await page.getByRole('button',{name:'日历',exact:true}).click();
 const saved=await state(page);await (await openDetails(page,`编辑计划 ${recipeName}`)).click();await page.getByLabel('计划人数').fill('5');await page.getByRole('button',{name:'取消计划编辑',exact:true}).click();expect(await state(page)).toEqual(saved);
 await (await openDetails(page,`按计划建采购清单 ${recipeName}`)).click();await page.getByRole('button',{name:'预览采购合计',exact:true}).click();await page.getByRole('button',{name:'确认保存新清单',exact:true}).click();await expect(page.getByText('采购清单已保存',{exact:true})).toBeVisible();const shopping=await state(page);expect(shopping.plans).toEqual(saved.plans);expect(shopping.actualMeals).toHaveLength(0);expect(shopping.shoppingLists).toHaveLength(1);
});
test('four widths and three font scales preserve controls and scrollable dialogs',async({page},info)=>{
 test.setTimeout(150_000);
 for(const width of [320,390,430,1280])for(const scale of [1,1.3,2]){
  await page.setViewportSize({width,height:844});await page.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,16*scale);
  await page.getByRole('button',{name:'菜谱',exact:true}).click();await page.getByRole('button',{name:`查看详情 ${recipeName}`,exact:true}).click();const dialog=page.getByRole('dialog',{name:recipeName});await expect(dialog).toBeVisible();await expect(dialog).toBeFocused();expect(await dialog.evaluate(node=>node.scrollTop)).toBe(0);
  const geometry=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].filter(node=>node.getClientRects().length).map(node=>({text:node.textContent,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})),font:getComputedStyle(document.querySelector('[role="dialog"]')!).fontSize}));
  expect(geometry.width).toBeLessThanOrEqual(width+1);for(const button of geometry.buttons){expect(button.width).toBeGreaterThanOrEqual(44);expect(button.height).toBeGreaterThanOrEqual(44);}expect(parseFloat(geometry.font)).toBeGreaterThanOrEqual(16*scale-0.1);
  await page.screenshot({path:info.outputPath(`detail-${width}-${scale}.png`)});await page.getByRole('button',{name:'关闭菜谱详情',exact:true}).click();
  await page.getByRole('button',{name:'日历',exact:true}).click();await page.getByRole('button',{name:'月选日',exact:true}).click();expect(await page.getByRole('button',{name:'月选日',exact:true}).evaluate(node=>getComputedStyle(node).backgroundColor)).toBe('rgb(40, 99, 78)');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);await page.screenshot({path:info.outputPath(`calendar-${width}-${scale}.png`)});
 }
});
