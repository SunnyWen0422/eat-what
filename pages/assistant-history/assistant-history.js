const api = require('../../utils/api')
const {getUserStorageKey} = require('../../utils/util')
const {mealsFromSession} = require('../../utils/legacy-meal-import')
const flow = require('../../utils/meal-workflow')
Page({
  data: {fontBase:require('../../utils/font-scale').base,fontScale:require('../../utils/font-scale')(),canDeleteV4:typeof api.deleteAssistantV4Session==='function',v4Sessions:[],v4Messages:[],v4SessionId:'',v4NextCursor:null,legacyVisible:false,sessions:[],messages:[],meals:[],sessionId:'',nextCursor:null,loading:false,errorMessage:''},
  onLoad(options={}) { this._alive=true;this._target=options },
  onUnload() { this._alive=false;this._epoch=(this._epoch||0)+1 },
  current(scope,epoch) { return this._alive && scope===getUserStorageKey('assistantHistory') && epoch===this._epoch },
  async onShow() { return api.getAssistantV4Sessions?this.readV4(false):this.readHistory(false) },
  async readV4(more){
    const scope=getUserStorageKey('assistantHistory'),epoch=this._epoch=(this._epoch||0)+1
    if(scope!==this._scope||!more)this.setData({v4Sessions:[],v4Messages:[],v4SessionId:'',v4NextCursor:null,legacyVisible:false,sessions:[],messages:[],meals:[]})
    this._scope=scope;this.setData({loading:true,errorMessage:''})
    try{
      const response=await api.getAssistantV4Sessions({cursor:more?this.data.v4NextCursor:null,limit:20})
      if(!this.current(scope,epoch))return
      const byId=new Map((more?this.data.v4Sessions:[]).map(s=>[s.sessionId,s]))
      for(const s of response.sessions||[])byId.set(s.sessionId,require('../../utils/assistant-history').presentHistorySession(s))
      this.setData({v4Sessions:[...byId.values()],v4NextCursor:response.nextCursor||null})
    }catch(error){if(this.current(scope,epoch))this.setData({errorMessage:flow.errorMessage(error,'饮食助手记录暂未读到，请重新读取。')})}
    finally{if(this.current(scope,epoch))this.setData({loading:false})}
  },
  onV4More(){if(this.data.v4NextCursor&&!this.data.loading)return this.readV4(true)},
  async onOpenV4Session(e){
    const id=e.currentTarget.dataset.id,scope=this._scope,epoch=this._epoch=(this._epoch||0)+1
    if(!this.data.v4Sessions.some(s=>s.sessionId===id))return
    this.setData({loading:true,errorMessage:'',v4SessionId:id,v4Messages:[]})
    try{const session=await api.getAssistantV4Session(id);if(!this.current(scope,epoch)||session.sessionId!==id)return
      // The session already includes its latest turn. Never fetch each old card.
      const latest=session.latestTurn,rows=require('../../utils/assistant-workflow-presentation').presentWorkflow({turn:latest}).rows
      this.setData({v4Messages:(session.messages||[]).filter(m=>['user','assistant'].includes(m.role)).map(m=>({...m,text:require('../../utils/assistant-cards').safeText(m.text),workflow:latest&&m.role==='assistant'&&m.turnId===latest.turnId?rows:[]}))})
    }catch(error){if(this.current(scope,epoch))this.setData({errorMessage:flow.errorMessage(error,'这段对话暂未读到，请稍后再试。')})}
    finally{if(this.current(scope,epoch))this.setData({loading:false})}
  },
  async onContinueV4(e){
    const id=e.currentTarget.dataset.id,selected=this.data.v4Sessions.find(s=>s.sessionId===id)
    if(!selected||this.data.loading)return
    const scope=this._scope,epoch=this._epoch=(this._epoch||0)+1
    this.setData({loading:true,errorMessage:''})
    try{const latest=await api.getAssistantV4Session(id);if(!this.current(scope,epoch))return
      const ref=latest.workspaceRef,target=latest.target
      if(latest.sessionId!==id||!ref||!selected.workspaceRef||ref.workspaceId!==selected.workspaceRef.workspaceId||!target)throw Error('原餐次暂不可用，请先浏览记录')
      const checked=require('../../utils/meal-save-target').validateMealTarget(target)
      const origin=require('../../utils/assistant-origin').originQuery({kind:'history'},{storage:wx,storageKey:getUserStorageKey})
      wx.navigateTo({url:`/pages/chat/chat?sessionId=${encodeURIComponent(id)}&workspaceId=${encodeURIComponent(ref.workspaceId)}&date=${checked.date}&mealType=${checked.mealType}${origin}`})
    }catch(error){if(this.current(scope,epoch))this.setData({errorMessage:flow.errorMessage(error,'原餐次暂未读到，可以稍后继续。')})}
    finally{if(this.current(scope,epoch))this.setData({loading:false})}
  },
  onEnterV4(e){const selected=this.data.v4Sessions.find(s=>s.sessionId===e.currentTarget.dataset.id);return selected&&selected.target?this.onContinueV4(e):this.onOpenV4Session(e)},
  onHistoryMore(e){
    const id=e.currentTarget.dataset.id,selected=this.data.v4Sessions.find(s=>s.sessionId===id),scope=this._scope,epoch=this._epoch
    if(!selected||this.data.loading)return
    const removable=this.data.canDeleteV4&&!selected.hasPending
    wx.showActionSheet({itemList:removable?['查看记录','删除对话']:['查看记录'],success:result=>{if(!this.current(scope,epoch))return;return result.tapIndex===1&&removable?this.onDeleteV4(e):this.onOpenV4Session(e)}})
  },
  async onDeleteV4(e){
    const id=e.currentTarget.dataset.id,selected=this.data.v4Sessions.find(s=>s.sessionId===id),scope=this._scope,epoch=this._epoch
    if(!selected||selected.hasPending||this.data.loading||typeof api.deleteAssistantV4Session!=='function')return
    const confirmed=await new Promise(resolve=>wx.showModal({title:'删除这段对话？',content:'仅删除对话记录，日历安排、采购清单和实际用餐记录会保留。',confirmText:'删除对话',confirmColor:'#9B463B',success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
    if(!confirmed||!this.current(scope,epoch))return
    this.setData({loading:true,errorMessage:''})
    try{
      const latest=await api.getAssistantV4Session(id);if(!this.current(scope,epoch))return
      if(latest.sessionId!==id||latest.latestTurn&&['queued','running','awaiting_confirmation'].includes(latest.latestTurn.status))throw Error('请先进入对话核对未完成的操作')
      await api.deleteAssistantV4Session(id);if(!this.current(scope,epoch))return;this.setData({v4Sessions:this.data.v4Sessions.filter(s=>s.sessionId!==id),...(this.data.v4SessionId===id?{v4SessionId:'',v4Messages:[]}: {})})}
    catch(error){if(this.current(scope,epoch)){if(error.statusCode===404)this.setData({v4Sessions:this.data.v4Sessions.filter(s=>s.sessionId!==id),...(this.data.v4SessionId===id?{v4SessionId:'',v4Messages:[]}: {})});else this.setData({errorMessage:flow.errorMessage(error,'删除结果暂未确认，请重新读取后核对。')})}}
    finally{if(this.current(scope,epoch))this.setData({loading:false})}
  },
  onToggleLegacy(){this.setData({legacyVisible:!this.data.legacyVisible});if(this.data.legacyVisible&&!this.data.sessions.length)return this.readHistory(false)},
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
    } catch(error) {if(this.current(scope,epoch))this.setData({errorMessage:flow.errorMessage(error,'历史暂未读到，请重新读取。')})}
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
    } catch(error) {if(this.current(scope,epoch))this.setData({errorMessage:flow.errorMessage(error,'这段会话暂未读到，请重新读取。')})}
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
    } catch(error) {if(this.current(scope,epoch))this.setData({errorMessage:flow.errorMessage(error,'导入暂未完成，原草稿仍保留，请重新核对。')})}
    finally {if(this.current(scope,epoch))this.setData({loading:false})}
  },
})
