const tokens = require('../../utils/ui-tokens')
const experiencePreferences = require('../../utils/experience-preferences')
const labels = { meat: '荤菜', veg: '素菜', soup: '汤羹', staple: '主食', dessert: '甜品', side: '配餐' }

Component({
  properties: { mode: { type: String, value: 'replace' }, selected: Boolean, dish: Object, busy: Boolean, disabled: Boolean, feedback: String, reducedMotion: Boolean },
  data: { dishView: {}, imageFailed: false, motionDuration: 0 },
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
      const image = typeof dish.image === 'string' ? dish.image.replace(/^http:/, 'https:') : ''
      const identity = `${dish.id}:${image}`
      this.setData({ dishView: { id: dish.dishId || dish.id, name: dish.name || '未命名菜品', image, meta, placeholderIcon: labels[dish.type] ? dish.type : 'recipe' },
        imageFailed: this._imageIdentity === identity && this.data.imageFailed || false })
      this._imageIdentity = identity
    },
    updateMotion() { this.setData({ motionDuration: this.properties.reducedMotion || experiencePreferences().get().reducedMotion ? 0 : tokens.motion.row }) },
    onImageError() { this.setData({ imageFailed: true }) },
    onView() { const dish = this.properties.dish || {}; const id = dish.dishId || dish.id; if (id != null) this.triggerEvent('view', { id }) },
    onReplace() { const dish = this.properties.dish || {}; if (this.properties.mode !== 'read' && !this.properties.busy && !this.properties.disabled && dish.id != null) this.triggerEvent(this.properties.mode === 'select' ? 'select' : 'replace', { id: dish.id }) },
  },
})
