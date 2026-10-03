const util = require('../../utils/util.js')
Page({
  data: { fontScale: require('../../utils/font-scale')(), logs: [] },
  onShow() { this.setData({ logs: (wx.getStorageSync('logs') || []).map(value => ({ date: util.formatTime(new Date(value)), timeStamp: value })) }) },
  onClear() { wx.showModal({ title: '清空本机启动记录？', content: '只清除这台设备的启动日志，用餐与购物数据会保留。', success: result => { if (result.confirm) { wx.removeStorageSync('logs'); this.setData({ logs: [] }) } } }) },
})
