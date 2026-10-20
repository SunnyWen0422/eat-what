const test=require('node:test'),assert=require('node:assert/strict')
const {buildAssistantWorkspaceFeedback:present}=require('../utils/assistant-presentation')
const assistantPage=require('../utils/assistant-page')

test('normal updates stay quiet; actual restoration and cancellation use short retention notices',()=>{
 assert.equal(present(),'')
 for(const state of ['pending','success'])assert.equal(present({feedback:{state,kind:'generate',message:'本餐菜单已更新'}}),'')
 const undo={state:'success',kind:'undo',requestId:'undo-1',message:'已恢复番茄炒蛋'}
 assert.equal(present({feedback:undo}),'已恢复上一版菜单')
 assert.equal(present({feedback:undo,busy:true}),'')
 assert.equal(present({feedback:undo,stale:true}),'')
 assert.equal(present({feedback:{state:'success',kind:'cancel',message:'已停止，原菜单仍保留'}}),'已保留原菜单')
})

test('specific errors and unknown outcomes remain actionable instead of claiming retention',()=>{
 assert.equal(present({error:'菜单保存失败，请重试'}),'菜单保存失败，请重试')
 for(const state of ['error','unknown'])assert.equal(present({feedback:{state,message:'菜单尚未确认完成，请核对原请求'},busy:true,stale:true}),'菜单更新结果暂未确认，请查看处理结果')
})

test('restoration feedback expires on a later user request and a new undo can show again',()=>{
 const page=assistantPage({data:{}})
 page.current=()=>true
 page.setData=patch=>Object.assign(page.data,patch)
 page.store={state:()=>({workspace:{id:'workspace-1',context:{},draft:{dishes:[]}},syncStatus:'synced'})}
 page.data.actionFeedback={state:'success',kind:'undo',requestId:'undo-1',message:'已恢复上一版菜单'}
 const first={sessionId:'session-1',messages:[{id:'user-1',role:'user'}]}
 page.refreshConversationMenus(first)
 assert.equal(page.data.conversationWorkspaceFeedback,'已恢复上一版菜单')
 const next={...first,messages:[...first.messages,{id:'user-2',role:'user'}]}
 page.refreshConversationMenus({...next,busy:true})
 assert.equal(page.data.conversationWorkspaceFeedback,'')
 page.refreshConversationMenus(next)
 assert.equal(page.data.conversationWorkspaceFeedback,'')
 page.data.actionFeedback={...page.data.actionFeedback,requestId:'undo-2'}
 page.refreshConversationMenus(next)
 assert.equal(page.data.conversationWorkspaceFeedback,'已恢复上一版菜单')
 page.data.actionFeedback=null;page.refreshConversationMenus(next)
 assert.equal(page.data.conversationWorkspaceFeedback,'')
})
