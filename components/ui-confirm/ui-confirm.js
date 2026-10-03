Component({
  options: { multipleSlots: true },
  properties: { visible: Boolean, title: String, description: String, busy: Boolean, confirmLabel: { type: String, value: '确认' } },
  data: { keyboardHeight: 0 },
  lifetimes: {
    attached() {
      this._keyboardHandler = event => { if (this.data.visible) this.setData({ keyboardHeight: Math.max(0, event.height || 0) }) }
      if (wx.onKeyboardHeightChange) wx.onKeyboardHeightChange(this._keyboardHandler)
    },
    detached() { if (wx.offKeyboardHeightChange) wx.offKeyboardHeightChange(this._keyboardHandler) },
  },
  observers: { visible(value) { if (!value) this.setData({ keyboardHeight: 0 }) } },
  methods: { noop() {}, cancel() { if (!this.data.busy) this.triggerEvent('cancel') }, confirm() { if (!this.data.busy) this.triggerEvent('confirm') } },
})
