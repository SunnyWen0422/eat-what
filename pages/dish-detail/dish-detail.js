const { getUserStorageKey } = require('../../utils/util')
// pages/dish-detail/dish-detail.js
const { getDishById } = require('../../utils/api')

Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(),
    dish: null, targetPeople: 2, ingredientNotice: '', canEditCustom: false,qualityView:null,qualitySourcesVisible:false,
    loading: true,
    error: false,
    isFavorite: false
  },

  onLoad(options) {
    this._dishId = options.id
    const people = Number(options.people || 2)
    this.setData({ targetPeople: Number.isInteger(people) && people >= 1 && people <= 50 ? people : 2, ingredientNotice: '正在读取本餐份量' })
    if (options.id) {
      // 等待登录完成再加载（分享进入时 app.onLaunch 可能未完成）
      this._loadAfterLogin(options.id)
    } else {
      this.setData({ loading: false, error: true })
    }
  },

  onShow() { if (this._scope && this._scope !== getUserStorageKey('dishView')) this.loadDishDetail(this._dishId) },
  onUnload() { this._unloaded = true; this._epoch = (this._epoch || 0) + 1 },
  current(scope) { return !this._unloaded && scope === getUserStorageKey('dishView') },
  async _loadAfterLogin(id) {
    const app = getApp()
    if (!app.globalData.loginReady) {
      await app.waitForLogin()
    }
    this.loadDishDetail(id)
  },

  async loadDishDetail(id) {
    const scope = this._scope = getUserStorageKey('dishView'), epoch = this._epoch = (this._epoch || 0) + 1
    this.setData({ dish: null, isFavorite: false, favoriteBusy: false, canEditCustom: false, copyBusy: false, copyError: '' })
    try {
      this.setData({ loading: true, error: false })
      const dish = await getDishById(id)
      if (!this.current(scope) || epoch !== this._epoch) return
      
      if (dish) {
        dish.typeLabel = require('../../utils/recipe-quality').dishCategoryLabel(dish.type)
        const minutes = Number(dish.cookMinutes)
        dish.cookTimeDisplay = Number.isInteger(minutes) && minutes >= 1 && minutes <= 240 ? minutes + '分钟' : dish.cookTime || ''
        dish.tagsList = Array.isArray(dish.tags) ? dish.tags : String(dish.tags || '').split(/[,，]/).map(s => s.trim()).filter(Boolean)
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
          return String(s).split('#').filter(u => u.trim().startsWith('http'))
        })
        // 所有步骤图片汇总（按顺序平铺）
        dish.allStepImages = []
        dish.stepImagesFlat.forEach(arr => arr.forEach(url => dish.allStepImages.push(url)))

        // 处理食材与用量（如果是JSON字符串则解析）
        if (!dish.ingredientsAmounts && dish.cl) dish.ingredientsAmounts = dish.cl
        if (dish.ingredientsAmounts && typeof dish.ingredientsAmounts === 'string') {
          try {
            dish.ingredientsList = JSON.parse(dish.ingredientsAmounts)
          } catch (e) {
            // 如果不是JSON，按换行分割
            dish.ingredientsList = dish.ingredientsAmounts.split(/###|#|\n/).filter(item => item.trim()).map(item => { const parts=item.split('|'); return parts.length >= 3 ? parts[0] + ' ' + parts[1] + parts[2] : item })
          }
        } else {
          dish.ingredientsList = []
        }

        const qualityView=require('../../utils/recipe-quality').presentRecipeQuality(dish)
        if(qualityView) {dish.ingredientsList=qualityView.ingredientLines;this.setData({qualityView,ingredientNotice:qualityView.notice})}
        else this.setData({qualityView:null})
        // 处理步骤（兼容 step/steps 两种字段名）
        var stepsRaw = dish.steps || dish.step
        if (stepsRaw && typeof stepsRaw === 'string') {
          try {
            dish.stepsList = JSON.parse(stepsRaw)
          } catch (e) {
            dish.stepsList = stepsRaw.split(/###|#|\n/).filter(item => item.trim())
          }
        } else if (Array.isArray(stepsRaw)) {
          dish.stepsList = stepsRaw
        } else {
          dish.stepsList = []
        }
        // 转换 HTTP 图片为 HTTPS
        if (dish.image) dish.image = dish.image.replace(/^http:/, 'https:')
        if (dish.stepImagesList) dish.stepImagesList = dish.stepImagesList.map(function(u) {
          return typeof u === 'string' ? u.replace(/^http:/, 'https:') : u
        })

        const user = wx.getStorageSync('userInfo') || {}
        const canEditCustom = !!user.id && dish.userId != null && String(dish.userId) === String(user.id)
        this.setData({ dish, loading: false, canEditCustom })
        this.checkFavoriteStatus(id)
        this.loadMealQuantities(id, scope, epoch)
      } else {
        this.setData({ loading: false, error: true })
      }
    } catch (err) {
      if (!this.current(scope) || epoch !== this._epoch) return
      console.error('加载菜品详情失败:', err)
      this.setData({ loading: false, error: true })
    }
  },

  async loadMealQuantities(id, scope, epoch) {
    try {
      const preview = await require('../../utils/api').createShoppingPreview({ dishIds: [Number(id)], targetPeople: this.data.targetPeople })
      if (!this.current(scope) || epoch !== this._epoch) return
      const items = (preview.dishes || []).flatMap(dish => dish.items || [])
      this.setData({ 'dish.ingredientsList': items.map(item => item.displayName + ' ' + (item.quantityText || '需核对')), ingredientNotice: items.every(item => item.calculationStatus === 'CALCULATED') ? `按本餐 ${this.data.targetPeople} 人换算，请按实际情况核对` : `本餐 ${this.data.targetPeople} 人，部分用量需手动核对` })
    } catch (error) { if (this.current(scope) && epoch === this._epoch) this.setData({ ingredientNotice: this.data.qualityView?'本餐份量暂未读到，用量仍待核实，请手动核对。':'份量换算暂不可用，以下为用户提供的原始用料' }) }
  },

  async checkFavoriteStatus(dishId) {
    const scope = this._scope
    try {
      const { checkFavoriteDish } = require('../../utils/api')
      const result = await checkFavoriteDish(dishId)
      if (!this.current(scope)) return
      this.setData({ isFavorite: result && result.isFavorite })
    } catch (err) {
      console.error('检查收藏状态失败:', err)
    }
  },

  async toggleFavorite() {
    if (this.data.favoriteBusy || !this.data.dish || !this.current(this._scope)) return
    const scope = this._scope
    this.setData({ favoriteBusy: true })
    try {
      const { addFavoriteDish, removeFavoriteDish } = require('../../utils/api')
      const dishId = this.data.dish.id
      
      if (this.data.isFavorite) {
        await removeFavoriteDish(dishId)
        if (!this.current(scope)) return
        this.setData({ isFavorite: false })
        wx.showToast({ title: '已取消收藏', icon: 'success' })
      } else {
        await addFavoriteDish(dishId)
        if (!this.current(scope)) return
        this.setData({ isFavorite: true })
        wx.showToast({ title: '收藏成功', icon: 'success' })
      }
    } catch (err) {
      console.error('收藏操作失败:', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    } finally { if(this.current(scope))this.setData({ favoriteBusy: false }) }
  },

  async onCopyPersonal() {
    const dish = this.data.dish, scope = this._scope
    if (!dish || !dish.id || !this.current(scope) || this.data.copyBusy) return
    if (!this._copyJournal) this._copyJournal = require('../../utils/personal-recipes').createWriteJournal()
    this.setData({ copyBusy: true, copyError: '' })
    try {
      const copy = await this._copyJournal.run('dish:copy:' + dish.id, { expectedVersion: dish.contentVersion }, body => require('../../utils/api').copyPersonalDish(dish.id, body))
      if (!this.current(scope)) return
      wx.navigateTo({ url: '/pages/custom-dishes/custom-dishes?edit=' + encodeURIComponent(copy.id) })
    } catch (error) { if (this.current(scope)) this.setData({ copyError: require('../../utils/meal-workflow').errorMessage(error, '复制结果未确认，请重试原操作') }) }
    finally { if (this.current(scope)) this.setData({ copyBusy: false }) }
  },

  onEditCustom() {
    const dish = this.data.dish, user = wx.getStorageSync('userInfo') || {}
    if (!this.current(this._scope) || !this.data.canEditCustom || !dish || !user.id || String(dish.userId) !== String(user.id)) return
    wx.navigateTo({ url: '/pages/custom-dishes/custom-dishes?edit=' + encodeURIComponent(dish.id) })
  },
  onRetry() { if (this._dishId) this.loadDishDetail(this._dishId) },
  onToggleQualitySources(){this.setData({qualitySourcesVisible:!this.data.qualitySourcesVisible})},
  onDishImageError() { this.setData({ 'dish.image': '' }) },
  onAddToShoppingList() {
    const dish = this.data.dish
    if (!dish || !dish.id || !this.current(this._scope)) return
    const { beginShoppingSelection } = require('../../utils/shopping-list')
    beginShoppingSelection({ dishIds: [dish.id], targetPeople: this.data.targetPeople, source: 'dish-detail', dishes: [dish] })
    wx.navigateTo({ url: '/pages/shopping-preview/shopping-preview' })
  },
  async onAddToCurrentMeal() {
    const dish=this.data.dish,scope=this._scope
    if(!dish||!this.current(scope)||this.data.addingToMeal)return
    this.setData({addingToMeal:true,mealAddError:''})
    try { await require('../../utils/dish-workspace-handoff').addDishToWorkspace(dish.id,{api:require('../../utils/api'),wx,storageKey:getUserStorageKey,current:()=>this.current(scope)}) }
    catch(error){if(this.current(scope))this.setData({mealAddError:error.message||'暂未加入，菜谱仍保留，请重试'})}
    finally{if(this.current(scope))this.setData({addingToMeal:false})}
  },

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
