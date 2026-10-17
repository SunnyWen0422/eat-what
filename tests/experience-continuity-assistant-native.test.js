const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
const {createRequire}=require('node:module')
const file=path.resolve(__dirname,'../scripts/acceptance/experience-continuity-native.cjs')
const context={require:createRequire(file),module:{exports:{}},__dirname:path.dirname(file),process,console,setTimeout,clearTimeout}
vm.runInNewContext(fs.readFileSync(file,'utf8')+'\nmodule.exports.inspect=assistantCardEvidence',context)

function scenario(active=true) {
 const target={currentTarget:{date:'2026-10-17',mealType:'lunch'},historicalTarget:{date:'2026-10-16',mealType:'dinner'},previewTarget:{date:'2026-10-18',mealType:'lunch'}}
 const element={size:async()=>({width:280,height:48}),offset:async()=>({left:16,top:100}),style:async()=> '32px'}
 const action={data:async()=> '确认保存计划',$:async()=>element}
 const host=(card,view)=>({data:async key=>({card,view,active:card.active})[key],$:async()=>element,$$:async selector=>selector==='.card-action'&&card.active?[action]:[]})
 const historical=host({type:'receipt',receiptRef:{id:'saved'},active:false},{targetLabel:'2026-10-16 晚餐',canConfirm:false})
 const stale=host({type:'calendar_save',active:false},{targetLabel:'2026-10-16 晚餐',canConfirm:true})
 const pending=host({type:'calendar_save',active},{targetLabel:'2026-10-18 午餐',canConfirm:true})
 const current=host({id:'current-menu',type:'menu'},{targetLabel:'2026-10-17 午餐',menuActions:{current:true,enabled:false}})
 let expanded=false
 const selectors=[],calls=[]
 const scroll={size:async()=>({width:320,height:300}),offset:async()=>({left:0,top:0}),scrollTo:async()=>{}}
 const page={$:async()=>scroll,$$:async selector=>{
  selectors.push(selector)
  // This is the registered tag observed in native outerWxml; aliases return none.
  return selector==='components\\/assistant-card\\/index'?[stale,historical,pending,...(expanded?[current]:[])]:[]
 },data:async key=>({fontBase:16,fontScale:2,conversationScrollTarget:''})[key]}
 const mini={evaluate:async()=>({scrollTop:0}),screenshot:async()=>{}}
 const call=async method=>{calls.push(method);assert.equal(method,'onConversationCurrentMenu');expanded=true}
 return {target,page,mini,call,selectors,calls}
}

test('native card inspection distinguishes stale preview, actual receipt, and active target without confirming',async()=>{
 const s=scenario(),result=await context.module.exports.inspect(s.mini,s.page,s.call,'C:/owned-native',320,s.target)
 assert.equal(result.status,'observed')
 assert.equal(result.cards[1].target,'2026-10-18 午餐')
 assert.equal(result.cards[0].receiptPresent,true)
 assert.equal(result.previewNeverConfirmed,true)
 assert.equal(result.confirmReachable,true)
 assert.equal(result.current.anchorReached,true)
 assert.equal(result.current.scrollTarget,'')
 assert.deepEqual(s.calls,['onConversationCurrentMenu'])
 assert.ok(s.selectors.every(v=>v==='components\\/assistant-card\\/index'))
})

test('an inactive historical preview cannot stand in for a current confirmation',async()=>{
 const s=scenario(false)
 await assert.rejects(context.module.exports.inspect(s.mini,s.page,s.call,'C:/owned-native',320,s.target),/unconfirmed preview card absent/)
 assert.deepEqual(s.calls,[])
})
