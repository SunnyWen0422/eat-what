const api = require('../../utils/api')
const { resolveAvatar, uploadAvatar } = require('../../utils/avatar')
const { getUserStorageKey } = require('../../utils/util')
const flow = require('../../utils/meal-workflow')
const app = getApp()
Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(), userInfo: {}, nickname: '', joinDays: 0, busy: false, errorMessage: '', dirty: false },
  onShow() { if (this._scope !== getUserStorageKey('profileEdit') || !this.data.dirty) this.loadUser(); else this.syncEditLeaveAlert() },
  onUnload() { this._unloaded = true; if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload() },
  canEditProfile() { return !this._unloaded && !this.data.busy && this._scope === getUserStorageKey('profileEdit') },
  editSnapshot() { return JSON.stringify({ nickname: this.data.nickname, avatarPath: this._avatarPath || null }) },
  syncEditLeaveAlert() {
    const dirty = !!this._editInitial && this.editSnapshot() !== this._editInitial
    this.setData({ dirty })
    if (dirty && wx.enableAlertBeforeUnload) wx.enableAlertBeforeUnload({ message: '个人资料修改尚未保存，离开会放弃未提交输入。' })
    else if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload()
  },
  loadUser() {
    const user = wx.getStorageSync('userInfo') || {}
    this._scope = getUserStorageKey('profileEdit'); this._avatarPath = null; this._avatarConfirmation = null
    this._editEpoch = (this._editEpoch || 0) + 1
    this.setData({ busy: false, errorMessage: '' })
    this.setData({ userInfo: { ...user, avatar: resolveAvatar(user.avatar) }, nickname: user.nickname || '', joinDays: user.registerTime ? Math.max(0,Math.floor((Date.now() - new Date(user.registerTime).getTime()) / 86400000)) : 0, dirty: false })
    this._editInitial = this.editSnapshot(); this.syncEditLeaveAlert()
  },
  onChooseAvatar(e) { if (!this.canEditProfile()) return; this._avatarPath = e.detail.avatarUrl; this._avatarConfirmation = { requestId: flow.requestId('avatar'), expectedAvatar: (wx.getStorageSync('userInfo') || {}).avatar || '' }; this.setData({ 'userInfo.avatar': e.detail.avatarUrl, errorMessage: '' }); this.syncEditLeaveAlert() },
  onNicknameInput(e) { if (!this.canEditProfile()) return; this.setData({ nickname: e.detail.value }); this.syncEditLeaveAlert() },
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
    } catch (error) { if (scope === getUserStorageKey('profileEdit') && !this._unloaded) { this.setData({ errorMessage: flow.errorMessage(error, '保存未完成，输入和头像预览已保留，请重试。') }); this.syncEditLeaveAlert() } }
    finally { if (scope === getUserStorageKey('profileEdit') && !this._unloaded) this.setData({ busy: false }) }
  },
  onCancel() {
    if (!this.canEditProfile()) return
    const scope = this._scope, epoch = this._editEpoch, before = this.editSnapshot()
    const leave = () => {
      if (!this.canEditProfile() || scope !== this._scope || epoch !== this._editEpoch || before !== this.editSnapshot()) return
      if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload()
      wx.navigateBack({ fail: () => this.syncEditLeaveAlert() })
    }
    if (!this.data.dirty) return leave()
    wx.showModal({ title: '离开个人资料编辑？', content: '修改尚未保存，可继续编辑或放弃修改。', confirmText: '放弃修改', cancelText: '保留编辑', success: result => { if (result.confirm) leave() } })
  },
})
