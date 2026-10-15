const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const build=fs.existsSync('utils/assistant-presentation.js')?require('../utils/assistant-presentation').buildAssistantSuggestions:null
test('suggestions depend on capability and current menu',()=>{
 assert.equal(typeof build,'function')
 assert.deepEqual(build({available:false,hasMenu:true}),[])
 assert.deepEqual(build({available:true,hasMenu:false}).map(s=>s.id),['arrange','arrangements'])
 assert.equal(build({available:true,hasMenu:true}).length,4)
})
test('shortcut prefills without sending, cancellation preserves input, busy and changed scope are guarded',()=>{
 const page=require('../utils/assistant-page')({data:{}})
 let state={input:'',busy:false},sets=0,dialog;global.wx={showModal:o=>dialog=o}
 Object.assign(page,{_assistantAlive:true,_scope:'A',current:()=>true,setData(v){Object.assign(this.data,v)},conversation:{state:()=>state,setInput:text=>{state={...state,input:text};sets++}}})
 Object.assign(page.data,{assistantConnected:true,conversationCurrentMenu:{},conversationMessages:[]})
 assert.equal(typeof page.onConversationSuggestion,'function')
 page.onConversationSuggestion({currentTarget:{dataset:{id:'shopping'}}});assert.equal(state.input,'准备这餐的采购清单');assert.equal(sets,1)
 state={input:'我的原输入',busy:false};page.onConversationSuggestion({currentTarget:{dataset:{id:'arrange'}}});dialog.success({confirm:false});assert.equal(state.input,'我的原输入')
 page.onConversationSuggestion({currentTarget:{dataset:{id:'arrange'}}});page._scope='B';dialog.success({confirm:true});assert.equal(state.input,'我的原输入')
 state={input:'原请求',busy:false,recoverable:true};page.onConversationSuggestion({currentTarget:{dataset:{id:'arrange'}}});assert.equal(sets,1)
 state={input:'原请求',busy:false,turn:{status:'awaiting_confirmation'}};page.offerConversationInput('替换');assert.equal(sets,1)
 delete global.wx
})
