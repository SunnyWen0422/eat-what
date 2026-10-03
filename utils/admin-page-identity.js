const { currentIdentity } = require('./account-identity')

function clone(value) { return JSON.parse(JSON.stringify(value)) }

// Lifecycle/event guards protect entry points. Async methods and modal callbacks
// additionally carry an operation ticket, since onShow need not run first.
function withAdminIdentity(definition) {
  const initial = clone(definition.data)
  function clear(page, authStatus = '') {
    if (page.data.saving && typeof wx.hideLoading === 'function') wx.hideLoading()
    page._adminEpoch = (page._adminEpoch || 0) + 1
    page.version = (page.version || 0) + 1
    page.listRequestVersion = (page.listRequestVersion || 0) + 1
    page.detailRequestVersion = (page.detailRequestVersion || 0) + 1
    page.page = 0; page.currentPage = 0; page.detailUserId = null
    const userId = page.data.userId
    page.setData({ ...clone(initial), ...(userId === undefined ? {} : { userId }), authStatus,
      authMessage: authStatus === 'auth' ? '登录已过期，请重新登录后重试' : authStatus === 'permission' ? '当前账号没有管理权限' : '' })
  }
  function sync(page) {
    if (page._adminUnloaded) return false
    const identity = currentIdentity()
    if (page._adminIdentity === undefined) { page._adminIdentity = identity; return true }
    if (page._adminIdentity === identity) return true
    page._adminIdentity = identity
    clear(page)
    return false
  }
  const wrapped = { ...definition, data: { ...definition.data, authStatus: '', authMessage: '' } }
  for (const [name, method] of Object.entries(definition)) {
    if (typeof method !== 'function' || name === 'onShow' || name === 'onUnload') continue
    wrapped[name] = function (...args) {
      if (!sync(this)) return
      return method.apply(this, args)
    }
  }
  wrapped.onShow = function (...args) {
    if (!sync(this)) {
      if (this._adminUnloaded) return
      if (definition.onShow) return definition.onShow.apply(this, args)
      if (this.load) return this.load(true)
      if (this.loadUsers) return this.loadUsers(true)
      return
    }
    if (definition.onShow) return definition.onShow.apply(this, args)
  }
  wrapped.onUnload = function () {
    if (this.data.saving && typeof wx.hideLoading === 'function') wx.hideLoading()
    this._adminUnloaded = true
    this._adminEpoch = (this._adminEpoch || 0) + 1
    if (definition.onUnload) definition.onUnload.call(this)
  }
  wrapped.beginAdminOperation = function () {
    if (!sync(this)) return null
    return { identity: this._adminIdentity, epoch: this._adminEpoch || 0 }
  }
  wrapped.isAdminOperationCurrent = function (operation) {
    return sync(this) && !!operation && operation.identity === this._adminIdentity && operation.epoch === (this._adminEpoch || 0)
  }
  wrapped.handleAdminError = function (error, operation) {
    if (!this.isAdminOperationCurrent(operation)) return true
    const status = Number(error && error.statusCode)
    if (status !== 401 && status !== 403) return false
    clear(this, status === 401 ? 'auth' : 'permission')
    return true
  }
  return wrapped
}

module.exports = { withAdminIdentity }
