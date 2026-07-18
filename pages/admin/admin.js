const api = require('../../utils/api')

Page({
  data: {
    users: [], loading: true,
    selectedUser: null, userDishes: [],
    showAddForm: false,
    newDish: { name: '', type: 'meat', cl: '', step: '' }
  },

  onShow() { this.loadUsers() },

  async loadUsers() {
    this.setData({ loading: true })
    try {
      const res = await api.request('/admin/users', 'GET')
      this.setData({ users: res.data || [], loading: false })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async onSelectUser(e) {
    const id = e.currentTarget.dataset.id
    try {
      const res = await api.request(`/admin/users/${id}`, 'GET')
      this.setData({ selectedUser: res.user, userDishes: res.customDishes || [] })
    } catch (e) {
      wx.showToast({ title: '加载用户失败', icon: 'none' })
    }
  },

  onBack() { this.setData({ selectedUser: null, userDishes: [], showAddForm: false }) },

  // Add dish form
  onShowAdd() { this.setData({ showAddForm: true }) },
  onCancelAdd() { this.setData({ showAddForm: false, newDish: { name: '', type: 'meat', cl: '', step: '' } }) },

  onDishInput(e) { const f = e.currentTarget.dataset.field; this.setData({ [`newDish.${f}`]: e.detail.value }) },

  async onSaveDish() {
    const d = this.data.newDish
    if (!d.name.trim()) return wx.showToast({ title: '名称必填', icon: 'none' })
    try {
      await api.request(`/admin/users/${this.data.selectedUser.id}/dishes`, 'POST', {
        name: d.name, type: d.type, cl: d.cl.replace(/\n/g, '#'), step: d.step.replace(/\n/g, '#')
      })
      wx.showToast({ title: '已添加', icon: 'success' })
      this.onCancelAdd()
      this.onSelectUser({ currentTarget: { dataset: { id: this.data.selectedUser.id } } })
    } catch (e) { wx.showToast({ title: '添加失败', icon: 'none' }) }
  },

  async onDeleteDish(e) {
    const did = e.currentTarget.dataset.id
    const uid = this.data.selectedUser.id
    wx.showModal({ title: '确认删除', content: '删除此菜谱？', success: async (r) => {
      if (!r.confirm) return
      try {
        await api.request(`/admin/users/${uid}/dishes/${did}`, 'DELETE')
        wx.showToast({ title: '已删除', icon: 'success' })
        this.onSelectUser({ currentTarget: { dataset: { id: uid } } })
      } catch (e) { wx.showToast({ title: '删除失败', icon: 'none' }) }
    }})
  }
})
