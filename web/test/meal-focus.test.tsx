// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import type {ComponentProps} from 'react';
import {Today} from '../src/ui/Today.tsx';
import {draft,personalData,recipe} from './fixtures.ts';
import {snapshotRecipe} from '../src/domain/snapshots.ts';
afterEach(cleanup);
function props(hasMenu=false):ComponentProps<typeof Today>{
 const data=personalData(),settings=draft({dishes:hasMenu?[{slotId:'vegetable-1',recipe:snapshotRecipe(recipe()),locked:false}]:[]});
 return {data,settings,draft:hasMenu?settings:null,preferences:data.preferences,generation:null,ready:true,catalogAvailable:true,catalogLoading:false,notice:'',noticeError:false,recovery:null,writable:true,pending:false,confirming:false,date:'2026-10-15',meal:'dinner',onShopping:vi.fn(),onRecord:vi.fn(),onTemplate:vi.fn(),onConfirm:vi.fn(),onDate:vi.fn(),onMeal:vi.fn(),onSave:vi.fn(),onCancel:vi.fn(),onSettings:vi.fn(),onExclusions:vi.fn(),onGenerate:vi.fn(),onReplace:vi.fn(),onLock:vi.fn(),onRemove:vi.fn(),onCountsConfirm:vi.fn(),onDiscard:vi.fn(),onRetryCatalog:vi.fn()};
}
it('starts empty settings open and generated settings collapsed without business writes',()=>{
 const p=props();const view=render(<Today {...p}/>);
 expect(view.container.querySelector('details.settings-disclosure')).toHaveProperty('open',true);
 const withMenu=props(true);view.rerender(<Today {...withMenu}/>);
 expect(view.container.querySelector('details.settings-disclosure')).toHaveProperty('open',false);
 expect(withMenu.onSettings).not.toHaveBeenCalled();expect(withMenu.onGenerate).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'晚餐'}));expect(withMenu.onSettings).not.toHaveBeenCalled();
});
it('unapplied edits remain visible outside collapsed settings and prevent saving',()=>{
 const p=props(true);const view=render(<Today {...p}/>);
 fireEvent.change(screen.getByLabelText('用餐人数'),{target:{value:'3'}});
 const status=screen.getByRole('status');
 expect(status.closest('details')).toBeNull();
 expect(screen.getByRole('button',{name:'保存到日历'})).toHaveProperty('disabled',true);
 expect(p.onSettings).not.toHaveBeenCalled();
 expect(view.container.querySelector('details.settings-disclosure')).toHaveProperty('open',false);
});
