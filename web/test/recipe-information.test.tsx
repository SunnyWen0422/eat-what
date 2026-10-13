// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Recipes } from '../src/ui/Recipes.tsx';
import type { Catalog } from '../src/domain/types.ts';
import { recipe, personalData } from './fixtures.ts';
afterEach(cleanup);
it.each([['BROWSE_ONLY','仅供浏览'],['REJECTED','未通过审核']] as const)('retains %s and original portions in on-demand information', (reviewStatus, label) => {
 const catalog={origin:'online-provider',version:null,recipes:[recipe({reviewStatus,issues:['原文份量：两人份','COMPOUND_COMPOSITION_UNKNOWN']})],aliases:{},recipeAliases:{},availability:{}} as Catalog;
 render(<Recipes catalog={{ok:true,value:catalog}} loading={false} onRetry={()=>{}} onSelect={()=>{}} onFavorite={()=>{}} favorites={[]} writable pending={false} preferences={personalData().preferences}/>);
 fireEvent.click(screen.getByRole('button',{name:'查看详情 测试青菜'}));
 expect(screen.getByText(label,{exact:false})).not.toBeNull();
 expect(screen.getByText('原文份量：两人份')).not.toBeNull();
 expect(screen.getByText('复合食材的完整配料尚未核实。')).not.toBeNull();
});
