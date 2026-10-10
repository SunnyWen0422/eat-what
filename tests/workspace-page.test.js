const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const rules=require('../utils/meal-workspace');
function fixture(api){let account='A',factory;const ctx={module:{exports:{}},require:name=>{
 if(name==='./meal-actual-entry')return require('../utils/meal-actual-entry')
 if(name==='./workspace-voice')return require('../utils/workspace-voice')
 if(name==='./meal-workspace-presentation')return require('../utils/meal-workspace-presentation')
 if(name==='./meal-save-target')return require('../utils/meal-save-target')
 if(name==='./meal-action-feedback')return require('../utils/meal-action-feedback')
 if(name==='./meal-composition')return require('../utils/meal-composition')
 if(name==='./experience-preferences')return require('../utils/experience-preferences')
 if(name==='./api')return api
 if(name==='./ui-tokens')return require('../utils/ui-tokens')
 if(name==='./util')return {getCurrentUserIdentity:()=>account,getUserStorageKey:key=>account+':'+key}
 if(name==='./meal-workspace')return {...rules,createWorkspaceStore:()=>({dispose(){},state:()=>({context:{},linked:{}})})}
 if(name==='./shopping-list')return {}
 throw Error(name)
},wx:{getStorageSync:()=>null,getAppBaseInfo:()=>({fontSizeScaleFactor:1})},getApp:()=>({waitForLogin:async()=>{}}),setTimeout,clearTimeout,console};vm.runInNewContext(fs.readFileSync('utils/meal-workspace-page.js','utf8'),ctx);factory=ctx.module.exports;const view=factory();view.setData=values=>Object.assign(view.data,values);return {view,switch:()=>account='B'}}
test('a late preference read cannot initialize the next account with the previous target',async()=>{
 let finish;let first=true;const f=fixture({getUserPreferences:()=>first?(first=false,new Promise(r=>finish=r)):Promise.resolve({defaultPeople:3})});const seen=[];
 f.view.readWorkspace=async target=>seen.push(target.date);f.view._alive=true;
 const a=f.view.initializeWorkspace({date:'2026-10-01',mealType:'lunch'});f.switch();await f.view.initializeWorkspace({date:'2026-10-03',mealType:'dinner'});finish({defaultPeople:9});await a;
 assert.deepEqual(seen,['2026-10-03']);assert.equal(f.view.data.context.people,3)
})
