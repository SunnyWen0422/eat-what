// A refreshed token belongs to the same known user; without a user identifier,
// the token is the only available ownership boundary and must fail closed.
function currentIdentity() {
  const user = wx.getStorageSync('userInfo') || {}
  if (user.id) return `id:${user.id}`
  if (user.openId) return `open:${user.openId}`
  const token = String(wx.getStorageSync('token') || '')
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) hash = Math.imul(hash ^ token.charCodeAt(index), 16777619)
  return token ? `token:${hash >>> 0}` : 'anonymous'
}

module.exports = { currentIdentity }
