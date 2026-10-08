const api = require('../../utils/api')
const {getUserStorageKey} = require('../../utils/util')
const {mealsFromSession} = require('../../utils/legacy-meal-import')
Page({
  data: {fontBase:require('../../utils/font-scale').base,fontScale:require('../../utils/font-scale')(),sessions:[],messages:[],meals:[],sessionId:'',nextCursor:null,loading:false,errorMessage:''},
  onLoad(options={}) { this._alive=true;this._target=options },
  onUnload() { this._alive=false;this._epoch=(this._epoch||0)+1 },
  current(scope,epoch) { return this._alive && scope===getUserStorageKey('assistantHistory') && epoch===this._epoch },
  async onShow() { return this.readHistory(false) },
  onCurrentMeal(){if(this._alive)wx.switchTab({url:'/pages/index/index'})},
  onMore() { if(this.data.nextCursor&&!this.data.loading)return this.readHistory(true) },
  async readHistory(more) {
    const scope=getUserStorageKey('assistantHistory'),epoch=this._epoch=(this._epoch||0)+1
    if(scope!==this._scope||!more)this.setData({sessions:[],messages:[],meals:[],sessionId:'',nextCursor:null})
    this._scope=scope;this.setData({loading:true,errorMessage:''})
    try {
      const response=await api.getAssistantSessions({cursor:more?this.data.nextCursor:null,limit:20})
      if(!this.current(scope,epoch))return
      const byId=new Map((more?this.data.sessions:[]).map(s=>[s.sessionId,s]))
      for(const session of response.sessions||[])byId.set(session.sessionId,{...session,label:new Date(session.updatedAt*1000).toLocaleString('zh-CN')})
      this.setData({sessions:[...byId.values()],nextCursor:response.nextCursor||null})
    } catch(error) {if(this.current(scope,epoch))this.setData({errorMessage:error.message||'历史暂未读取，请重试'})}
    finally {if(this.current(scope,epoch))this.setData({loading:false})}
  },
  async onOpenSession(e) {
    const id=e.currentTarget.dataset.id,scope=this._scope,epoch=this._epoch=(this._epoch||0)+1
    if(!this.data.sessions.some(s=>s.sessionId===id))return
    this.setData({loading:true,errorMessage:'',sessionId:id,messages:[],meals:[]})
    try {
      const session=await api.getAssistantSession(id)
      if(!this.current(scope,epoch)||session.session_id!==id)return
      this.setData({messages:(session.messages||[]).filter(m=>['user','assistant'].includes(m.role)).map(m=>({role:m.role,content:String(m.content||'')})),meals:mealsFromSession(session)})
    } catch(error) {if(this.current(scope,epoch))this.setData({errorMessage:error.message||'会话已失效或暂不可读'})}
    finally {if(this.current(scope,epoch))this.setData({loading:false})}
  },
  async onImportMeal(e) {
    const meal=this.data.meals[Number(e.currentTarget.dataset.index)],id=this.data.sessionId,scope=this._scope,epoch=this._epoch
    if(!meal||this.data.loading||!this.current(scope,epoch))return
    this.setData({loading:true,errorMessage:''})
    try {
      const latest=await api.getAssistantSession(id)
      if(!this.current(scope,epoch)||latest.session_id!==id)return
      const fresh=mealsFromSession(latest).find(m=>m.date===meal.date&&m.mealType===meal.mealType)
      if(!fresh||fresh.version!==meal.version){this.setData({meals:mealsFromSession(latest)});throw Error('旧草稿已更新，请重新核对后导入')}
      wx.setStorageSync(getUserStorageKey('pendingLegacyMealImport'),{sessionId:id,date:meal.date,mealType:meal.mealType,planVersion:meal.version})
      wx.navigateTo({url:`/pages/chat/chat?date=${meal.date}&mealType=${meal.mealType}&import=history`})
    } catch(error) {if(this.current(scope,epoch))this.setData({errorMessage:error.message||'导入未准备好，旧草稿仍保留'})}
    finally {if(this.current(scope,epoch))this.setData({loading:false})}
  },
})
