const api = require('../../utils/api')
const { consumeShoppingSelection, saveLocalShoppingList, loadLocalShoppingList, enqueueShoppingOperation } = require('../../utils/shopping-list')
const { parseIngredientText, scaleLocalQuantity } = require('../../utils/shopping-ingredients')

Page({
  data: {
    targetPeople: 2,
    dishes: [],
    warnings: [],
    previewLoading: true,
    confirmInFlight: false,
    errorMessage: '',
    source: '',
  },

  previewRequestVersion: 0,
  confirmInFlight: false,

  onLoad() {
    this.selection = consumeShoppingSelection() || { dishIds: [], targetPeople: 2, source: 'unknown', dishes: [] }
    this.setData({ targetPeople: Number(this.selection.targetPeople) || 2, source: this.selection.source || '' })
    this.loadPreview()
  },

  async loadPreview() {
    const version = ++this.previewRequestVersion
    const payload = {
      dishIds: this.selection.dishIds || [],
      recipeId: this.selection.recipeId || null,
      targetPeople: Number(this.data.targetPeople) || 2,
      clientRequestId: `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }
    this.setData({ previewLoading: true, errorMessage: '' })
    try {
      const result = await api.createShoppingPreview(payload)
      if (version !== this.previewRequestVersion) return
      this.setData({ dishes: result.dishes || [], warnings: result.warnings || [], previewLoading: false })
    } catch (error) {
      if (version !== this.previewRequestVersion) return
      const fallback = this.buildLocalFallback()
      this.setData({ dishes: fallback, previewLoading: false, errorMessage: '网络较慢，已显示本地预览' })
    }
  },

  buildLocalFallback() {
    const sourceDishes = this.selection.dishes || []
    return sourceDishes.map((dish, index) => {
      const rawItems = dish.ingredientsAmounts || dish.ingredients || dish.cl || ''
      const items = String(rawItems).split('###').filter(Boolean).map((line, lineIndex) => {
        const parsed = parseIngredientText(line)
        const scaled = scaleLocalQuantity(parsed, 2, this.data.targetPeople)
        return { ...scaled, clientKey: `local-${dish.id}-${lineIndex}`, sourceDishId: dish.id, sourceDishName: dish.name, sourceLineNo: lineIndex, selectionKey: `dish-${dish.id}-${index}`, userOverride: false }
      })
      return { selectionKey: `dish-${dish.id}-${index}`, dishId: dish.id, dishName: dish.name, targetPeople: this.data.targetPeople, items }
    })
  },

  onPeopleChange(e) {
    const value = Math.max(1, Math.min(50, Number(e.detail.value) || 2))
    this.setData({ targetPeople: value })
    this.selection.targetPeople = value
    this.loadPreview()
  },

  onRemoveItem(e) {
    const { dishIndex, itemIndex } = e.currentTarget.dataset
    const dishes = this.data.dishes.map((dish, index) => index === Number(dishIndex)
      ? { ...dish, items: dish.items.filter((_, itemIdx) => itemIdx !== Number(itemIndex)) }
      : dish)
    this.setData({ dishes })
  },

  onEditItem(e) {
    const { dishIndex, itemIndex } = e.currentTarget.dataset
    const item = this.data.dishes[dishIndex].items[itemIndex]
    wx.showModal({
      title: `调整${item.displayName || '食材'}用量`,
      editable: true,
      content: item.quantityText || '',
      success: (result) => {
        if (!result.confirm || !String(result.content || '').trim()) return
        const dishes = this.data.dishes.map((dish, index) => index === Number(dishIndex)
          ? { ...dish, items: dish.items.map((current, itemIdx) => itemIdx === Number(itemIndex) ? { ...current, quantityText: result.content.trim(), userOverride: true } : current) }
          : dish)
        this.setData({ dishes })
      },
    })
  },

  async onConfirm() {
    if (this.confirmInFlight) return
    this.selection = this.selection || {}
    const dishes = this.data.dishes || []
    if (!dishes.some(dish => (dish.items || []).length > 0)) {
      wx.showToast({ title: '请至少保留一项食材', icon: 'none' })
      return
    }
    this.confirmInFlight = true
    this.setData({ confirmInFlight: true })
    const requestId = `add-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const payload = {
      requestId,
      previewId: this.selection.clientRequestId || requestId,
      targetPeople: this.data.targetPeople,
      dishes: dishes.map(dish => ({ selectionKey: dish.selectionKey, items: dish.items })),
      expectedListVersion: loadLocalShoppingList().version || 0,
    }
    try {
      const result = await api.batchAddShoppingItems(payload)
      saveLocalShoppingList(result.list || result)
      wx.showToast({ title: '已加入购物清单', icon: 'success' })
      setTimeout(() => wx.redirectTo({ url: '/pages/shopping-list/shopping-list' }), 300)
    } catch (error) {
      const local = loadLocalShoppingList()
      const existing = new Map((local.dishes || []).map(dish => [dish.selectionKey, dish]))
      for (const dish of dishes) existing.set(dish.selectionKey, dish)
      saveLocalShoppingList({ ...local, dishes: [...existing.values()], version: local.version || 0 })
      enqueueShoppingOperation({ type: 'batch-add', requestId, payload })
      wx.showToast({ title: '已保存本地，联网后同步', icon: 'none', duration: 2200 })
      setTimeout(() => wx.redirectTo({ url: '/pages/shopping-list/shopping-list' }), 300)
    } finally {
      this.confirmInFlight = false
      this.setData({ confirmInFlight: false })
    }
  },

  onBack() { wx.navigateBack() },
})
