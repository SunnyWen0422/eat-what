const { getFavoriteDishes, removeFavoriteDish } = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')

Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(),
    favorites: [],
    filtered: [],
    loading: true,
    showMealSelected:false,mealSelectedDishes:[],selectedMeal:null,selectionFeedback:null,selectionBusy:false,selectionLoading:false,selectionBlocked:true,selectedList:[],showSelectedPanel:false,searchKeyword: '', errorMessage: '', removingId: null, addingId: null, mealAddError: ''
  },

  async onShow() {
    this._recipeVisible=true
    await this.loadFavorites()
    return this.refreshSelectedMeal()
  },
  onHide(){this._recipeVisible=false;clearTimeout(this._recipePoll)},

  async loadFavorites() {
    const epoch = this._epoch = (this._epoch || 0) + 1, scope = getUserStorageKey('favoriteView')
    if(this._viewScope !== scope){require('../../utils/dish-workspace-handoff').disposeSelectionPage(this);this.setData({showMealSelected:false,mealSelectedDishes:[],selectedMeal:null,selectionFeedback:null,selectionBusy:false,showSelectedPanel:false, favorites: [], filtered: [], removingId: null, addingId: null, mealAddError: '', searchKeyword: '' })}
    this._viewScope = scope
    this.setData({ loading: true, errorMessage: '' })
    try {
      const result = await getFavoriteDishes()
      if (epoch !== this._epoch || scope !== getUserStorageKey('favoriteView')) return
      // 兼容不同返回格式
      const list = Array.isArray(result) ? result : (result.list || result.data || [])
      const normalized = list.map(item => {
        const dish = item.dish || item
        return { id: dish.id, name: dish.name, type: dish.type, image: dish.image || '', dish: dish }
      })
      this.setData({ favorites: normalized, loading: false })
      this.doFilter()
    } catch (error) {
      if (epoch === this._epoch && scope === getUserStorageKey('favoriteView')) this.setData({ loading: false, errorMessage: require('../../utils/meal-workflow').errorMessage(error, '收藏读取失败，请重试') })
    }
  },

  onUnload() { require('../../utils/dish-workspace-handoff').disposeSelectionPage(this);this._unloaded=true;this._epoch = (this._epoch || 0) + 1 },
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
    this.doFilter()
  },

  doFilter() {
    const kw = this.data.searchKeyword.trim()
    const filtered = kw
      ? this.data.favorites.filter(f => f.name.includes(kw))
      : this.data.favorites
    const ids=this.data.selectedMeal && this.data.selectedMeal.dishIds || []
    this.setData({ filtered: filtered.map(dish=>({...dish,isSelected:ids.includes(Number(dish.id))})) })
  },

  onViewDish(e) {
    const dish = e.detail && e.detail.id ? {id:e.detail.id} : e.currentTarget.dataset.dish
    if (!dish || !dish.id) return
    wx.navigateTo({ url: `/pages/dish-detail/dish-detail?id=${dish.id}` })
  },

  async onAddToMeal(e) {
    const id=Number(e.detail && e.detail.id || e.currentTarget.dataset.id),scope=this._viewScope,epoch=this._epoch
    const current=()=>scope===getUserStorageKey('favoriteView')&&scope===this._viewScope&&epoch===this._epoch
    if(!Number.isSafeInteger(id)||id<1||this.data.addingId||!current())return
    if(this.data.selectedMeal && this.data.selectedMeal.dishIds.includes(id))return this.onViewMeal()
    if (this._recipeSelection) return require('../../utils/dish-workspace-handoff').changeSelectionPage(this, 'append', id, this.selectionOptions())
    this.setData({addingId:id,mealAddError:''})
    try{await require('../../utils/dish-workspace-handoff').addDishToWorkspace(id,{api:require('../../utils/api'),wx,storageKey:getUserStorageKey,current,session:this._recipeSelection});if(current()&&this._recipeSelection)require('../../utils/dish-workspace-handoff').renderSelectionPage(this)}
    catch(error){if(current())this.setData({mealAddError:error.message||'暂未加入，请重试'})}
    finally{if(current())this.setData({addingId:null})}
  },

  selectionOptions(){const scope=this._viewScope;return {api:require('../../utils/api'),wx,storageKey:getUserStorageKey,current:()=>!this._unloaded&&scope===this._viewScope&&scope===getUserStorageKey('favoriteView'),errorKey:'mealAddError'}},
  refreshSelectedMeal(){return require('../../utils/dish-workspace-handoff').refreshSelectionPage(this,this.selectionOptions())},
  onRetrySelection(){return require('../../utils/dish-workspace-handoff').changeSelectionPage(this,'recover',null,this.selectionOptions())},
  onViewMeal(){if(this.selectionOptions().current())return require('../../utils/dish-workspace-handoff').openSelectedMeal(this,wx)},
  onSaveToCalendar(){if(this.selectionOptions().current())return require('../../utils/dish-workspace-handoff').openSelectedMeal(this,wx,true)},
  onShowSelected(){if(this.selectionOptions().current())this.setData({showMealSelected:true})},
  onHideSelected(){this.setData({showSelectedPanel:false,showMealSelected:false})},
  onHideMealSelected(){this.setData({showMealSelected:false})},
  onRemoveMealDish(e){return this.onRemoveSelected(e)},
  onRemoveSelected(e){return require('../../utils/dish-workspace-handoff').changeSelectionPage(this,'remove',Number(e.currentTarget.dataset.id),this.selectionOptions())},
  onSelectedDish(e){if(this.selectionOptions().current())wx.navigateTo({url:'/pages/dish-detail/dish-detail?id='+Number(e.currentTarget.dataset.id)})},
  onContinueSelecting(){if(this.selectionOptions().current())wx.switchTab({url:'/pages/customize/customize'})},

  async onRemoveFavorite(e) {
    const dishId = e.currentTarget.dataset.id
    if (!dishId || this.data.removingId) return
    const scope = getUserStorageKey('favoriteView')
    wx.showModal({
      title: '确认取消收藏',
      content: '确定要取消收藏这道菜吗？',
      success: async (res) => {
        if (res.confirm && scope === getUserStorageKey('favoriteView') && scope === this._viewScope) {
          this.setData({ removingId: dishId })
          try {
            await removeFavoriteDish(dishId)
            if (scope !== getUserStorageKey('favoriteView')) return
            wx.showToast({ title: '已取消收藏', icon: 'success' })
            this.loadFavorites()
          } catch (err) {
            if (scope === getUserStorageKey('favoriteView')) wx.showToast({ title: '操作失败', icon: 'none' })
          } finally { if (scope === getUserStorageKey('favoriteView')) this.setData({ removingId: null }) }
        }
      }
    })
  },

  onBrowse() { wx.switchTab({ url: '/pages/customize/customize' }) },
  onShareAppMessage() {
    return { title: '我的收藏好菜', path: '/pages/index/index' }
  }
})
