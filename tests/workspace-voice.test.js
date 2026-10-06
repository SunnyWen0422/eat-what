const test=require('node:test'),assert=require('node:assert/strict')
test('voice transcription stays editable and canceled or late text cannot change another meal', async()=>{
 const {createVoiceHandlers}=require('../utils/workspace-voice');let options,submits=0
 class Transport {constructor(o){options=o}async start(){options.onPhase('recording')}stop(){options.onComplete('番茄和鸡蛋')}cancel(){}}
 global.wx={authorize:o=>o.success(),showToast(){},getRecorderManager(){},connectSocket(){}}
 const view={_alive:true,data:{context:{date:'2026-10-06',mealType:'dinner'},requirementsDraft:'清淡',busy:false},current:()=>true,setData(v){Object.assign(this.data,v)},onApplyRequirements(){submits++}}
 Object.assign(view,createVoiceHandlers({createVoiceSession:async()=>({})},Transport,true));await view.onVoiceTap();options.onText('不吃花生');assert.equal(view.data.requirementsDraft,'清淡 不吃花生');assert.equal(submits,0)
 view.cancelVoiceInput();assert.equal(view.data.requirementsDraft,'清淡');options.onComplete('迟到文本');assert.equal(view.data.requirementsDraft,'清淡')
 await view.onVoiceTap();view.data.context.mealType='lunch';options.onText('上一餐');assert.equal(view.data.requirementsDraft,'清淡');view.cancelVoiceInput();delete global.wx
})
test('the current voice button opens the requested unavailable modal without requesting permission or a session', async()=>{
 const {createVoiceHandlers}=require('../utils/workspace-voice');let modal,calls=0
 global.wx={showModal:o=>modal=o,authorize:()=>calls++}
 const view={current:()=>true,data:{busy:false,context:{}}};Object.assign(view,createVoiceHandlers({createVoiceSession:()=>calls++}))
 await view.onVoiceTap();assert.equal(modal.content,'抱歉，该功能暂不可用');assert.equal(calls,0);delete global.wx
})
