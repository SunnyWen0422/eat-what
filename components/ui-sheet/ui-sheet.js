const tokens = require('../../utils/ui-tokens')
const experiencePreferences = require('../../utils/experience-preferences')

Component({
  options: { multipleSlots: true },
  properties: { visible: Boolean, title: String, busy: Boolean, reducedMotion: Boolean, returnFocusId: String },
  data: { keyboardHeight: 0, bodyHeight: 0, sheetHeight: 0, safeInset: 0, motionDuration: 0, overflowChrome: false },
  lifetimes: {
    attached() {
      this._keyboard = event => {
        const height = Math.max(0, Number(event.height) || 0)
        if (!height) this._dismissingKeyboard = false
        if (this.properties.visible) { this.resize(height); this.measureChrome() }
      }
      this.resize(0)
      this.updateMotion()
      this._opened = !!this.properties.visible
      if (wx.onKeyboardHeightChange) wx.onKeyboardHeightChange(this._keyboard)
    },
    ready() { this.measureChrome() },
    detached() {
      this._detached = true
      if (wx.offKeyboardHeightChange && this._keyboard) wx.offKeyboardHeightChange(this._keyboard)
      this._keyboard = null
    },
  },
  observers: {
    visible(visible) {
      // Reopening cannot rely on a keyboard-dismiss event delivered while hidden.
      this.resize(0)
      this.updateMotion()
      if (visible) { this._opened = true; this.measureChrome() }
      else if (this._opened) {
        this._opened = false
        // An opt-in host may bind this ID to an input/textarea focus property.
        // Current app triggers are buttons and do not consume this hook.
        // There is no supported imperative button/screen-reader focus API here.
        if (this.properties.returnFocusId) this.triggerEvent('restorefocus', { id: this.properties.returnFocusId })
      }
    },
    reducedMotion() { this.updateMotion() },
    'title,busy'() { this.measureChrome() },
  },
  methods: {
    resize(keyboardHeight) {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : { windowHeight: 600 }
      const safeInset = !keyboardHeight && info.safeArea ? Math.max(0, (Number(info.screenHeight) || info.windowHeight) - info.safeArea.bottom) : 0
      // Reserve header/footer touch targets plus their three vertical spacing bands.
      const chrome = (this._chromeHeight || tokens.controls.touchSize * 2 + tokens.space[5] * 3) + safeInset
      const windowHeight = Number.isFinite(Number(info.windowHeight)) && Number(info.windowHeight) >= 0 ? Number(info.windowHeight) : 600
      const remaining = Math.max(0, windowHeight - keyboardHeight)
      const margin = Math.min(tokens.space[5], Math.max(0, remaining - tokens.controls.primaryHeight))
      const available = remaining - margin
      const overflowChrome = chrome + tokens.controls.touchSize > available
      this.setData({ keyboardHeight, safeInset, sheetHeight: available, overflowChrome, bodyHeight: Math.max(0, available - chrome) })
      // With less than one hit target visible, scrolling cannot make a full
      // control usable. Request native keyboard dismissal once; the height
      // event, rather than a guessed success, restores the usable viewport.
      if (this.properties.visible && keyboardHeight && remaining < tokens.controls.primaryHeight && !this._dismissingKeyboard && wx.hideKeyboard) {
        this._dismissingKeyboard = true
        wx.hideKeyboard({ fail: () => {
          if (!this._detached && this.properties.visible && wx.showToast) wx.showToast({ title: '请先收起键盘', icon: 'none' })
        } })
      }
    },
    measureChrome() {
      if (!this.properties.visible || !this.createSelectorQuery) return
      const measure = () => {
        if (this._detached || !this.properties.visible) return
        this.createSelectorQuery().select('.sheet-header').boundingClientRect().select('.sheet-footer').boundingClientRect().select('.sheet-handle').boundingClientRect().exec(rects => {
          if (this._detached || !this.properties.visible || !rects || rects.some(rect => !rect || !Number.isFinite(rect.height))) return
          // Include the handle margin, sheet padding and scroll-body padding. Text
          // may wrap at 200%; never reserve only one fixed-height line for actions.
          this._chromeHeight = rects.reduce((height, rect) => height + rect.height, 0) + tokens.space[1] + (tokens.space[2] + tokens.space[3]) * 2
          this.resize(this.data.keyboardHeight)
        })
      }
      if (wx.nextTick) wx.nextTick(measure)
      else measure()
    },
    updateMotion() { this.setData({ motionDuration: this.properties.reducedMotion || experiencePreferences().get().reducedMotion ? 0 : tokens.motion.sheet }) },
    close() { if (!this.properties.busy) this.triggerEvent('close') },
    stop() { return false },
  },
})
