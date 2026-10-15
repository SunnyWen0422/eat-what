const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const action=fs.existsSync('utils/meal-feedback.js')?require('../utils/meal-feedback').feedbackAction:null
test('meal feedback respects locking, invalid input and busy state',()=>{
 assert.equal(typeof action,'function')
 assert.equal(action({kind:'keep',dishId:7,busy:false,locked:false}).action,'keep')
 assert.equal(action({kind:'keep',dishId:7,busy:false,locked:true}).action,'release')
 assert.equal(action({kind:'change',dishId:7,busy:false,locked:true}).action,'none')
 assert.equal(action({kind:'change',dishId:7,busy:false,locked:false}).action,'replace')
 assert.equal(action({kind:'quicker',dishId:7,busy:false,locked:false}).action,'open_time')
 for(const input of [{kind:'keep',dishId:0},{kind:'forget',dishId:7},{kind:'quicker',dishId:7,busy:true}])assert.equal(action(input).action,'none')
})
test('feedback dispatch uses current dish, guards stale items and does not edit long-term preferences',async()=>{
 const {fixture,target}=require('./fixtures/workspace-flow'),f=fixture(),page=f.createPage();await page.initializeWorkspace(target)
 assert.equal(typeof page.onDishFeedback,'function')
 const calls=[];page.onKeep=e=>calls.push(['keep',e.currentTarget.dataset]);page.onReplace=e=>calls.push(['replace',e.detail]);page.onOpenMealSettings=()=>calls.push(['time'])
 const id=page.data.draft.dishes[0].id
 page.onDishFeedback({detail:{kind:'keep',dishId:id}});assert.equal(calls.length,1)
 page.onDishFeedback({detail:{kind:'quicker',dishId:id}});assert.deepEqual(calls[1],['time'])
 page.onDishFeedback({detail:{kind:'keep',dishId:999999}});assert.equal(calls.length,2)
 page.data.busy=true;page.onDishFeedback({detail:{kind:'change',dishId:id}});assert.equal(calls.length,2)
 page.onUnload()
})
test('meal commands retain explicitly kept dishes rather than clearing locks',()=>{
 const {interactionCommand}=require('../utils/meal-action-feedback')
 for(const kind of ['generate','regenerate','replace','select','undo'])assert.notEqual(interactionCommand(kind).releaseLegacyLocks,true)
})
test('feedback keeps the original busy and unknown-result safeguards',async t=>{
 const {fixture,target,deferred}=require('./fixtures/workspace-flow'),f=fixture(),page=f.createPage();t.after(()=>page.onUnload());await page.initializeWorkspace(target)
 const wait=deferred();let count=0;f.api.commandMealWorkspace=async()=>{count++;await wait.promise;throw {statusCode:503}}
 const original=JSON.stringify(page.data.draft.dishes),first=page.onDishFeedback({detail:{kind:'change',dishId:7}})
 await new Promise(r=>setImmediate(r));await page.onDishFeedback({detail:{kind:'change',dishId:7}});assert.equal(count,1)
 wait.resolve();await first;assert.equal(JSON.stringify(page.data.draft.dishes),original);assert.equal(page.store.state().syncStatus,'unknown')
})
test('dish feedback callback cannot act on a recycled row or a busy card',()=>{
 const vm=require('node:vm');let definition,options;const events=[]
 vm.runInNewContext(fs.readFileSync('components/compact-dish-row/index.js','utf8'),{Component:v=>definition=v,wx:{showActionSheet:v=>options=v},require:key=>key.endsWith('ui-tokens')?{}:key.endsWith('experience-preferences')?()=>({get:()=>({})}):{}})
 const row={properties:{mode:'replace',dish:{id:7},busy:false,disabled:false},_imageIdentity:'7',triggerEvent:(...args)=>events.push(args)}
 definition.methods.onFeedback.call(row);row.properties.dish={id:8};row._imageIdentity='8';options.success({tapIndex:0});options.complete();assert.equal(events.length,0)
 row.properties.dish={id:7};row._imageIdentity='7';definition.methods.onFeedback.call(row);row.properties.busy=true;options.success({tapIndex:1});options.complete();assert.equal(events.length,0)
 row.properties.busy=false;definition.methods.onFeedback.call(row);options.success({tapIndex:2});options.complete();assert.equal(events[0][0],'feedback');assert.equal(events[0][1].kind,'quicker')
})
