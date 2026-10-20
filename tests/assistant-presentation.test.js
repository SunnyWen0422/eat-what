const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const build=fs.existsSync('utils/assistant-presentation.js')?require('../utils/assistant-presentation').buildAssistantSuggestions:null
test('welcome always offers two recommendations, arrangements and actual diet review when available',()=>{
 assert.equal(typeof build,'function')
 assert.deepEqual(build({available:false,hasMenu:true}),[])
 const empty=build({available:true,hasMenu:false}),existing=build({available:true,hasMenu:true})
 assert.deepEqual(empty.map(s=>s.id),['arrange','light','arrangements','health'])
 assert.deepEqual(existing,empty)
 assert.match(empty[1].text,/清淡/)
 assert.match(empty[3].text,/今天实际/)
 assert.ok(empty.every(s=>s.label&&s.icon&&s.text))
})
test('shortcut prefills without sending, cancellation preserves input, busy and changed scope are guarded',()=>{
 const page=require('../utils/assistant-page')({data:{}})
 let state={input:'',busy:false},sets=0,dialog;global.wx={showModal:o=>dialog=o}
 Object.assign(page,{_assistantAlive:true,_scope:'A',current:()=>true,setData(v){Object.assign(this.data,v)},conversation:{state:()=>state,setInput:text=>{state={...state,input:text};sets++}}})
 Object.assign(page.data,{assistantConnected:true,conversationCurrentMenu:{},conversationMessages:[]})
 assert.equal(typeof page.onConversationSuggestion,'function')
 page.onConversationSuggestion({currentTarget:{dataset:{id:'health'}}});assert.equal(state.input,'看看我今天实际吃得是否均衡，有什么可以调整的？');assert.equal(sets,1)
 state={input:'我的原输入',busy:false};page.onConversationSuggestion({currentTarget:{dataset:{id:'arrange'}}});dialog.success({confirm:false});assert.equal(state.input,'我的原输入')
 page.onConversationSuggestion({currentTarget:{dataset:{id:'arrange'}}});page._scope='B';dialog.success({confirm:true});assert.equal(state.input,'我的原输入')
 state={input:'原请求',busy:false,recoverable:true};page.onConversationSuggestion({currentTarget:{dataset:{id:'arrange'}}});assert.equal(sets,1)
 state={input:'原请求',busy:false,turn:{status:'awaiting_confirmation'}};page.offerConversationInput('替换');assert.equal(sets,1)
 delete global.wx
})

test('all four rows prefill the matching request without starting model work',()=>{
 const page=require('../utils/assistant-page')({data:{}})
 let state={input:'',busy:false},sent=0
 Object.assign(page,{_assistantAlive:true,_scope:'A',current:()=>true,setData(v){Object.assign(this.data,v)},conversation:{state:()=>state,setInput:input=>state={...state,input},send:()=>sent++}})
 Object.assign(page.data,{assistantConnected:true,conversationMessages:[]})
 for(const suggestion of build({available:true,hasMenu:false})){
  state={input:'',busy:false}
  page.onConversationSuggestion({currentTarget:{dataset:{id:suggestion.id}}})
  assert.equal(state.input,suggestion.text)
 }
 assert.equal(sent,0)
 page.onConversationSuggestion({currentTarget:{dataset:{id:'unknown'}}})
 assert.equal(sent,0)
})
