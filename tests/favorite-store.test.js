const test = require('node:test'), assert = require('node:assert/strict')
const { createFavoriteStore } = require('../utils/favorite-store')
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => {resolve=yes;reject=no}); return {promise,resolve,reject} }
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture(options={}) {
  const ids = new Set(options.ids || []), calls = [], owner = { active:true }, seen=[]
  const api = {
    batchCheckFavoriteDishes:async requested=>{calls.push(['read',requested]);return [...ids]},
    addFavoriteDish:async id=>{calls.push(['add',id]);ids.add(id);return {success:true}},
    removeFavoriteDish:async id=>{calls.push(['remove',id]);ids.delete(id);return {success:true}},
    checkFavoriteDish:async id=>{calls.push(['check',id]);return {isFavorite:ids.has(id)}},
    ...options.api,
  }
  const store=createFavoriteStore({api,current:()=>owner.active})
  store.subscribe(7,state=>seen.push({...state}))
  return {store,api,ids,calls,owner,seen}
}
test('many cards share one initial read and updates synchronize all copies of a dish',async()=>{
  const f=fixture({ids:[8]}),second=[];f.store.subscribe(7,value=>second.push(value));f.store.subscribe(8,()=>{})
  await Promise.all([f.store.ensure(),f.store.ensure(),f.store.ensure()])
  assert.equal(f.calls.filter(x=>x[0]==='read').length,1);assert.equal(f.store.state(8).favorite,true)
  await f.store.toggle(7);assert.equal(f.store.state(7).favorite,true);assert.equal(second.at(-1).favorite,true)
  await f.store.toggle(7);assert.equal(f.store.state(7).favorite,false);assert.deepEqual(f.calls.filter(x=>x[0]!=='read'),[['add',7],['remove',7]])
})
test('initial unknown state is read before toggling an already-favorite dish',async()=>{
  const f=fixture({ids:[7]});await f.store.toggle(7)
  assert.deepEqual(f.calls.map(x=>x[0]),['read','remove']);assert.equal(f.store.state(7).favorite,false)
})
test('double tapping creates only one mutation and keeps a visible pending state',async()=>{
  const wait=deferred(),f=fixture();await f.store.ensure()
  f.api.addFavoriteDish=async()=>{f.calls.push(['add',7]);await wait.promise;return {success:true}}
  const first=f.store.toggle(7);await tick();assert.equal(f.store.state(7).busy,true);assert.equal(f.store.state(7).favorite,true)
  assert.equal((await f.store.toggle(7)).ignored,true);wait.resolve();await first
  assert.equal(f.calls.filter(x=>x[0]==='add').length,1);assert.equal(f.store.state(7).busy,false)
})
test('late background snapshots cannot revert a newer favorite click',async()=>{
  const f=fixture();await f.store.ensure();const wait=deferred()
  f.api.batchCheckFavoriteDishes=()=>wait.promise
  const reading=f.store.ensure(true);await tick()
  // toggle waits for the shared pending read, then applies the current intent.
  const clicking=f.store.toggle(7);wait.resolve([]);await Promise.all([reading,clicking]);assert.equal(f.store.state(7).favorite,true)
})
test('a refresh during an unfinished write does not overwrite the optimistic state',async()=>{
  const wait=deferred(),f=fixture();await f.store.ensure();f.api.addFavoriteDish=()=>wait.promise
  const clicking=f.store.toggle(7);await tick();await f.store.ensure(true)
  assert.equal(f.store.state(7).favorite,true);wait.resolve({success:true});await clicking;assert.equal(f.store.state(7).favorite,true)
})
test('a failed write restores actual server state, including success:false responses',async()=>{
  for(const result of ['reject','false']) {
    const f=fixture();f.api.addFavoriteDish=async()=>{if(result==='reject')throw {statusCode:500};return {success:false}}
    await assert.rejects(f.store.toggle(7),{code:'WRITE_FAILED'})
    assert.equal(f.store.state(7).favorite,false);assert.equal(f.store.state(7).busy,false)
  }
})
test('timeout after server success is reconciled without duplicating the write',async()=>{
  const f=fixture();let writes=0
  f.api.addFavoriteDish=async()=>{writes++;f.ids.add(7);throw {isNetworkError:true}}
  const result=await f.store.toggle(7);assert.equal(result.favorite,true);assert.equal(result.reconciled,true);assert.equal(writes,1)
})
test('unknown write followed by retry checks the original intent and never blindly reverses it',async()=>{
  const f=fixture();let writes=0,checkFails=true
  f.api.addFavoriteDish=async()=>{writes++;f.ids.add(7);throw {isNetworkError:true}}
  f.api.checkFavoriteDish=async()=>{if(checkFails)throw Error('offline');return {isFavorite:true}}
  await assert.rejects(f.store.toggle(7),{code:'OUTCOME_UNKNOWN'});assert.equal(f.store.state(7).known,false)
  checkFails=false;const result=await f.store.toggle(7)
  assert.equal(result.favorite,true);assert.equal(result.matched,true);assert.equal(writes,1);assert.equal(f.store.state(7).known,true)
})
test('unconfirmed cancellation does not pretend success when the original favorite remains',async()=>{
  const f=fixture({ids:[7]});let readFailed=true,writes=0
  f.api.removeFavoriteDish=async()=>{writes++;throw Error('offline')}
  f.api.checkFavoriteDish=async()=>{if(readFailed)throw Error('offline');return {isFavorite:true}}
  await assert.rejects(f.store.toggle(7),{code:'OUTCOME_UNKNOWN'});readFailed=false
  const result=await f.store.toggle(7);assert.equal(result.favorite,true);assert.equal(result.matched,false);assert.equal(writes,1)
})
test('account/environment changes discard late reads and never write from an old card',async()=>{
  const wait=deferred(),f=fixture({api:{batchCheckFavoriteDishes:()=>wait.promise}})
  const click=f.store.toggle(7);await tick();f.owner.active=false;const count=f.seen.length;wait.resolve([])
  await assert.rejects(click,{code:'ACCOUNT_CHANGED'});assert.equal(f.calls.length,0);assert.equal(f.seen.length,count)
})
test('account change during save suppresses completion notifications and reconciliation',async()=>{
  const wait=deferred(),f=fixture();await f.store.ensure();f.api.addFavoriteDish=()=>wait.promise
  const click=f.store.toggle(7);await tick();f.owner.active=false;const count=f.seen.length;wait.resolve({success:true})
  await assert.rejects(click,{code:'ACCOUNT_CHANGED'});assert.equal(f.seen.length,count);assert.equal(f.calls.some(x=>x[0]==='check'),false)
})
test('invalid identity and unavailable initial reads never send a favorite mutation',async()=>{
  const f=fixture({api:{batchCheckFavoriteDishes:async()=>{throw Error('offline')}}})
  await assert.rejects(f.store.toggle(0),{code:'INVALID_DISH'});await assert.rejects(f.store.toggle(7));assert.equal(f.calls.length,0)
})
