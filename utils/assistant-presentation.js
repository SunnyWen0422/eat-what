const suggestions=[
 {id:'arrange',icon:'recipes',label:'帮我搭配这一餐',text:'按当前人数和要求安排这餐'},
 {id:'light',icon:'ingredient',label:'推荐清淡一点的',text:'按本餐人数和要求，推荐一份清淡的菜单'},
 {id:'arrangements',icon:'calendar',label:'查看现有安排',text:'看看我已有的用餐安排'},
 {id:'health',icon:'nutrition',label:'今天吃得健康吗',text:'看看我今天实际吃得是否均衡，有什么可以调整的？'},
]
function buildAssistantSuggestions({available}) {
 return available?suggestions.map(s=>({...s})):[]
}
// Keep request identities in the recovery machinery; explain outcomes in the UI.
const noticeText={
 '助手暂不可用，原请求仍保留，请稍后核对':'助手暂不可用，稍后可继续查看刚才的结果',
 '原请求结果还待核对，补充内容已保留':'暂未收到刚才的结果，补充内容已保留',
 '原请求还待核对，补充内容已保留':'暂未收到刚才的结果，补充内容已保留',
 '补充内容已保留，请核对原请求后继续':'补充内容已保留，查看刚才的结果后可以继续',
 '刚才的结果还待确认，请先恢复原请求':'暂未收到刚才的结果，请先查看处理结果',
 '结果暂未核对，原请求已保留，请稍后恢复':'暂时没有收到结果，可点击下方继续查看',
 '食材选择结果还待核对，请先恢复原请求':'暂未收到食材选择结果，请先查看处理结果',
 '刚才的保存结果还待核对，请先恢复原请求':'暂未收到保存结果，请先查看是否已保存',
 '上次食材选择还待核对，请先恢复原请求':'暂未收到食材选择结果，请先查看处理结果',
 '刚才的加入结果还待核对，请先恢复原请求':'暂未收到加入结果，请先查看清单是否已更新',
 '原请求结果待核对，请先恢复后再停止':'暂未收到处理结果，请先查看结果后再停止',
 '回执尚未匹配，请核对原请求':'菜单更新结果暂未确认，请查看处理结果',
 '本餐版本已变化，请核对原请求与最新菜单':'本餐菜单已更新，请查看最新菜单',
 '菜单尚未确认完成，请核对原请求':'菜单更新结果暂未确认，请查看处理结果',
 '操作回执与原请求不一致，请核对原请求':'菜单更新结果暂未确认，请查看处理结果',
 '原任务回执尚未匹配，请核对原请求':'菜单更新结果暂未确认，请查看处理结果',
}
function assistantNotice(text){return noticeText[text]||text||''}
function buildAssistantWorkspaceFeedback({error='',feedback,busy=false,stale=false}={}) {
 if(error)return assistantNotice(error)
 if(!feedback)return ''
 // Unresolved errors must remain actionable. Completed retention notices belong
 // only to the request in which they occurred, never to later conversations.
 if(['error','unknown'].includes(feedback.state))return assistantNotice(feedback.message)
 if(busy||stale||feedback.state!=='success')return ''
 if(feedback.kind==='undo')return '已恢复上一版菜单'
 if(feedback.kind==='cancel'&&feedback.message==='已停止，原菜单仍保留')return '已保留原菜单'
 return ''
}
const waitingCaptions={
 recommendation:['正在为您搭配这一餐','正在考虑适合本餐的搭配','还在为您整理菜单建议'],
 replacement:['正在为您考虑替换方案','正在整理这餐的调整建议','助手还在思考，请稍候'],
 arrangements:['正在为您整理用餐安排','正在准备您要查看的安排','助手还在思考，请稍候'],
 health:['正在为您整理今天的饮食回顾','正在考虑饮食搭配与调整建议','助手还在思考，请稍候'],
 shopping:['正在为您整理食材清单','正在处理您的采购需求','助手还在思考，请稍候'],
 general:['正在理解您的想法','正在为您整理答复','助手还在思考，请稍候'],
}
// These labels describe the request, not model intent routing or a server stage.
// Only the server's status/receipts determine what ran or has completed.
function buildAssistantWaitingPresentation({state={},frame=0}={}) {
 const messages=Array.isArray(state.messages)?state.messages:[],turn=state.turn||{}
 let user=null,userIndex=-1,turnIndex=-1
 messages.forEach((message,index)=>{
  if(message&&message.role==='user'){user=message;userIndex=index}
  if(message&&message.role==='assistant'&&turn.turnId&&(message.turnId===turn.turnId||message.id===turn.turnId))turnIndex=index
 })
 const requestKey=user&&user.id||turn.turnId||''
 const hidden={visible:false,animated:false,kind:'idle',label:'',captions:[],requestKey}
 const present=(kind,captions,animated=true)=>{
  const index=Number.isInteger(frame)&&frame>=0?frame%captions.length:0
  return {visible:true,animated,kind,label:captions[index],captions:captions.slice(),requestKey}
 }
 if(state.cancelling)return present('cancelling',['正在停止这次请求'],false)
 if(state.confirmationPending||state.selectionPending)return present('recovery',[state.busy?'正在查看处理结果':'暂未收到操作结果'],!!state.busy)
 if(!state.busy)return state.recoverable?present('recovery',['暂时没有收到结果'],false):hidden
 // A newly sent message can coexist with the previous terminal turn until its
 // request ID has been acknowledged. Do not reuse that old terminal status.
 const freshRequest=turnIndex>=0&&userIndex>turnIndex
 if(!freshRequest&&['failed','cancelled','completed','partially_completed','needs_input'].includes(turn.status))return hidden
 if(!freshRequest&&turn.status==='awaiting_confirmation'){
  return (turn.cards||[]).some(card=>card&&card.data&&card.data.executionMode==='direct')
   ?present('action',['正在办理这次操作']):hidden
 }
 if(!freshRequest&&turn.status==='queued')return present('queued',['请求已排队，请稍候'])
 const text=user&&String(user.text||user.content||'')||''
 // Frontend keyword checks only choose waiting copy; they never select tools,
 // change arguments, rewrite the sent message or trigger an extra request.
 let kind='general'
 if(/健康|均衡|营养|饮食回顾|吃得怎么样/.test(text))kind='health'
 else if(/购物|采购|清单|买什么|买哪些/.test(text))kind='shopping'
 else if(/换.{0,8}(菜|道)|替换|换成/.test(text))kind='replacement'
 else if(/(看|查|已有|现有|原有).{0,12}(安排|日历|计划)|已安排/.test(text))kind='arrangements'
 else if(/推荐|搭配|菜单|安排.{0,8}(餐|吃)|吃什么/.test(text))kind='recommendation'
 return present(kind,waitingCaptions[kind])
}
function buildAssistantFailurePresentation({state={}}={}) {
 const result={error:state.error||'',suppressMessageIds:[]},turn=state.turn
 if(!turn||turn.status!=='failed'||turn.retryable!==true||state.busy||state.recoverable||state.confirmationPending||state.selectionPending)return result
 const reply='本次处理未完成，请重新发送；已有内容仍保留'
 if(turn.reply!==reply||state.error!=='这次未完成，输入已保留，可以调整后再发'||(turn.cards||[]).length||(turn.continuation&&turn.continuation.steps||[]).length)return result
 const messages=Array.isArray(state.messages)?state.messages:[]
 const last=messages[messages.length-1]
 if(!last||last.role!=='assistant'||(last.turnId!==turn.turnId&&last.id!==turn.turnId)||(last.text||last.content)!==reply||(last.cards||[]).length||(last.workflow||[]).length||!last.id)return result
 // Keep persisted messages intact. Only this current duplicate placeholder is
 // omitted from the view; a receipt, specific error or historical reply remains.
 return {error:typeof state.input==='string'&&state.input.trim()?'已保留本次输入':'这次未完成，可以重新发送',suppressMessageIds:[last.id]}
}
// Source explanation only. Java still resolves and validates effective constraints.
function buildAssistantContextSummary({workspace,preferencesSnapshot,options,preferencesState}={}) {
 const context=workspace&&workspace.context||{},mealRows=[],savedRows=[]
 const short=value=>value.length>200?value.slice(0,200)+'…':value
 const text=value=>typeof value==='string'?short(value.replace(/[\x00-\x1f\x7f]/g,' ').trim()):''
 const labels={...require('./recommendation-criteria').CODE_LABELS}
 Object.values(options&&options.groups||{}).forEach(group=>(Array.isArray(group)?group:[]).forEach(item=>{if(item&&item.code&&item.label)labels[item.code]=text(item.label)}))
 const list=(values,codes=false)=>short([...new Set((Array.isArray(values)?values:[]).slice(0,30).map(value=>text(codes?labels[value]||value:value)).filter(Boolean))].join('、'))
 const add=(rows,id,label,value)=>{if(value)rows.push({id,label,text:value})}
 const minutes=value=>Number.isInteger(value)&&value>0?value:null
 const meal={breakfast:'早餐',lunch:'午餐',dinner:'晚餐'}[context.mealType]||'当前餐'
 const date=/^\d{4}-\d{2}-\d{2}$/.test(context.date||'')?context.date:'日期待核对'
 const people=Number.isInteger(context.people)&&context.people>=1&&context.people<=50?` · ${context.people}人`:''
 add(mealRows,'requirements','本餐要求',text(context.requirements)||'未添加')
 if(context.counts)add(mealRows,'composition','菜品搭配',require('./meal-composition').compositionSummary(context))
 add(mealRows,'owned','手边食材',list(context.ownedIngredients))
 if(minutes(context.totalCookMinutes))add(mealRows,'total-time','时间输入',`整餐用时上限 ${context.totalCookMinutes} 分钟`)
 const criteria=context.criteria||{}
 add(mealRows,'cuisines','本餐菜系',list(criteria.cuisineCodes,true))
 add(mealRows,'include','本餐筛选',list(criteria.includeTagCodes,true))
 add(mealRows,'exclude','本餐排除',list([...(criteria.excludedIngredients||[]),...(criteria.excludeTagCodes||[]).map(code=>labels[code]||code)]))
 if(minutes(criteria.maxCookMinutes))add(mealRows,'dish-time','本餐单菜上限',`单菜最多 ${criteria.maxCookMinutes} 分钟`)
 let unavailableLabel=''
 if(preferencesState!=='ready'||!preferencesSnapshot)unavailableLabel=preferencesState==='loading'?'正在读取已保存偏好':'已保存偏好暂未读到，请到长期偏好页核对'
 else {
  const saved=preferencesSnapshot
  add(savedRows,'hard-exclusions','长期忌口',list([...(saved.excludedIngredients||[]),...(saved.excludedTagCodes||[]).map(code=>labels[code]||code)])||'未设置长期忌口')
  add(savedRows,'saved-cuisines','常用菜系',list(saved.preferredCuisineCodes,true))
  add(savedRows,'saved-tags','常用偏好',list(saved.preferredTagCodes,true))
  if(Number.isInteger(saved.defaultPeople)&&saved.defaultPeople>=1&&saved.defaultPeople<=50)add(savedRows,'saved-people','常用人数',`${saved.defaultPeople}人`)
  if(minutes(saved.maxCookMinutes))add(savedRows,'saved-time','长期单菜上限',`单菜最多 ${saved.maxCookMinutes} 分钟`)
  if(Number.isInteger(saved.avoidRecentDays)&&saved.avoidRecentDays>=0)add(savedRows,'saved-recent','菜品轮换',saved.avoidRecentDays?`最近${saved.avoidRecentDays}天不重复`:'不限制')
 }
 return {targetLabel:`${date} · ${meal}${people}`,mealRows,savedRows,unavailableLabel}
}
module.exports={buildAssistantSuggestions,buildAssistantContextSummary,buildAssistantWaitingPresentation,buildAssistantFailurePresentation,buildAssistantWorkspaceFeedback,assistantNotice}
