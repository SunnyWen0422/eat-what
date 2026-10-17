const tokens = require('../../utils/ui-tokens')
const experiencePreferences = require('../../utils/experience-preferences')
const { imageSource, imageIdentity, placeholderIcon } = require('../../utils/dish-image')
const labels = { meat: '荤菜', veg: '素菜', soup: '汤羹', staple: '主食', dessert: '甜品', side: '配餐' }

Component({
  properties: { fontScale: { type: Number, value: 1 }, mode: { type: String, value: 'replace' }, prominent: Boolean, selected: Boolean, dish: Object, busy: Boolean, disabled: Boolean, feedback: String, reducedMotion: Boolean },
  data: { dishView: { name: '菜品', meta: '', image: '', placeholderIcon: 'recipe' }, imageFailed: false, motionDuration: 0,pressDuration:0 },
  lifetimes: { attached() { this.updateDish(); this.updateMotion() } },
  pageLifetimes: { show() { this.updateMotion() } },
  observers: { dish() { this.updateDish(); this.updateMotion() }, reducedMotion() { this.updateMotion() } },
  methods: {
    updateDish() {
      const dish = this.properties.dish || {}, category = labels[dish.type] || '菜品'
      const minutes = Number(dish.cookMinutes)
      const quality = dish.quality || {}
      let duration = ''
      if (Number.isFinite(minutes) && minutes > 0) {
        if (quality.timeStatus === 'VERIFIED' && quality.reviewStatus === 'VERIFIED') duration = `${minutes} 分钟`
        else if (quality.timeStatus === 'ESTIMATED') duration = `预计 ${minutes} 分钟`
      }
      const meta = category + (duration ? ` · ${duration}` : '')
      const image = imageSource(dish.image)
      const identity = imageIdentity(dish)
      this.setData({ dishView: { id: dish.dishId || dish.id, identity, name: dish.name || '未命名菜品', image, meta, placeholderIcon: placeholderIcon(dish.type) },
        imageFailed: this._imageIdentity === identity && this.data.imageFailed || false })
      this._imageIdentity = identity
    },
    updateMotion() { const reduced=this.properties.reducedMotion||experiencePreferences().get().reducedMotion;this.setData({motionDuration:reduced?0:tokens.motion.row,pressDuration:reduced?0:tokens.motion.press}) },
    onImageError(event) {
      const source = event && event.currentTarget && event.currentTarget.dataset.source
      const identity = event && event.currentTarget && event.currentTarget.dataset.identity
      if (identity != null && identity !== this._imageIdentity) return
      if (source != null && source !== this.data.dishView.image) return
      this.setData({ imageFailed: true })
    },
    onView() { const dish = this.properties.dish || {}; const id = dish.dishId || dish.id; if (id != null) this.triggerEvent('view', { id }) },
    onFeedback() {
      if (this.properties.mode !== 'replace' || this.properties.busy || this.properties.disabled || this._feedbackOpen) return
      const dish = this.properties.dish || {}, dishId = Number(dish.id)
      if (!Number.isSafeInteger(dishId) || dishId <= 0) return
      const identity = this._imageIdentity, locked = !!dish.locked
      const kinds = locked ? ['keep', 'quicker'] : ['keep', 'change', 'quicker']
      this._feedbackOpen = true
      wx.showActionSheet({
        itemList: locked ? ['取消这餐保留', '这餐想省时'] : ['这餐保留', '这次想换', '这餐想省时'],
        success: result => {
          if (this._imageIdentity !== identity || this.properties.mode !== 'replace' || this.properties.busy || this.properties.disabled || !!(this.properties.dish || {}).locked !== locked) return
          const kind = kinds[result.tapIndex]
          if (kind) this.triggerEvent('feedback', { kind, dishId })
        },
        complete: () => { this._feedbackOpen = false },
      })
    },
    onReplace() { const dish = this.properties.dish || {}; if (this.properties.mode !== 'read' && !this.properties.busy && !this.properties.disabled && !(this.properties.mode === 'replace' && dish.locked) && dish.id != null) this.triggerEvent(this.properties.mode === 'select' ? 'select' : 'replace', { id: dish.id }) },
  },
})
