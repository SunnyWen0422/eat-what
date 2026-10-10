import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
// These fixtures exercise the public provider boundary only; no runtime fallback is bundled.
const directoryURL='**/api/public/catalog/dishes?*';
const directory={page:1,pageSize:100,total:1,list:[{id:930001,name:'历史测试青菜',type:'veg',cl:'未知结构量的原料原文',steps:'测试做法',contentVersion:'history-e2e-only',quality:null}]};
async function start(page:Page,online=true){
  await page.clock.setFixedTime(new Date('2026-10-09T12:00:00Z'));
  await page.route(directoryURL,route=>online?route.fulfill({contentType:'application/json',body:JSON.stringify(directory)}):route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await page.goto('/');await expect(page.getByText('正在读取本地记录…')).toHaveCount(0);
}
async function select(page:Page){await page.getByRole('button',{name:'菜谱',exact:true}).click();await page.getByRole('button',{name:'手选 历史测试青菜',exact:true}).click();await expect(page.getByText('草稿已保存',{exact:true})).toBeVisible();await page.getByRole('button',{name:'今天吃什么',exact:true}).click();}
async function readHistory(page:Page){return page.evaluate(async()=>{
  const path='/src/data/repository.ts';const {openRepository}=await import(path);
  const opened=await openRepository({factory:indexedDB,now:()=>new Date(),uuid:()=>crypto.randomUUID()});if(!opened.ok)throw new Error(opened.error.message);
  const result=await opened.value.read();opened.value.close();if(!result.ok)throw new Error(result.error.message);return result.value;
});}

test('plan → confirmed actual → duplicate opening/additional → reload → actual-only recap',async({page})=>{
  const requests:string[]=[];page.on('request',request=>requests.push(request.url()));await start(page);await select(page);
  await page.getByRole('button',{name:'保存到日历'}).click();await page.getByLabel('计划日期').fill('2026-10-09');await page.getByRole('button',{name:'保存计划',exact:true}).click();await expect(page.getByText('计划已保存',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'日历',exact:true}).click();await page.getByRole('button',{name:'按此记录饮食 历史测试青菜'}).click();await page.getByLabel('实际备注').fill('确实吃过');await page.getByRole('button',{name:'确认记录实际'}).click();await expect(page.getByText('实际记录已保存',{exact:true})).toBeVisible();
  let data=await readHistory(page);expect(data.plans).toHaveLength(1);expect(data.actualMeals).toHaveLength(1);
  await page.getByRole('button',{name:'按此记录饮食 历史测试青菜'}).click();await expect(page.getByText('此计划已有实际记录')).toBeVisible();await page.getByRole('button',{name:'打开现有实际记录'}).click();await expect(page.getByLabel('实际备注')).toHaveValue('确实吃过');await page.getByRole('button',{name:'取消记录'}).click();
  await page.getByRole('button',{name:'按此记录饮食 历史测试青菜'}).click();await page.getByRole('button',{name:'明确新增一条实际记录'}).click();await page.getByRole('button',{name:'确认记录实际'}).click();await expect(page.getByText('实际记录已保存',{exact:true})).toBeVisible();
  await page.reload();data=await readHistory(page);expect(data.actualMeals).toHaveLength(2);expect(data.plans).toHaveLength(1);await page.getByRole('button',{name:'我的',exact:true}).click();await expect(page.getByText('2026-10-09 · 已记录 2 条')).toBeVisible();await expect(page.getByText('2026-10-08 · 未记录')).toBeVisible();
  expect(requests.filter(url=>new URL(url).pathname.startsWith('/api/')).every(url=>new URL(url).pathname==='/api/public/catalog/dishes')).toBe(true);
  await page.setViewportSize({width:320,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const screenshots=resolve('..','.superpowers/sdd/2026-10-09-eatwhat-independent-web/screenshots');await mkdir(screenshots,{recursive:true});await page.screenshot({path:resolve(screenshots,'task-4-history-320.png'),fullPage:true});
  await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:resolve(screenshots,'task-4-history-200-percent.png'),fullPage:true});
});

test('API unavailable → custom-only manual draft/template/actual remain local; source edits do not change snapshots',async({page})=>{
  await start(page,false);await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'新建自定义菜谱'}).click();await page.getByLabel('自定义菜名').fill('个人测试菜');await page.getByRole('button',{name:'保存自定义菜谱'}).click();await expect(page.getByText('自定义菜谱已保存',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'手选 个人测试菜',exact:true}).click();await expect(page.getByText('草稿已保存',{exact:true})).toBeVisible();await page.getByRole('button',{name:'今天吃什么',exact:true}).click();
  await page.getByRole('button',{name:'保存为菜单模板'}).click();await page.getByLabel('模板名称').fill('个人测试组合');await page.getByRole('button',{name:'确认保存模板'}).click();await expect(page.getByText('菜单模板已保存',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'记录本餐实际饮食'}).click();await page.getByRole('button',{name:'确认记录实际'}).click();await expect(page.getByText('实际记录已保存',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'编辑自定义 个人测试菜'}).click();await page.getByLabel('自定义菜名').fill('改名后的菜');await page.getByRole('button',{name:'保存自定义菜谱'}).click();await expect(page.getByText('自定义菜谱已保存',{exact:true})).toBeVisible();
  const data=await readHistory(page);expect(data.customRecipes[0].snapshot.name).toBe('改名后的菜');expect(data.menuTemplates[0].snapshots[0].name).toBe('个人测试菜');expect(data.actualMeals[0].snapshots[0].name).toBe('个人测试菜');expect(data.plans).toHaveLength(0);
  await page.reload();await page.getByRole('button',{name:'日历',exact:true}).click();await expect(page.getByText('实际 · 个人测试菜')).toBeVisible();
});

test('delete/restore source plan preserves actuals; clearAll cancellation writes nothing',async({page})=>{
  await start(page);await select(page);await page.getByRole('button',{name:'保存到日历'}).click();await page.getByRole('button',{name:'保存计划',exact:true}).click();await expect(page.getByText('计划已保存',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'日历',exact:true}).click();await page.getByRole('button',{name:'按此记录饮食 历史测试青菜'}).click();await page.getByRole('button',{name:'确认记录实际'}).click();await expect(page.getByText('实际记录已保存',{exact:true})).toBeVisible();await page.getByRole('button',{name:'删除计划 历史测试青菜'}).click();await page.getByRole('button',{name:'确认移入回收站'}).click();await expect(page.getByText('来源计划已删除')).toBeVisible();
  await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'恢复 历史测试青菜'}).click();await page.getByRole('button',{name:'确认恢复'}).click();await expect(page.getByText('已恢复',{exact:true})).toBeVisible();const before=await readHistory(page);await page.getByRole('button',{name:'清空本应用全部数据'}).click();await page.getByRole('button',{name:'我已了解影响，继续'}).click();await page.getByRole('button',{name:'取消清空'}).click();expect(await readHistory(page)).toEqual(before);
});
