import {test,expect} from '@playwright/test';
import {publicPage} from './ui-fixtures.ts';
test.use({serviceWorkers:'block'});
test.beforeEach(async({context,page})=>{
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin==='http://127.0.0.1:4173'&&u.pathname==='/api/public/catalog/dishes')return route.fulfill({contentType:'application/json',body:JSON.stringify(publicPage)});if(u.origin==='http://127.0.0.1:4173'&&!u.pathname.startsWith('/api/'))return route.continue();return route.abort('blockedbyclient');});
 await context.routeWebSocket('**/*',socket=>socket.close());await page.goto('/');await expect(page.getByText('正在读取本地记录…')).toHaveCount(0);
});
test('keyboard skip link, modal focus return and saved input survive navigation',async({page})=>{
 await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'跳到主要内容'})).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#main-content')).toBeFocused();
 const nav=page.getByRole('button',{name:'我的',exact:true});await nav.focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/#\/my$/);
 const trigger=page.getByRole('button',{name:'新建自定义菜谱',exact:true});await trigger.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 for(let i=0;i<20;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);}
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();await page.keyboard.press('Enter');await page.getByLabel('自定义菜名').fill('键盘保存验收菜');
 const save=page.getByRole('button',{name:'保存自定义菜谱',exact:true});
 for(let i=0;i<25&&!await save.evaluate(node=>node===document.activeElement);i++)await page.keyboard.press('Tab');
 await expect(save).toBeFocused();await page.keyboard.press('Enter');await expect(page.getByText('自定义菜谱已保存',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'日历',exact:true}).click();await page.goBack();await expect(page).toHaveURL(/#\/my$/);await expect(page.getByText('键盘保存验收菜',{exact:true}).first()).toBeVisible();
});
test('reduced motion and two hundred percent text keep actions reachable at 320px',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:320,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='32px');
 for(const name of ['菜谱','日历','我的','今天吃什么']){
  const button=page.getByRole('button',{name,exact:true});await button.click();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  const box=await button.boundingBox();expect(box?.width).toBeGreaterThanOrEqual(44);expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(await button.evaluate(n=>getComputedStyle(n).transitionDuration)).toBe('0s');
 }
 await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'新建自定义菜谱',exact:true}).click();await page.getByLabel('自定义菜名').fill('大字验收');const save=page.getByRole('button',{name:'保存自定义菜谱',exact:true});await save.scrollIntoViewIfNeeded();
 expect(await save.evaluate(n=>{const r=n.getBoundingClientRect();const p=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return p===n||n.contains(p);})).toBe(true);
 await save.click();await expect(page.getByText('自定义菜谱已保存',{exact:true})).toBeVisible();
});
