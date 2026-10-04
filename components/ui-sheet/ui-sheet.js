const tokens = require('../../utils/ui-tokens')

Component({
  options: { multipleSlots: true },
  properties: { visible: Boolean, title: String, busy: Boolean },
  data: { keyboardHeight: 0, bodyHeight: 0, sheetHeight: 0 },
  lifetimes: {
    attached() {
      this._keyboard = event => {
        if (this.properties.visible) this.resize(Math.max(0, Number(event.height) || 0))
      }
      this.resize(0)
      if (wx.onKeyboardHeightChange) wx.onKeyboardHeightChange(this._keyboard)
    },
    detached() {
      if (wx.offKeyboardHeightChange && this._keyboard) wx.offKeyboardHeightChange(this._keyboard)
      this._keyboard = null
    },
  },
  observers: {
    visible() {
      // Reopening cannot rely on a keyboard-dismiss event delivered while hidden.
      this.resize(0)
    },
  },
  methods: {
    resize(keyboardHeight) {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : { windowHeight: 600 }
      // Reserve header/footer touch targets plus their three vertical spacing bands.
      const chrome = tokens.controls.touchSize * 2 + tokens.space[5] * 3
      const available = Math.max(chrome, (Number(info.windowHeight) || 600) - keyboardHeight - tokens.space[5])
      this.setData({ keyboardHeight, sheetHeight: available, bodyHeight: Math.max(tokens.controls.touchSize, available - chrome) })
    },
    close() { if (!this.properties.busy) this.triggerEvent('close') },
    stop() { return false },
  },
})
