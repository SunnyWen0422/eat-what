import {expect,it} from 'vitest';
import {recipe} from './fixtures.ts';
import {recommendationEvidence} from '../src/menu/rules.ts';
it('web reasons only use explicit local favorites and real recent actual facts',()=>{
 const r=recipe();
 expect(recommendationEvidence(r,{favoriteIds:[],actualMeals:[],today:'2026-10-15' as any})).toEqual([]);
 expect(recommendationEvidence(r,{favoriteIds:[r.recipeId],actualMeals:[],today:'2026-10-15' as any})).toEqual(['来自你的收藏']);
});
