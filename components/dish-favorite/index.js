const { getFavoriteStore } = require('../../utils/favorite-store')
Component({
  properties: { dishId: { type: Number, value: 0 }, dishName: { type: String, value: '这道菜' } },
  data: { favorite: false, known: false, busy: false },
  observers: { dishId() { if (this._attached) this.bindFavorite() } },
  lifetimes: {
    attached() { this._attached = true; this.bindFavorite() },
    detached() { this._attached = false; this._binding = null; if (this._unsubscribe) this._unsubscribe() },
  },
  pageLifetimes: { show() { if (this._attached) this.bindFavorite(true) } },
  methods: {
    async bindFavorite(force = false) {
      const binding = this._binding = {}, id = Number(this.properties.dishId)
      if (this._unsubscribe) this._unsubscribe()
      this._store = null; this.setData({ favorite: false, known: false, busy: false })
      if (!Number.isSafeInteger(id) || id < 1) return
      try {
        const app = getApp()
        if (app.waitForLogin) await app.waitForLogin()
        if (!this._attached || this._binding !== binding) return
        const store = this._store = getFavoriteStore()
        this._unsubscribe = store.subscribe(id, state => {
          if (this._attached && this._binding === binding) this.setData(state)
        })
        await store.ensure(force)
      } catch (_) { /* Background reads stay quiet; a tap can retry and explain a failure. */ }
    },
    async onToggle() {
      if (this.data.busy || this._tapping) return
      this._tapping = true
      const id = Number(this.properties.dishId), intentStore = getFavoriteStore()
      let binding = this._binding
      try {
        if (!this._store || this._store !== getFavoriteStore()) { await this.bindFavorite(); binding = this._binding }
        if (!this._attached || binding !== this._binding || !this._store || id !== Number(this.properties.dishId) || intentStore !== this._store) return
        const result = await this._store.toggle(id)
        if (!this._attached || binding !== this._binding || this._store !== getFavoriteStore() || result.ignored) return
        this.triggerEvent('change', { id: result.id, favorite: result.favorite })
        wx.showToast({ title: result.reconciled && result.matched === false ? '收藏状态已核对' : result.favorite ? '已收藏' : '已取消收藏', icon: 'none' })
      } catch (error) {
        if (this._attached && binding === this._binding && error.code !== 'ACCOUNT_CHANGED') wx.showToast({ title: error.code === 'OUTCOME_UNKNOWN' ? '暂未确认收藏结果，点星星重试' : '收藏暂未成功，请重试', icon: 'none' })
      } finally { this._tapping = false }
    },
  },
})
