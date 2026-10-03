module.exports = function fontScale() {
  if (typeof wx === 'undefined' || !wx.getAppBaseInfo) return 1
  const info=wx.getAppBaseInfo(), value=info.fontSizeScaleFactor || (info.fontSizeSetting ? info.fontSizeSetting/16 : 1)
  return Number.isFinite(value) && value>0 ? Math.max(1,value) : 1
}
