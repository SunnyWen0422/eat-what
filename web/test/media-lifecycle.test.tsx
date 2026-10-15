// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render} from '@testing-library/react';
import {recipe} from './fixtures.ts';
import {rememberRecipeImage,recipeImage} from '../src/catalog/media.ts';
import {RecipeImage,RecipeMediaContext} from '../src/ui/RecipeImage.tsx';
import {snapshotRecipe} from '../src/domain/snapshots.ts';
import type {Catalog} from '../src/domain/types.ts';
afterEach(cleanup);
it('removing or rejecting updated media clears the old sidecar image',()=>{
 const row=recipe();rememberRecipeImage(row,'https://img.example/a.jpg');expect(recipeImage(row)).toBeTruthy();
 rememberRecipeImage(row,null);expect(recipeImage(row)).toBeNull();
});
it('a new recipe content version retries the same photo after an earlier error',()=>{
 const first=recipe({contentVersion:'v1'});rememberRecipeImage(first,'https://img.example/a.jpg');
 const catalog={recipes:[first]} as Catalog;
 const view=render(<RecipeMediaContext value={catalog}><RecipeImage snapshot={snapshotRecipe(first)}/></RecipeMediaContext>);
 fireEvent.error(view.container.querySelector('img')!);expect(view.container.querySelector('img')).toBeNull();
 const next=recipe({contentVersion:'v2'});rememberRecipeImage(next,'https://img.example/a.jpg');
 view.rerender(<RecipeMediaContext value={{recipes:[next]} as Catalog}><RecipeImage snapshot={snapshotRecipe(next)}/></RecipeMediaContext>);
 expect(view.container.querySelector('img')).not.toBeNull();
});
