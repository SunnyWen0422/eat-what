import {expect,test} from '@playwright/test';
import {directory} from './ui-fixtures.ts';
test.use({serviceWorkers:'block'});
for(const width of [320,390,430,1280])test(`meal hierarchy and reachable actions at ${width}`,async({page,context},testInfo)=>{
 await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4173'?route.continue():route.abort());
 await directory(page);await page.setViewportSize({width,height:844});await page.goto('/');
 await expect(page.getByRole('navigation',{name:'主导航'})).toBeVisible();
 await expect(page.locator('.settings-disclosure')).toHaveAttribute('open','');
 await page.getByRole('button',{name:'菜谱',exact:true}).click();
 await expect(page.locator('.catalog-filter-options')).not.toHaveAttribute('open','');
 await expect(page.locator('.recipe-card').first()).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('recipes.png'),fullPage:true});
 for(const scale of [1,1.3,2]){
  await page.evaluate(s=>{document.documentElement.style.fontSize=`${16*s}px`},scale);
  for(const label of ['今天吃什么','菜谱','日历','我的']){
   await page.getByRole('button',{name:label,exact:true}).click();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
 }
 await page.getByRole('button',{name:'今天吃什么',exact:true}).click();
 const control=page.locator('.settings-disclosure > summary');await control.scrollIntoViewIfNeeded();
 const box=await control.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);
 await page.screenshot({path:testInfo.outputPath('today-large.png'),fullPage:true});
});
