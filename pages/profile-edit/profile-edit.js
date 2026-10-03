const api = require('../../utils/api')
const { resolveAvatar, uploadAvatar } = require('../../utils/avatar')
const { getUserStorageKey } = require('../../utils/util')
const flow = require('../../utils/meal-workflow')
const app = getApp()
Page({
  data: { fontScale: require('../../utils/font-scale')(), userInfo: {}, nickname: '', joinDays: 0, busy: false, errorMessage: '', dirty: false },
  onShow() { if (this._scope !== getUserStorageKey('profileEdit') || !this.data.dirty) this.loadUser() },
  onUnload() { this._unloaded = true },
  loadUser() {
    const user = wx.getStorageSync('userInfo') || {}
    this._scope = getUserStorageKey('profileEdit'); this._avatarPath = null; this._avatarConfirmation = null
    this.setData({ busy: false, errorMessage: '' })
    this.setData({ userInfo: { ...user, avatar: resolveAvatar(user.avatar) }, nickname: user.nickname || '', joinDays: user.registerTime ? Math.max(0,Math.floor((Date.now() - new Date(user.registerTime).getTime()) / 86400000)) : 0, dirty: false })
  },
  onChooseAvatar(e) { this._avatarPath = e.detail.avatarUrl; this._avatarConfirmation = { requestId: flow.requestId('avatar'), expectedAvatar: (wx.getStorageSync('userInfo') || {}).avatar || '' }; this.setData({ 'userInfo.avatar': e.detail.avatarUrl, dirty: true, errorMessage: '' }) },
  onNicknameInput(e) { this.setData({ nickname: e.detail.value, dirty: true }) },
  onAvatarError() { this.setData({ 'userInfo.avatar': '' }) },
  async onSave() {
    if (this.data.busy) return
    if (this._scope !== getUserStorageKey('profileEdit')) { this.loadUser(); return }
    const nickname = this.data.nickname.trim(), scope = this._scope
    if (!nickname || nickname.length > 64) return this.setData({ errorMessage: '昵称应为 1 至 64 个字符' })
    if (!(wx.getStorageSync('userInfo') || {}).id) return this.setData({ errorMessage: '请先在“我的”登录' })
    this.setData({ busy: true, errorMessage: '' })
    try {
      if (this._avatarPath) {
        const uploaded = await uploadAvatar(this._avatarPath, this._avatarConfirmation)
        if (scope !== getUserStorageKey('profileEdit') || this._unloaded) return
        const user = { ...(wx.getStorageSync('userInfo') || {}), ...uploaded.user }
        wx.setStorageSync('userInfo', user); app.globalData.userInfo = user
        this._avatarPath = null
      }
      const result = await api.updateUserInfo({ nickname })
      if (scope !== getUserStorageKey('profileEdit') || this._unloaded) return
      if (!result.success) throw { data: result }
      const user = { ...(wx.getStorageSync('userInfo') || {}), ...result.user }
      wx.setStorageSync('userInfo',user); app.globalData.userInfo = user
      this.setData({ dirty: false }); this.loadUser(); wx.showToast({ title: '个人资料已保存', icon: 'success' })
    } catch (error) { if (scope === getUserStorageKey('profileEdit') && !this._unloaded) this.setData({ errorMessage: flow.errorMessage(error, '保存未完成，输入和头像预览已保留，请重试。') }) }
    finally { if (scope === getUserStorageKey('profileEdit') && !this._unloaded) this.setData({ busy: false }) }
  },
  onCancel() { if (this.data.busy) return; this.loadUser(); wx.navigateBack() },
})
