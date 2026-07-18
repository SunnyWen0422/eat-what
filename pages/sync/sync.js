// pages/sync/sync.js
const api = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')

Page({
  data: {
    pendingSync: [],
    syncing: false,
    syncResult: {
      success: 0,
      failed: 0
    }
  },

  onLoad() {
    this.loadPendingSync()
  },

  onShow() {
    // 页面显示时刷新待同步列表
    this.loadPendingSync()
  },

  // 加载待同步的数据
  loadPendingSync() {
    const recordsKey = getUserStorageKey('recipeRecords')
    const records = wx.getStorageSync(recordsKey) || {}

    const pending = []
    Object.keys(records).forEach(date => {
      Object.keys(records[date]).forEach(mealType => {
        const record = records[date][mealType]
        if (record && !record.synced) { // 未同步过的记录
          pending.push({
            date,
            mealType,
            record,
            mealName: this.getMealName(mealType)
          })
        }
      })
    })

    this.setData({ pendingSync: pending })
  },

  // 获取餐次名称
  getMealName(mealType) {
    const names = {
      breakfast: '早餐',
      lunch: '午餐',
      dinner: '晚餐'
    }
    return names[mealType] || mealType
  },

  // 同步数据
  async syncData() {
    if (this.data.pendingSync.length === 0) {
      wx.showToast({
        title: '没有待同步的数据',
        icon: 'none'
      })
      return
    }

    // 检查网络
    const network = wx.getNetworkTypeSync()
    if (network.networkType === 'none') {
      wx.showToast({
        title: '无网络连接，请检查网络',
        icon: 'none'
      })
      return
    }

    this.setData({
      syncing: true,
      syncResult: { success: 0, failed: 0 }
    })

    try {
      const userId = this.getCurrentUserId()
      const recordsKey = getUserStorageKey('recipeRecords')
      const records = wx.getStorageSync(recordsKey) || {}

      for (const item of this.data.pendingSync) {
        try {
          const recipeRecord = {
            userId: userId,
            recordDate: item.date,
            recordDateString: item.date,
            mealType: item.mealType,
            recipeName: item.record.name,
            dishIds: item.record.dishes ? item.record.dishes.map(d => d.id) : [],
            isManual: item.record.manual ? 1 : 0
          }

          await api.saveRecipeRecord(recipeRecord)

          // 标记为已同步
          if (records[item.date] && records[item.date][item.mealType]) {
            records[item.date][item.mealType].synced = true
          }

          this.setData({
            'syncResult.success': this.data.syncResult.success + 1
          })
        } catch (error) {
          console.error(`同步失败: ${item.date} ${item.mealType}`, error)
          this.setData({
            'syncResult.failed': this.data.syncResult.failed + 1
          })
        }
      }

      // 保存更新后的记录
      wx.setStorageSync(recordsKey, records)

      // 显示结果
      const { success, failed } = this.data.syncResult
      if (failed === 0) {
        wx.showToast({
          title: `同步成功：${success}条`,
          icon: 'success'
        })
      } else {
        wx.showModal({
          title: '同步完成',
          content: `成功：${success}条\n失败：${failed}条`,
          showCancel: false
        })
      }

      // 刷新列表
      this.loadPendingSync()
    } catch (error) {
      console.error('同步过程异常:', error)
      wx.showToast({
        title: '同步失败，请重试',
        icon: 'error'
      })
    } finally {
      this.setData({ syncing: false })
    }
  },

  // 获取当前用户ID
  getCurrentUserId() {
    try {
      const userInfo = wx.getStorageSync('userInfo') || {}
      return userInfo.id || 1
    } catch (e) {
      console.error('获取用户ID失败:', e)
      return 1
    }
  },

  // 清除已同步的数据
  clearSyncedData() {
    wx.showModal({
      title: '确认清除',
      content: '确定要清除所有已同步的本地数据吗？这不会影响云端数据。',
      success: (res) => {
        if (res.confirm) {
          const recordsKey = getUserStorageKey('recipeRecords')
          const records = wx.getStorageSync(recordsKey) || {}

          // 只保留未同步的数据
          const unsyncedRecords = {}
          Object.keys(records).forEach(date => {
            Object.keys(records[date]).forEach(mealType => {
              const record = records[date][mealType]
              if (record && !record.synced) {
                if (!unsyncedRecords[date]) {
                  unsyncedRecords[date] = {}
                }
                unsyncedRecords[date][mealType] = record
              }
            })
          })

          wx.setStorageSync(recordsKey, unsyncedRecords)
          wx.showToast({
            title: '清除完成',
            icon: 'success'
          })

          this.loadPendingSync()
        }
      }
    })
  }
})
