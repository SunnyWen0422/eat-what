// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {Calendar} from '../src/ui/Calendar.tsx';
import {Shopping} from '../src/ui/Shopping.tsx';
import {Recipes} from '../src/ui/Recipes.tsx';
import type {LocalActions} from '../src/ui/PersonalActions.tsx';
import {personalData,recipe} from './fixtures.ts';
import {snapshotRecipe} from '../src/domain/snapshots.ts';
import {localDate} from '../src/domain/dates.ts';
import type {Catalog,TimeZone,UtcIso} from '../src/domain/types.ts';
afterEach(cleanup);
function actions():LocalActions{return {data:personalData(),catalog:null,pending:false,writable:true,commit:vi.fn(),readLatest:vi.fn(),onSelect:vi.fn(),onUseTemplate:vi.fn()} as unknown as LocalActions;}
it('calendar keeps one main action and opens secondary plan operations without writing',()=>{
 const a=actions(),shopping=vi.fn(),today=localDate(new Date(),Intl.DateTimeFormat().resolvedOptions().timeZone as TimeZone);
 a.data.plans=[{id:'p',date:today,meal:'dinner',servings:2,snapshots:[snapshotRecipe(recipe())],timeZone:'UTC' as TimeZone,revision:1,requestId:'p',createdAt:new Date().toISOString() as UtcIso,updatedAt:new Date().toISOString() as UtcIso}];
 render(<Calendar actions={a} onShopping={shopping}/>);const meal=screen.getByRole('region',{name:`${today} 晚餐`});
 expect(within(meal).getByRole('button',{name:'按此记录饮食 测试青菜'}).classList.contains('primary')).toBe(true);
 const edit=within(meal).getByRole('button',{name:'编辑计划 测试青菜',hidden:true});expect(edit.closest('details')).not.toBeNull();expect(edit.closest('details')!.open).toBe(false);
 fireEvent.click(within(meal).getByText('更多餐次操作'));expect(a.commit).not.toHaveBeenCalled();expect(shopping).not.toHaveBeenCalled();
});
it('shopping keeps ingredient identity and quantity while hiding secondary operations',()=>{
 const a=actions();a.data.shoppingLists=[{id:'list',createdAt:new Date().toISOString() as UtcIso,updatedAt:new Date().toISOString() as UtcIso,revision:1,requestId:'r',sources:[],items:[{key:'one',name:'鸡肉',form:'冷冻',part:'鸡腿',ingredientId:null,quantity:null,unknownEntries:[],sources:[],userQuantity:'半袋',purchased:false,manual:true}]}];
 render(<Shopping actions={a} draftSource={null}/>);expect(screen.getByText(/鸡肉 · 形态 冷冻 · 部位 鸡腿/)).not.toBeNull();expect(screen.getByText(/半袋/)).not.toBeNull();expect(screen.getByRole('button',{name:'删除采购清单 list',hidden:true}).closest('details')?.open).toBe(false);expect(a.commit).not.toHaveBeenCalled();
});
it('recipe detail places the title before the food and returning retains filters',()=>{
 const r=recipe(),catalog={origin:'online-provider',recipes:[r],version:null,aliases:{},recipeAliases:{},availability:{}} as Catalog;
 render(<Recipes catalog={{ok:true,value:catalog}} loading={false} onRetry={()=>{}} onSelect={()=>{}} onFavorite={()=>{}} favorites={[]} writable pending={false} preferences={personalData().preferences}/>);
 fireEvent.change(screen.getByLabelText('搜索名称或食材'),{target:{value:'青菜'}});fireEvent.click(screen.getByRole('button',{name:'查看详情 测试青菜'}));const dialog=screen.getByRole('dialog',{name:'测试青菜'}),title=within(dialog).getAllByRole('heading').find(n=>n.textContent==='测试青菜')!,image=dialog.querySelector('.recipe-hero')!;
 expect(title.compareDocumentPosition(image)&Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);expect(document.activeElement).toBe(dialog);fireEvent.click(screen.getByRole('button',{name:'关闭菜谱详情'}));expect(screen.getByLabelText('搜索名称或食材')).toHaveProperty('value','青菜');expect(document.activeElement).toBe(screen.getByRole('button',{name:'查看详情 测试青菜'}));
});
