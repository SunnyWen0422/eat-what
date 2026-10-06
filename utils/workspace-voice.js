const { RealtimeSpeech } = require('./tencent-asr')
function createVoiceHandlers(api, Transport = RealtimeSpeech, enabled = false) {
  return {
    voiceCurrent(run) { return !!run && run === this._voiceRun && this.current() && run.target === `${this.data.context.date}:${this.data.context.mealType}` },
    async onVoiceTap() {
      if (!enabled) return wx.showModal({ title: '提示', content: '抱歉，该功能暂不可用', showCancel: false })
      if (!this.current() || this.data.busy) return
      if (this._voiceRun) { if (this.data.voicePhase === 'recording') this._voiceRun.transport.stop(); return }
      if (!wx.getRecorderManager || !wx.connectSocket) return wx.showToast({ title: '请在微信中使用语音或键盘麦克风', icon: 'none' })
      if (!this.data.requirementsVisible && this.onOpenRequirements) this.onOpenRequirements()
      const run = { target: `${this.data.context.date}:${this.data.context.mealType}`, base: String(this.data.requirementsDraft || '') }
      if (run.base.length >= 2000) return wx.showToast({title:'请先缩短需求文字',icon:'none'})
      this._voiceRun = run; this.setData({ voicePhase: 'authorizing' })
      const finish = (text, error) => {
        if (!this.voiceCurrent(run)) { if(run.transport)run.transport.cancel();return }
        this.setData({ requirementsDraft: run.base + (run.base && text ? ' ' : '') + String(text || '').slice(0, 2000-run.base.length-(run.base?1:0)), voicePhase: 'idle' }); this._voiceRun = null
        wx.showToast({title:error?'语音中断，文字已保留，请核对':text?'已转成文字，核对后应用':'没有听清，请重试',icon:'none'})
      }
      const start = async () => {
        if (!this.voiceCurrent(run)) return
        run.transport = new Transport({ maxTextLength: 2000-run.base.length-(run.base?1:0),
          getTicket:async()=>{if(!this.voiceCurrent(run))throw Error('canceled');return api.createVoiceSession()},
          onPhase:phase=>{if(this.voiceCurrent(run))this.setData({voicePhase:phase})},
          onText:text=>{if(this.voiceCurrent(run))this.setData({requirementsDraft:run.base+(run.base&&text?' ':'')+text});else run.transport.cancel()},
          onComplete:text=>finish(text,false), onError:(code,text)=>finish(text,true) })
        try { await run.transport.start() } catch (_) { finish('',true) }
      }
      run.authorize = () => {
        if (!this.voiceCurrent(run)) return
        wx.authorize({scope:'scope.record',success:start,fail:()=>{if(this.voiceCurrent(run)){this.cancelVoiceInput();wx.showToast({title:'未开启麦克风，可继续打字',icon:'none'})}}})
      }
      if (wx.getPrivacySetting) wx.getPrivacySetting({success:result=>{if(!this.voiceCurrent(run))return;if(result.needAuthorization)this.setData({voicePrivacyVisible:true});else run.authorize()},fail:()=>finish('',true)})
      else run.authorize()
    },
    onVoicePrivacyAgree() {const run=this._voiceRun;if(this.voiceCurrent(run)){this.setData({voicePrivacyVisible:false});run.authorize()}},
    onVoicePrivacyOpen() {if(wx.openPrivacyContract)wx.openPrivacyContract({})},
    cancelVoiceInput() {const run=this._voiceRun;if(!run)return;const current=this.voiceCurrent(run);this._voiceRun=null;if(run.transport)run.transport.cancel();if(current)this.setData({requirementsDraft:run.base,voicePhase:'idle',voicePrivacyVisible:false})},
  }
}
module.exports = { createVoiceHandlers }
