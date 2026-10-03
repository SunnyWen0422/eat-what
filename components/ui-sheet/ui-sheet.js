Component({
 options:{multipleSlots:true},properties:{visible:Boolean,title:String,busy:Boolean},data:{keyboardHeight:0,bodyHeight:360,sheetHeight:520},
 lifetimes:{attached(){this._windowHeight=wx.getWindowInfo?wx.getWindowInfo().windowHeight:600;this._keyboard=e=>{if(!this.properties.visible)return;const height=Math.max(0,e.height||0),available=Math.max(160,this._windowHeight-height-24);this.setData({keyboardHeight:height,sheetHeight:available,bodyHeight:Math.max(44,available-160)})};if(wx.onKeyboardHeightChange)wx.onKeyboardHeightChange(this._keyboard)},detached(){if(wx.offKeyboardHeightChange)wx.offKeyboardHeightChange(this._keyboard)}},
 observers:{visible(value){if(!value)this.setData({keyboardHeight:0})}},
 methods:{close(){if(!this.properties.busy)this.triggerEvent('close')},stop(){return false}}
})
