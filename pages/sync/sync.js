const { getUserStorageKey } = require('../../utils/util')
const store = require('../../utils/shopping-list')
const flow = require('../../utils/meal-workflow')
Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(), workspaceDrafts: [], pendingSync: [], shoppingDraftCount: 0, syncing: false, errorMessage: '', syncResult: { success: 0, failed: 0 } },
  onShow() { this.loadPendingSync() },
  onUnload() { this._unloaded = true },
  loadPendingSync() {
    const scope = getUserStorageKey('recipeRecords')
    if (this._viewScope !== scope) this.setData({ syncing: false, errorMessage: '', syncResult: { success: 0, failed: 0 } })
    this._viewScope = scope; this._planOwnerScope = getUserStorageKey('mealView')
    const records = wx.getStorageSync(getUserStorageKey('recipeRecords')) || {}, pending = []
    for (const date of Object.keys(records)) for (const mealType of Object.keys(records[date])) {
      const record = records[date][mealType]
      if (record && !record.synced) pending.push({ date, mealType, record, mealName: flow.mealNames[mealType] || mealType })
    }
    const identity=require('../../utils/util').getCurrentUserIdentity()
    const prefix=`user:${identity}:meal-workspace:`
    const workspaceDrafts=[]
    if(wx.getStorageInfoSync) for(const key of wx.getStorageInfoSync().keys || []) {
      if(!key.startsWith(prefix))continue
      const draft=wx.getStorageSync(key)
      if(!draft || !(draft.dirty || draft.pending || ['offline','unknown','conflict'].includes(draft.syncStatus)))continue
      const parts=key.slice(prefix.length).split(':');if(parts.length!==2)continue
      workspaceDrafts.push({date:parts[0],mealType:parts[1],mealName:flow.mealNames[parts[1]] || parts[1],label:draft.pending?'保存结果待确认':draft.syncStatus==='conflict'?'版本冲突':'本机输入未同步'})
    }
    this.setData({ workspaceDrafts, pendingSync: pending, shoppingDraftCount: store.loadPendingOperations().length })
  },
  async syncData() {
    if (this.data.syncing || !this.data.pendingSync.length) return
    if (this._viewScope !== getUserStorageKey('recipeRecords')) { this.loadPendingSync(); return }
    if (!(wx.getStorageSync('userInfo') || {}).id) return this.setData({ errorMessage: '请先登录，再确认本机草稿要保存到哪个账号。' })
    const scope = getUserStorageKey('recipeRecords'), records = wx.getStorageSync(scope) || {}
    this.setData({ syncing: true, errorMessage: '', syncResult: { success: 0, failed: 0 } })
    try {
      for (const item of this.data.pendingSync) {
        if (scope !== getUserStorageKey('recipeRecords') || this._unloaded) return
        const approved = await new Promise(resolve => wx.showModal({ title: '确认历史安排草稿', content: `${item.date} ${item.mealName}\n${item.record.name || '本机安排'}\n仅保存为计划，不代表吃过。`, success: result => resolve(result.confirm), fail: () => resolve(false) }))
        if (scope !== getUserStorageKey('recipeRecords') || this._unloaded) return
        if (!approved) continue
        const saved = await require('../../utils/plan-save').savePlan(this,item.date,item.mealType,{ recipeName: item.record.name || '历史安排', dishIds: (item.record.dishes || []).map(dish => Number(dish.id)).filter(Boolean), isManual: item.record.manual ? 1 : 0, targetPeople: Number(item.record.people) || 2 })
        if (!saved || scope !== getUserStorageKey('recipeRecords') || this._unloaded) continue
        records[item.date][item.mealType].synced = true; wx.setStorageSync(scope,records)
        this.setData({ 'syncResult.success': this.data.syncResult.success + 1 })
      }
    } catch (error) { if (scope === getUserStorageKey('recipeRecords') && !this._unloaded) this.setData({ 'syncResult.failed': this.data.syncResult.failed + 1, errorMessage: flow.errorMessage(error, '同步未完成，尚未确认的草稿仍然保留。') }) }
    finally { if (scope === getUserStorageKey('recipeRecords') && !this._unloaded) { this.setData({ syncing: false }); this.loadPendingSync() } }
  },
  onWorkspaceDraft(e) {
    if(this._viewScope !== getUserStorageKey('recipeRecords'))return this.loadPendingSync()
    const row=this.data.workspaceDrafts[Number(e.currentTarget.dataset.index)];if(!row)return
    wx.setStorageSync(getUserStorageKey('activeMealTarget'),{date:row.date,mealType:row.mealType})
    wx.navigateTo({url:`/pages/result/result?date=${row.date}&mealType=${row.mealType}`})
  },
  onShoppingDrafts() { wx.navigateTo({ url: '/pages/shopping-list/shopping-list' }) },
  clearSyncedData() {
    const owner=getUserStorageKey('recipeRecords')
    wx.showModal({ title: '清理已确认的本机副本？', content: '云端记录和未确认草稿会保留。', success: result => {
      if (!result.confirm || this.data.syncing || owner!==getUserStorageKey('recipeRecords') || this._unloaded) return
      const scope = getUserStorageKey('recipeRecords'), records = wx.getStorageSync(scope) || {}, remaining = {}
      for (const date of Object.keys(records)) for (const meal of Object.keys(records[date])) if (!records[date][meal].synced) { if (!remaining[date]) remaining[date] = {}; remaining[date][meal] = records[date][meal] }
      wx.setStorageSync(scope,remaining); this.loadPendingSync()
    } })
  },
})
