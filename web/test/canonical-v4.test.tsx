// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { canonicalIngredients, canonicalRecipe, type CanonicalRecipe, type CanonicalScale } from '../src/catalog/canonical.ts';
import { fetchCanonicalScale } from '../src/catalog/public-transport.ts';
import { normalizePublicDish } from '../src/catalog/catalog.ts';
import { RecipeFacts } from '../src/ui/components.tsx';
import { isRecipeSnapshot } from '../src/domain/validation.ts';
import {buildShopping,sourceFromDraft,prepareCanonicalSources} from '../src/shopping/shopping.ts';
import {draft} from './fixtures.ts';
import type { PublicDish, RecipeSnapshot } from '../src/domain/types.ts';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function recipe():CanonicalRecipe {return {quantityPolicy:'fixed-recipe-v1',id:1,name:'整批菜谱',baseServings:null,categoryCode:'CAT_VEGETABLE',mealCodes:['MEAL_DINNER'],dishGroupId:'group',servingRole:'dish',dietaryCodes:null,allergenCodes:null,timing:{totalMinutes:null},ingredients:[{id:'i1',ingredientId:'salt',quantity:null,quantityKind:'discretionary',quantityDisplay:'适量',unit:'g',preparation:'',optional:false,defaultEnabled:true,ingredient:{id:'salt',name:'盐',animal:null,allergens:null}},{id:'i2',ingredientId:'oil',quantity:5,quantityKind:'exact',unit:'g',preparation:'',optional:true,defaultEnabled:false,ingredient:{id:'oil',name:'油',animal:false,allergens:[]}}],steps:[{id:'s1',text:'取 1/2 加入，煮 3 分钟。',ingredientLineIds:['i1']}],calculatedNutrition:{completeness:'partial',total:null,perServing:null}};}
function snapshot():RecipeSnapshot {const r=recipe();return {recipeId:'eatwhat-db:1',familyId:'group',variantId:null,name:r.name,types:['vegetable'],ingredients:canonicalIngredients(r),steps:r.steps.map(s=>s.text),source:{url:null,commit:null,license:null},catalogVersion:'v4',contentVersion:'one',baseServings:null,canonical:{recipeId:1,revision:'v4',dietaryCodes:null,allergenCodes:null,totalMinutes:null,servingRole:'dish',nutrition:null,optionalIngredients:[{lineId:'i2',name:'油',defaultEnabled:false}]}};}
function scale():CanonicalScale{return {quantityPolicy:'fixed-recipe-v1',quantityBasis:'fixed_recipe',portionBasis:'equal_share_reference',diners:null,recipeId:1,catalogRevision:'v4',contentVersion:'one',servings:null,baseServings:null,dietaryCodes:null,allergenCodes:null,ingredients:[{lineId:'i1',ingredientId:'salt',name:'盐',quantity:null,quantityKind:'discretionary',quantityDisplay:'适量',procurementQuantity:null,unit:'g',enabled:true},{lineId:'i2',ingredientId:'oil',name:'油',quantity:5,quantityKind:'exact',procurementQuantity:5,unit:'g',enabled:true}],steps:[{text:'取 1/2 加入，煮 3 分钟。'}],nutrition:{completeness:'partial',total:null,perServing:null}};}
it('accepts nullable v4 catalog fields and persists discretionary snapshots',()=>{
 const r=canonicalRecipe(recipe());expect(r.baseServings).toBeNull();expect(canonicalIngredients(r)[0]).toMatchObject({quantity:null,quantityDisplay:'适量'});
 const result=normalizePublicDish({id:1,recipe:r,catalogRevision:'v4',contentVersion:'one'} as PublicDish);expect(result.ok).toBe(true);if(result.ok)expect(result.value.canonical?.allergenCodes).toBeNull();
 expect(isRecipeSnapshot(snapshot())).toBe(true);
});
it('renders unknown batch and unknown allergens without invented time, servings or nutrition',()=>{
 render(<RecipeFacts snapshot={snapshot()}/>);expect(screen.getByText('适量')).toBeTruthy();expect(screen.queryByRole('spinbutton')).toBeNull();expect(screen.getByText(/整道菜用量/)).toBeTruthy();expect(screen.getByText('过敏原资料未提供')).toBeTruthy();expect(document.body.textContent).not.toMatch(/null|NaN|0 分钟|千卡/);expect(screen.getByText('取 1/2 加入，煮 3 分钟。')).toBeTruthy();
});
it('optional switching requests server computation and accepts partial nutrition',async()=>{
 const fetcher=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify(scale()),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetcher);
 render(<RecipeFacts snapshot={snapshot()}/>);fireEvent.click(screen.getByRole('checkbox'));
 await waitFor(()=>expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true));expect(fetcher).toHaveBeenCalledTimes(1);
 expect(fetcher.mock.calls[0]?.[0]).toBe('/api/public/catalog/dishes/1/scale');
 const request=fetcher.mock.calls[0]?.[1] as RequestInit;expect(JSON.parse(request.body as string)).toEqual({servings:null,optionalOverrides:{i2:true}});expect(document.body.textContent).not.toMatch(/千卡/);
});
it('does not fall back to original nutrition after a partial recalculation and rejects raw tokens',async()=>{
 const before=snapshot();before.canonical!.nutrition={energyKcal:100,proteinG:1,fatG:1,carbohydrateG:1,fiberG:0,sodiumMg:0};const fetcher=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify(scale()),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetcher);
 render(<RecipeFacts snapshot={before}/>);expect(screen.getByText(/100 千卡/)).toBeTruthy();expect(screen.getByText('仅参考').tagName).toBe('SMALL');expect(document.body.textContent).not.toContain('整道菜合计');fireEvent.click(screen.getByRole('checkbox'));await waitFor(()=>expect(screen.queryByText(/100 千卡/)).toBeNull());expect(screen.queryByText('仅参考')).toBeNull();
 const bad=scale();bad.steps[0]!.text='加入 {{amount:i1}}';await expect(fetchCanonicalScale(1,null,'v4',async()=>new Response(JSON.stringify(bad),{headers:{'Content-Type':'application/json'}}))).rejects.toThrow();
});
it('shopping keeps discretionary amounts null and requests a whole batch when servings are unknown',async()=>{
 const response=scale();response.ingredients[1]!.enabled=false;
 const fetcher=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetcher);
 const sources=await prepareCanonicalSources([sourceFromDraft(draft({dishes:[{slotId:'vegetable-1',recipe:snapshot(),locked:false}]}))]);
 expect(fetcher.mock.calls[0]?.[0]).toBe('/api/public/catalog/dishes/1/scale');
 const list=buildShopping(sources);expect(list.items[0]!.quantity).toBeNull();expect(list.items[0]!.sources[0]!.scaled.ingredient.quantityDisplay).toBe('适量');expect(list.items[0]!.sources[0]!.scaled.reason).toBe('适量');
});

it('rejects old quantity policies instead of silently treating a scaled response as fixed',async()=>{
 const old=scale();(old as unknown as {quantityPolicy:string}).quantityPolicy='servings-scale-v2';
 await expect(fetchCanonicalScale(1,null,'v4',async()=>new Response(JSON.stringify(old),{headers:{'Content-Type':'application/json'}}))).rejects.toThrow();
 const source=recipe();(source as unknown as {quantityPolicy:string}).quantityPolicy='servings-scale-v2';expect(()=>canonicalRecipe(source)).toThrow();
});

it('keeps the same whole-dish ingredients for one, two and eight diners with or without source servings',async()=>{
 const fetcher=vi.fn(async(_input:RequestInfo|URL)=>new Response(JSON.stringify(scale()),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetcher);
 for(const baseServings of [null,2])for(const servings of [1,2,8]){
  const original=recipe();original.ingredients[1]!.defaultEnabled=true;
  const saved={...snapshot(),baseServings,ingredients:canonicalIngredients(original)};
  const input=[sourceFromDraft(draft({servings,dishes:[{slotId:'vegetable-1',recipe:saved,locked:false}]}))];
  const before=structuredClone(input);const list=buildShopping(await prepareCanonicalSources(input));
  expect(list.items.map(item=>item.quantity)).toEqual([null,{kind:'exact',value:5,unit:'g'}]);
  expect(input).toEqual(before);expect(list.sources[0]!.snapshots[0]!.steps).toEqual(['取 1/2 加入，煮 3 分钟。']);
 }
 expect(fetcher).toHaveBeenCalledTimes(6);expect(fetcher.mock.calls.every(call=>!String(call[0]).includes('servings='))).toBe(true);
});

it('requires complete nutrition evidence before displaying a recalculated total',async()=>{
 const response=scale();delete response.nutrition.completeness;response.nutrition.total={energyKcal:999,proteinG:1,fatG:1,carbohydrateG:1,fiberG:0,sodiumMg:0};
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}})));
 render(<RecipeFacts snapshot={snapshot()}/>);fireEvent.click(screen.getByRole('checkbox'));
 await waitFor(()=>expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true));
 expect(document.body.textContent).not.toContain('千卡');
});
