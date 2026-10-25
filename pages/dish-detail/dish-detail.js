const { getUserStorageKey } = require('../../utils/util')
// pages/dish-detail/dish-detail.js
const { getDishById } = require('../../utils/api')

Page({
  onAssistantReturn(){return require('../../utils/assistant-origin').returnFromPage(this)},
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(),
    dish: null, dishImageFailed: false, dishPlaceholderIcon: 'recipe', targetPeople: 2, ingredientNotice: '', canEditCustom: false,qualityView:null,quantityBusy:false,quantityError:'',
    showDetailMore: false, showCopyPreview: false, copyPreview: null, copyBusy: false, copyPending: false, copyError: '', copyMessage: '', detailActionHeight: 160,
    loading: true,
    error: false,
    showMealSelected:false,mealSelectedDishes:[],selectedMeal:null,selectionFeedback:null,selectionBusy:false,selectionLoading:false,selectionBlocked:true,mealPrimaryLabel:'加入本餐',showSelectedPanel:false,selectedList:[],detailError:'',errorKind:'',mealAddError:''
  },

  onLoad(options) {
    const handoff=options.handoffToken?require('../../utils/assistant-origin').receiveHandoff(this,options,['view_favorite'],{storage:wx,storageKey:getUserStorageKey}):null
    if(handoff)options={...options,id:handoff.ref.dishId}
    this._dishId = options.id
    const people = Number(options.people || 2)
    this.setData({ targetPeople: Number.isInteger(people) && people >= 1 && people <= 50 ? people : 2, ingredientNotice: '' })
    if (options.id) {
      // 等待登录完成再加载（分享进入时 app.onLaunch 可能未完成）
      this._loadAfterLogin(options.id)
    } else {
      this.setData({ loading: false, error: true, errorKind: 'unavailable', detailError: '未指定菜谱，请返回继续选菜' })
    }
  },

  async onShow() { if(this._assistantOrigin)require('../../utils/assistant-origin').refreshAssistantOrigin(this);
    this._recipeVisible = true
    // onShow must not await login: login can complete after this lifecycle ends.
    const initialization = this._detailInitialization
    if (initialization) {
      if (initialization.scope == null || initialization.scope === getUserStorageKey('dishView') && initialization.readEpoch === this._epoch) return
      // A visible reentry under a new owner/read epoch must not wait for the old request.
      this._loadAfterLogin(this._dishId)
      return
    }
    if (!getApp().globalData.loginReady || this._scope && this._scope !== getUserStorageKey('dishView')) {
      return this._loadAfterLogin(this._dishId)
    }
    return this.refreshSelectedMeal()
  },
  onHide() { this._recipeVisible=false;clearTimeout(this._recipePoll) },
  onReady() { this.measureDetailActions() },
  onResize() { this.measureDetailActions() },
  measureDetailActions() {
    if (this._unloaded || !wx.createSelectorQuery) return
    const measure = () => wx.createSelectorQuery().in(this).select('.detail-bottom').boundingClientRect(rect => {
      if (!this._unloaded && rect && rect.height > 0) this.setData({ detailActionHeight: Math.ceil(rect.height) + 16 })
    }).exec()
    if (wx.nextTick) wx.nextTick(measure); else measure()
  },
  onUnload() { require('../../utils/dish-workspace-handoff').disposeSelectionPage(this); this._detailInitialization = null; this._unloaded = true; this._epoch = (this._epoch || 0) + 1 },
  current(scope) { return !this._unloaded && scope === getUserStorageKey('dishView') },
  clearRecipeSelection() {
    if (this._recipeSelection) require('../../utils/dish-workspace-handoff').disposeSelectionPage(this)
    this.setData({selectedMeal:null,mealSelectedDishes:[],selectedIds:[],selectedList:[],selectedTotal:0,
      selectionFeedback:null,selectionBlocked:true,selectionBusy:false,selectionLoading:false,
      selectionError:'',mealAddError:'',mealPrimaryLabel:'加入本餐',isAddedToMeal:false,
      showSelectedPanel:false,showMealSelected:false})
  },
  async _loadAfterLogin(id) {
    const operation = this._detailInitialization = {}
    this.clearRecipeSelection()
    this.setData({dish:null,qualityView:null,loading:true})
    const owns = () => !this._unloaded && this._detailInitialization === operation
    try {
      const app = getApp()
      if (!app.globalData.loginReady) await app.waitForLogin()
      if (!owns()) return
      const scope = operation.scope = getUserStorageKey('dishView')
      const reading = this.loadDishDetail(id)
      operation.readEpoch = this._epoch
      await reading
      if (!owns() || !this.current(scope) || operation.readEpoch !== this._epoch) return
      if (this._recipeVisible) await this.refreshSelectedMeal()
    } catch (error) {
      if (owns()) this.setData({loading:false,error:true,detailError:'登录或菜谱暂未读到，请重试',errorKind:'network'})
    } finally {
      if (owns()) this._detailInitialization = null
    }
  },

  async loadDishDetail(id) {
    const scope = this._scope = getUserStorageKey('dishView'), epoch = this._epoch = (this._epoch || 0) + 1
    this._copyPreviewBinding = null
    this._quantityRequest = null
    this.setData({dish: null, qualityView:null,ingredientNotice:'',quantityBusy:false,quantityError:'',canEditCustom: false, copyBusy: false, copyPending: false, copyError: '', copyMessage: '', showCopyPreview: false, copyPreview: null, showDetailMore: false,detailError:'',errorKind:'' })
    try {
      this.setData({ loading: true, error: false })
      const dish = await getDishById(id)
      if (!this.current(scope) || epoch !== this._epoch) return
      
      if (dish) {
        dish.typeLabel = require('../../utils/recipe-quality').dishCategoryLabel(dish.type)
        dish.cookTimeDisplay = require('../../utils/recipe-quality').recipeDurationLabel(dish)
        dish.tagsList = (Array.isArray(dish.tags)?dish.tags:String(dish.tags||'').split(/[,，]/)).filter(t=>typeof t==='string'&&t.trim()).map(t=>t.trim())
        dish.visibleTags=dish.tagsList.slice(0,3)
        dish.cookingNotes=require('../../utils/recipe-display').recipeNotes(dish)
        // 处理步骤图片（如果是JSON字符串则解析，再按 # 拆分多张图）
        if (dish.stepImages && typeof dish.stepImages === 'string') {
          try {
            dish.stepImagesList = JSON.parse(dish.stepImages)
          } catch (e) {
            dish.stepImagesList = []
          }
        } else if (Array.isArray(dish.stepImages)) {
          dish.stepImagesList = dish.stepImages
        } else {
          dish.stepImagesList = []
        }
        // 每个步骤可能有 # 分隔的多张图
        dish.stepImagesFlat = dish.stepImagesList.map(s => {
          if (!s) return []
          return String(s).split('#').filter(u => u.trim().startsWith('http')).map(require('../../utils/dish-image').imageSource)
        })
        // 所有步骤图片汇总（按顺序平铺）
        dish.allStepImages = []
        dish.stepImagesFlat.forEach(arr => arr.forEach(url => dish.allStepImages.push(url)))

        // 处理食材与用量（如果是JSON字符串则解析）
        require('../../utils/canonical-recipe').recipeOf(dish)
        const ingredients=require('../../utils/recipe-display').presentRecipeIngredients(dish)
        dish.ingredientsList=ingredients.lines
        dish.ingredientRows=ingredients.rows
        const qualityView=require('../../utils/recipe-quality').presentRecipeQuality(dish)
        this.setData({qualityView,ingredientNotice:ingredients.basis})
        // 处理步骤（兼容 step/steps 两种字段名）
        dish.stepsList=require('../../utils/canonical-recipe').stepLines(dish,dish.scaledRecipe)
        dish.recipeFacts=require('../../utils/canonical-recipe').facts(dish)
        dish.optionalIngredients=require('../../utils/canonical-recipe').optionalRows(dish,dish.scaledRecipe)
        this._optionalOverrides={}
        // 展示图片使用已验证的 HTTPS 地址。
        dish.image = require('../../utils/dish-image').imageSource(dish.image)

        const user = wx.getStorageSync('userInfo') || {}
        const canEditCustom = !!user.id && dish.userId != null && String(dish.userId) === String(user.id)
        this.setData({ dish, dishImageFailed: false, dishPlaceholderIcon: require('../../utils/dish-image').placeholderIcon(dish.type), loading: false, canEditCustom }, () => this.measureDetailActions())
      } else {
        this.setData({ loading: false, error: true, errorKind:'unavailable',detailError:'这份菜谱已不可用，请返回继续选菜' })
      }
    } catch (err) {
      if (!this.current(scope) || epoch !== this._epoch) return
      console.error('加载菜品详情失败:', err)
      const errorKind=[401,403].includes(err.statusCode)?'permission':err.statusCode===410?'retired':err.statusCode===404?'unavailable':'network'
      this.setData({ loading: false, error: true, errorKind,detailError:errorKind==='retired'?'菜品已下架':errorKind==='permission'?'当前账号没有权限查看这份菜谱，请返回或切换到有权限的账号':errorKind==='unavailable'?'这份菜谱已不可用，请返回继续选菜':'菜谱暂未读到，请重试' })
    }
  },

  async loadMealQuantities(id, scope, epoch, optionalOverrides) {
    const canonical=require('../../utils/canonical-recipe'), currentDish=this.data.dish
    if(!currentDish)return
    const servings=null,serial=this._quantitySerial=(this._quantitySerial||0)+1
    this._quantityRequest={id,scope,epoch,optionalOverrides}
    this.setData({quantityBusy:true,quantityError:''})
    try {
      const scaled = await require('../../utils/api').getDishScale(id, servings, optionalOverrides)
      if (!this.current(scope) || epoch !== this._epoch || serial!==this._quantitySerial) return
      const dish=this.data.dish, canonical=require('../../utils/canonical-recipe')
      if (Number(scaled.recipeId)!==Number(id) || scaled.catalogRevision!==dish.catalogRevision || scaled.contentVersion && scaled.contentVersion!==dish.contentVersion) throw Error('菜谱版本已变化，请重新读取')
      canonical.fixedCalculation(scaled,servings)
      const rows=canonical.ingredientRows(dish,scaled)
      this._optionalOverrides=optionalOverrides || this._optionalOverrides || {}
      this.setData({ 'dish.scaledRecipe':scaled,'dish.ingredientRows':rows,'dish.optionalIngredients':canonical.optionalRows(dish,scaled),'dish.recipeFacts':canonical.facts({...dish,scaledRecipe:scaled}),'dish.ingredientsList':rows.map(require('../../utils/recipe-display').ingredientLine),'dish.stepsList':canonical.stepLines(dish,scaled),qualityView:canonical.nutritionView(scaled),ingredientNotice:canonical.servingLabel(dish,scaled) })
    } catch (error) {
      if (this.current(scope) && epoch === this._epoch && serial===this._quantitySerial) this.setData({quantityError:'用量更新未完成，仍显示上次结果，请重试'})
    } finally {
      if(this.current(scope) && epoch===this._epoch && serial===this._quantitySerial)this.setData({quantityBusy:false})
    }
  },
  onToggleOptional(event) {
    const dish=this.data.dish,id=event.currentTarget.dataset.id
    if(!dish || this.data.quantityBusy || !this.current(this._scope) || !dish.recipe.ingredients.some(line=>line.id===id && line.optional))return
    const enabled=dish.optionalIngredients.find(line=>line.id===id).enabled
    return this.loadMealQuantities(dish.id,this._scope,this._epoch,{...this._optionalOverrides,[id]:!enabled})
  },
  onRetryQuantities() {
    const request=this._quantityRequest
    if(!request || this.data.quantityBusy || !this.current(request.scope) || request.epoch!==this._epoch)return
    return this.loadMealQuantities(request.id,request.scope,request.epoch,request.optionalOverrides)
  },

  onShowDetailMore() { if (this.data.dish && this.current(this._scope)) this.setData({ showDetailMore: true }) },
  onHideDetailMore() { this.setData({ showDetailMore: false }) },
  onCopyPersonal() {
    const dish = this.data.dish, scope = this._scope
    if (!dish || !dish.id || !this.current(scope) || this.data.copyBusy) return
    if (!this._copyJournal) this._copyJournal = require('../../utils/personal-recipes').createWriteJournal()
    const pending = this._copyJournal.pending('dish:copy:' + dish.id)
    this._copyPreviewBinding = { scope, id: dish.id, version: dish.contentVersion, epoch: this._epoch }
    const form = require('../../utils/personal-recipes').recipeForm(dish)
    this.setData({ showDetailMore: false, showCopyPreview: true, copyPending: !!pending, copyError: '', copyPreview: { name: form.name, ingredients: form.ingredients, steps: form.steps } })
  },
  onCancelCopyPersonal() {
    if (this.data.copyBusy) return
    this._copyPreviewBinding = null
    this.setData({ showCopyPreview: false, copyPreview: null })
  },
  onConfirmCopyPersonal() {
    const binding = this._copyPreviewBinding, dish = this.data.dish, scope = binding && binding.scope
    if (!binding || !this.data.showCopyPreview || !dish || !this.current(scope) || this.data.copyBusy || binding.epoch !== this._epoch || binding.id !== dish.id) return
    const pending = this._copyJournal.pending('dish:copy:' + dish.id)
    if (!pending && binding.version !== dish.contentVersion) return this.setData({ copyError: '原菜谱已变化，请关闭预览后重新核对。' })
    // This handoff only opens an editor. The edited copy is created on its Save action.
    this.setData({ showCopyPreview: false, copyPreview: null, copyError: '' })
    this._copyPreviewBinding = null
    wx.navigateTo({ url: '/pages/custom-dishes/custom-dishes?copy=' + encodeURIComponent(dish.id) + '&version=' + encodeURIComponent(pending ? pending.expectedVersion : binding.version) })
  },

  onEditCustom() {
    const dish = this.data.dish, user = wx.getStorageSync('userInfo') || {}
    if (!this.current(this._scope) || !this.data.canEditCustom || !dish || !user.id || String(dish.userId) !== String(user.id)) return
    this.setData({ showDetailMore: false }); wx.navigateTo({ url: '/pages/custom-dishes/custom-dishes?edit=' + encodeURIComponent(dish.id) })
  },
  onBrowseRecipes() { wx.switchTab({url:'/pages/customize/customize'}) },
  onRetry() { if (['unavailable','retired'].includes(this.data.errorKind)) return; if (this._dishId) return this._loadAfterLogin(this._dishId) },
  onDishImageError(event) {
    const source = event && event.currentTarget && event.currentTarget.dataset.url
    const dataset = event && event.currentTarget && event.currentTarget.dataset || {}
    if(this.data.dish && ((dataset.dishid != null && String(dataset.dishid)!==String(this.data.dish.id)) || (dataset.version != null && dataset.version!==this.data.dish.contentVersion)))return
    if (!this.data.dish || (source != null && source !== this.data.dish.image)) return
    this.setData({ dishImageFailed: true })
  },
  onAddToShoppingList() {
    const dish = this.data.dish
    if (!dish || !dish.id || !this.current(this._scope)) return
    const { beginShoppingSelection } = require('../../utils/shopping-list')
    beginShoppingSelection({ dishIds: [dish.id], targetPeople: this.data.targetPeople, source: 'dish-detail', dishes: [dish] })
    this.setData({ showDetailMore: false }); wx.navigateTo({ url: '/pages/shopping-preview/shopping-preview' })
  },
  selectionOptions() { const scope=this._scope || getUserStorageKey('dishView');return {api:require('../../utils/api'),wx,storageKey:getUserStorageKey,current:()=>this.current(scope),errorKey:'mealAddError'} },
  async refreshSelectedMeal() { const result = await require('../../utils/dish-workspace-handoff').refreshSelectionPage(this,this.selectionOptions()); this.measureDetailActions(); return result },
  async onRetrySelection() { try { return await require('../../utils/dish-workspace-handoff').changeSelectionPage(this,'recover',null,this.selectionOptions()) } finally { this.measureDetailActions() } },
  async onAddToCurrentMeal() {
    if(!this.data.dish || !this.current(this._scope))return
    if(this.data.isAddedToMeal)return this.onViewMeal()
    if(!this._recipeSelection)await this.refreshSelectedMeal()
    const result = await require('../../utils/dish-workspace-handoff').changeSelectionPage(this,'append',Number(this.data.dish.id),this.selectionOptions())
    this.measureDetailActions(); return result
  },
  onViewMeal() { if(this.current(this._scope))return require('../../utils/dish-workspace-handoff').openSelectedMeal(this,wx) },
  onSaveToCalendar() { if(this.current(this._scope))return require('../../utils/dish-workspace-handoff').openSelectedMeal(this,wx,true) },
  onShowSelected() { if(this.current(this._scope))this.setData({showMealSelected:true}) },
  onHideSelected() { this.setData({showSelectedPanel:false,showMealSelected:false}) },
  onHideMealSelected(){this.setData({showMealSelected:false})},
  onRemoveMealDish(e){return this.onRemoveSelected(e)},
  onRemoveSelected(e) { return require('../../utils/dish-workspace-handoff').changeSelectionPage(this,'remove',Number(e.currentTarget.dataset.id),this.selectionOptions()) },
  onContinueSelecting() { if(this.current(this._scope)) {this.setData({showSelectedPanel:false,showMealSelected:false});wx.switchTab({url:'/pages/customize/customize'})} },
  onSelectedDish(e) { if(this.current(this._scope))wx.navigateTo({url:'/pages/dish-detail/dish-detail?id='+Number(e.currentTarget.dataset.id)+'&people='+this.data.targetPeople}) },
  onOpenCooking() { if(this.data.dish && this.current(this._scope))wx.navigateTo({url:'/pages/meal-cooking/meal-cooking?recipeId='+this.data.dish.id+'&people='+this.data.targetPeople}) },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.previewImage({
        current: url,
        urls: [url]
      })
    }
  },

  previewStepImage(e) {
    const url = e.currentTarget.dataset.url
    const urls = this.data.dish.allStepImages || []
    if (url && urls.length > 0) {
      wx.previewImage({
        current: url,
        urls: urls
      })
    }
  },

  onShareAppMessage() {
    const dish = this.data.dish
    if (dish) {
      return {
        title: `推荐菜品：${dish.name}`,
        path: `/pages/dish-detail/dish-detail?id=${dish.id}`
      }
    }
    return {
      title: '吃什么 - 菜品详情',
      path: '/pages/index/index'
    }
  }
})
