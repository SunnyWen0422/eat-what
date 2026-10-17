const {safeText}=require('./assistant-cards')
const meals={breakfast:'早餐',lunch:'午餐',dinner:'晚餐'}
const states={queued:'等待处理',running:'正在处理',needs_input:'待补充条件',awaiting_confirmation:'待确认',completed:'已结束',partially_completed:'部分步骤已完成',failed:'本次未完成',cancelled:'已停止'}
function presentHistorySession(session){
 const s=session||{},target=s.target,meal=target&&meals[target.mealType],context=target&&meal?`${target.date} · ${meal}`:'餐桌对话'
 const title=safeText(s.title).replace(/[\r\n]+/g,' ').trim().slice(0,48)
 let preview=safeText(s.preview).replace(/[\r\n]+/g,' ').trim().slice(0,120)
 if(s.hasPending||['queued','running','awaiting_confirmation'].includes(s.lastStatus))preview=s.lastStatus==='awaiting_confirmation'?'等待你核对并确认，尚未执行这一步。':'还有未完成的操作，可进入核对。'
 if(s.lastStatus==='partially_completed')preview='部分步骤已完成，进入查看剩余事项。'
 return {...s,label:title||context,contextLabel:title?context:'',preview,statusLabel:states[s.lastStatus]||'',timeLabel:Number.isFinite(Number(s.updatedAt))?new Date(Number(s.updatedAt)).toLocaleString('zh-CN'):''}
}
module.exports={presentHistorySession}
