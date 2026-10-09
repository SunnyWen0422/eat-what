const test = require('node:test')
const assert = require('node:assert/strict')
const { createWorkspaceStore, normalizeContext, defaultTarget } = require('../utils/meal-workspace')

function fixture() {
  let identity = 'A'; const cache = new Map(); let server = { id:'ws', revision:0, context:normalizeContext({date:'2026-10-03',mealType:'lunch',people:2}), draft:{planVersion:1,dishes:[{id:1,name:'菜'}]} }
  const calls=[]; const api={getMealWorkspace:async()=>({workspace:server,planRevision:0}),saveWorkspaceContext:async(id,body)=>{calls.push(JSON.parse(JSON.stringify(body)));throw Object.assign(new Error('network'),{statusCode:0})}}
  const store=createWorkspaceStore({api,identity:()=>identity,read:key=>cache.get(key),write:(key,value)=>cache.set(key,value)})
  return {store,calls,api,switch:()=>identity='B'}
}

test('manual counts survive people change and all meals use explicit Beijing targets',()=>{
  const c=normalizeContext({date:'2026-10-03',mealType:'lunch',people:2});assert.deepEqual(c.counts,{meat:1,veg:1})
  assert.deepEqual(normalizeContext({...c,mealType:'breakfast',people:5}).counts,{staple:2,side:2})
  assert.equal(normalizeContext({...c,compositionMode:'manual',counts:{meat:3},people:6}).counts.meat,3)
  assert.equal(defaultTarget(new Date('2026-10-03T00:00:00Z')).mealType,'breakfast')
  assert.equal(defaultTarget(new Date('2026-10-03T09:00:00Z')).mealType,'dinner')
})

test('unknown write keeps its original key and payload until explicit retry',async()=>{
  const f=fixture();await f.store.load('2026-10-03','lunch');f.store.edit({...f.store.state().context,people:4});
  await assert.rejects(f.store.save());const original=f.store.state().pending
  f.store.edit({...f.store.state().context,people:6});assert.equal(f.store.state().context.people,6)
  f.api.getWorkspaceRequest=async()=>null
  await assert.rejects(f.store.retry());assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(f.store.state().pending.body.requestId,original.body.requestId)
})

test('account switch discards a late workspace response and prevents stale writes',async()=>{
  const f=fixture();let finish;f.api.getMealWorkspace=()=>new Promise(r=>finish=r)
  const loading=f.store.load('2026-10-03','lunch');f.switch();finish({workspace:{id:'A-private',revision:8}})
  await assert.rejects(loading,/账号/);assert.equal(f.store.state().workspace,null)
  await assert.rejects(f.store.save(),/账号/);assert.equal(f.calls.length,0)
})

test('a version conflict keeps local edits and stops new operations',async()=>{
  const f=fixture();f.api.saveWorkspaceContext=async()=>{throw Object.assign(new Error('conflict'),{statusCode:409})}
  await f.store.load('2026-10-03','lunch');f.store.edit({...f.store.state().context,requirements:'客人不吃花生'})
  await assert.rejects(f.store.save());assert.equal(f.store.state().syncStatus,'conflict');assert.equal(f.store.state().context.requirements,'客人不吃花生')
  await assert.rejects(f.store.command('generate'),/最新/)
})

test('refresh never silently rebases unsynced local edits onto another device revision', async()=>{
  const f=fixture();await f.store.load('2026-10-03','lunch');f.store.edit({...f.store.state().context,people:4});
  f.api.getMealWorkspace=async()=>({workspace:{id:'ws',revision:7,context:normalizeContext({date:'2026-10-03',mealType:'lunch',people:3}),draft:{planVersion:2,dishes:[]}}})
  await f.store.load('2026-10-03','lunch');await assert.rejects(f.store.save());
  assert.equal(f.calls[0].expectedWorkspaceRevision,0)
})

test('a slow read cannot replace a newer acknowledged cloud snapshot',async()=>{
 const f=fixture();await f.store.load('2026-10-03','lunch');f.store.edit({...f.store.state().context,people:4});
 const old=f.store.state().workspace;let finish;f.api.getMealWorkspace=()=>new Promise(r=>finish=r);
 const read=f.store.load('2026-10-03','lunch');f.api.saveWorkspaceContext=async(id,body)=>({...old,revision:1,context:body.context});await f.store.save();finish({workspace:old,planRevision:0});await read;
 assert.equal(f.store.state().workspace.revision,1);assert.equal(f.store.state().context.people,4)
})
test('a create racing another device retains input and requires explicit conflict resolution',async()=>{
 const f=fixture();f.api.getMealWorkspace=async()=>({workspace:null});await f.store.load('2026-10-03','lunch');f.store.edit({...f.store.state().context,people:4});
 f.api.createMealWorkspace=async()=>({id:'existing',revision:2,context:normalizeContext({date:'2026-10-03',mealType:'lunch',people:3}),draft:{planVersion:0,dishes:[]}})
 await f.store.save();assert.equal(f.store.state().context.people,4);assert.equal(f.store.state().syncStatus,'conflict');await assert.rejects(f.store.command('generate'),/最新/)
})

test('server materializing empty criteria does not create a false first-meal conflict',async()=>{
 const f=fixture();f.api.getMealWorkspace=async()=>({workspace:null});await f.store.load('2026-10-03','lunch')
 f.api.createMealWorkspace=async(body)=>({id:'new',revision:1,context:{...body.context,criteria:{cuisineCodes:[],includeTagCodes:[],excludeTagCodes:[],excludedIngredients:[],maxCookMinutes:null}},draft:{planVersion:0,dishes:[]}})
 await f.store.save();assert.equal(f.store.state().syncStatus,'synced')
 let generated=false;f.api.commandMealWorkspace=async(id,body)=>{generated=body.command==='generate';return {...f.store.state().workspace,revision:2}}
 await f.store.command('generate');assert.equal(generated,true)
})
test('a different server constraint still blocks a racing create',async()=>{
 const f=fixture();f.api.getMealWorkspace=async()=>({workspace:null});await f.store.load('2026-10-03','lunch')
 f.api.createMealWorkspace=async(body)=>({id:'other',revision:1,context:{...body.context,criteria:{excludedIngredients:['花生']}},draft:{planVersion:0,dishes:[]}})
 await f.store.save();assert.equal(f.store.state().syncStatus,'conflict');await assert.rejects(f.store.command('generate'),/最新/)
})
