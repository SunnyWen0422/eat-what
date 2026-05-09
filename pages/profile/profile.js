// pages/profile/profile.js
const api = require('../../utils/api')
const app = getApp()

Page({
  data: {
    userInfo: {
      avatar: 'https://img.yzcdn.cn/vant/cat.jpeg', // 默认头像
      nickname: '吃货达人',
      level: '美食探索者',
      joinDays: 7,
      totalRecipes: 24,
      favoriteDishes: 12
    },
    menuItems: [
      {
        icon: '📊',
        title: '饮食统计',
        desc: '查看饮食数据分析',
        url: '/pages/statistics/statistics'
      },
      {
        icon: '🔄',
        title: '数据同步',
        desc: '同步离线数据到云端',
        url: '/pages/sync/sync'
      },
      {
        icon: '⭐',
        title: '收藏菜品',
        desc: '我喜欢的菜品',
        url: '/pages/favorite-dishes/favorite-dishes'
      },
      {
        icon: '🛒',
        title: '购物清单',
        desc: '智能生成采购清单',
        url: '/pages/shopping-list/shopping-list'
      },
      {
        icon: '⚙️',
        title: '设置',
        desc: '应用设置和偏好',
        url: '/pages/settings/settings'
      },
      {
        icon: '📞',
        title: '联系我们',
        desc: '意见反馈和帮助',
        url: '/pages/contact/contact'
      },
      {
        icon: 'ℹ️',
        title: '关于',
        desc: '版本信息和更新日志',
        url: '/pages/about/about'
      }
    ]
  },

  onLoad() {
    this.loadUserInfo()
  },

  onShareAppMessage() {
    return {
      title: '吃什么？帮我选好每天吃什么，快来试试！',
      path: '/pages/index/index'
    }
  },

  onShareTimeline() {
    return {
      title: '吃什么？帮我选好每天吃什么，快来试试！'
    }
  },
  
  onShow() {
    // 页面显示时刷新用户信息
    this.loadUserInfo()
  },

  // 加载用户信息
  async loadUserInfo() {
    try {
      // 先从本地存储获取
      const localUserInfo = wx.getStorageSync('userInfo')
      if (localUserInfo) {
        this.setData({
          userInfo: {
            ...this.data.userInfo,
            ...localUserInfo
          }
        })
      }

      // 从API获取最新用户信息
      const userResult = await api.getUserInfo()
      if (userResult.success && userResult.user) {
        const user = userResult.user

        // 计算注册天数
        let joinDays = 0
        if (user.registerTime) {
          const registerDate = new Date(user.registerTime)
          const now = new Date()
          joinDays = Math.floor((now - registerDate) / (1000 * 60 * 60 * 24))
        }

        // 更新本地存储
        wx.setStorageSync('userInfo', user)
        app.globalData.userInfo = user

        // 更新页面用户信息
        this.setData({
          userInfo: {
            avatar: user.avatar || 'https://img.yzcdn.cn/vant/cat.jpeg',
            nickname: user.nickname || '吃货达人',
            level: '美食探索者',
            joinDays: joinDays || 0
          }
        })
      }

      // 获取统计数据
      await this.loadStatistics()
    } catch (err) {
      console.error('加载用户信息失败:', err)
      // 如果API调用失败，至少显示本地存储的信息
    }
  },

  // 加载统计数据
  async loadStatistics() {
    // 获取收藏菜品数量（独立try-catch，后端未部署时不影响其他功能）
    try {
      const favorites = await api.getFavoriteDishes()
      this.setData({
        'userInfo.favoriteDishes': favorites.length || 0
      })
    } catch (err) {
      console.log('收藏功能暂不可用')
    }

    // 获取当前月份的统计数据（独立try-catch）
    try {
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const startDate = `${year}-${month}-01`
      const endDate = `${year}-${month}-31`

      const statsResult = await api.getStatistics(startDate, endDate)
      let totalRecipes = 0
      if (statsResult.success && statsResult.data) {
        const stats = statsResult.data
        totalRecipes = (stats.meatCount || 0) + (stats.vegCount || 0) + (stats.soupCount || 0)
      }

      this.setData({
        'userInfo.totalRecipes': totalRecipes
      })
    } catch (err) {
      console.log('统计数据加载失败')
    }
  },

  // 点击用户信息区域
  onUserInfoTap() {
    wx.showModal({
      title: '用户信息',
      content: '这里可以编辑个人信息、设置头像等功能',
      showCancel: false
    })
  },

  // 点击统计卡片
  onStatTap(e) {
    const { type } = e.currentTarget.dataset
    wx.showToast({
      title: `${type}功能开发中`,
      icon: 'none'
    })
  },

  // 点击菜单项
  onMenuTap(e) {
    const { index } = e.currentTarget.dataset
    const menuItem = this.data.menuItems[index]

    if (menuItem.url) {
      // 如果有跳转链接
      wx.navigateTo({
        url: menuItem.url
      })
    } else {
      // 显示功能提示
      wx.showModal({
        title: menuItem.title,
        content: `${menuItem.desc}\n\n此功能正在开发中，敬请期待！`,
        showCancel: false,
        confirmText: '知道了'
      })
    }
  },

  // 编辑用户信息
  onEditProfile() {
    wx.showActionSheet({
      itemList: ['修改昵称', '更换头像', '设置偏好'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 修改昵称
          this.editNickname()
        } else if (res.tapIndex === 1) {
          // 更换头像
          this.editAvatar()
        } else {
          wx.showModal({
            title: '功能提示',
            content: '「设置偏好」功能正在开发中',
            showCancel: false
          })
        }
      }
    })
  },
  
  // 修改昵称
  editNickname() {
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入新昵称',
      success: async (res) => {
        if (res.confirm && res.content) {
          try {
            const result = await api.updateUserInfo({ nickname: res.content })
            if (result.success) {
              wx.showToast({
                title: '修改成功',
                icon: 'success'
              })
              // 刷新用户信息
              this.loadUserInfo()
            } else {
              wx.showToast({
                title: result.message || '修改失败',
                icon: 'none'
              })
            }
          } catch (err) {
            console.error('修改昵称失败:', err)
            wx.showToast({
              title: '修改失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },
  
  // 更换头像
  editAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0]
        
        // 这里应该上传图片到服务器，然后获取图片URL
        // 暂时直接使用本地路径（实际应该上传后获取服务器URL）
        wx.showToast({
          title: '头像上传功能开发中',
          icon: 'none'
        })
        
        // TODO: 实现图片上传
        // const uploadResult = await uploadImage(tempFilePath)
        // if (uploadResult.success) {
        //   await api.updateUserInfo({ avatar: uploadResult.url })
        //   this.loadUserInfo()
        // }
      }
    })
  }
})
