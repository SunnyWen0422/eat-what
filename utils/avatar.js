const config = require('./config')
function resolveAvatar(value) {
  if (typeof value !== 'string') return ''
  if (/^\/users\/avatar-images\/[a-f0-9]{32}$/.test(value)) return config.getApiBaseUrl() + value
  return /^https?:\/\//.test(value) ? value : ''
}
function uploadAvatar(filePath, confirmation) {
  return new Promise((resolve, reject) => wx.uploadFile({
    url: config.getApiBaseUrl() + '/users/avatar', filePath, name: 'file', formData: confirmation,
    header: { Authorization: 'Bearer ' + (wx.getStorageSync('token') || '') }, timeout: 15000,
    success: response => {
      let data
      try { data = JSON.parse(response.data) } catch (error) { reject({ statusCode: response.statusCode }); return }
      if (response.statusCode === 200 && data.success) resolve(data)
      else reject({ statusCode: response.statusCode, data })
    }, fail: error => reject({ isNetworkError: true, err: error }),
  }))
}
module.exports = { resolveAvatar, uploadAvatar }
