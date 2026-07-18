var app = getApp()
var api = require('../../utils/api')

Page({
  data: {
    messages: [],
    inputText: '',
    loading: false,
    userAvatar: '',
    scrollTop: 0
  },

  onLoad: function() {
    var user = wx.getStorageSync('userInfo') || {}
    this.setData({
      userAvatar: user.avatar || '',
      messages: [],
      inputText: '',
      loading: false
    })
    this.addMsg('assistant', '你好！我是吃什么AI助手 🍳\n告诉我你想吃什么，或家里有什么食材，我来帮你推荐！')
  },

  addMsg: function(role, content, dishes) {
    var msg = { role: role, content: content }
    if (dishes && dishes.length > 0) { msg.dishes = dishes }
    var msgs = this.data.messages.concat([msg])
    this.setData({ messages: msgs }, function() {
      this.setData({ scrollTop: 99999 })
    }.bind(this))
  },

  onTapDish: function(e) {
    var id = e.currentTarget.dataset.id
    if (id) { wx.navigateTo({ url: '/pages/dish-detail/dish-detail?id=' + id }) }
  },

  onInput: function(e) { this.setData({ inputText: e.detail.value }) },

  onSend: function() {
    var that = this
    var text = this.data.inputText.trim()
    if (!text || this.data.loading) return

    this.addMsg('user', text)
    this.setData({ inputText: '', loading: true })

    var uid = app.globalData && app.globalData.userInfo ? app.globalData.userInfo.id || 'guest' : 'guest'
    api.sendChat(text, String(uid)).then(function(data) {
      var reply = data && data.reply ? data.reply : '没有获取到回复'
      var dishes = data && data.dishes ? data.dishes : []
      that.addMsg('assistant', reply, dishes)
      that.setData({ loading: false })
    }).catch(function() {
      that.addMsg('assistant', '网络连接失败，请重试')
      that.setData({ loading: false })
    })
  },

  onQuick: function(e) {
    this.setData({ inputText: e.currentTarget.dataset.kw })
    this.onSend()
  },

  onBack: function() { wx.navigateBack() },
  onShareAppMessage: function() { return { title: '吃什么？AI智能助手', path: '/pages/index/index' } }
})
