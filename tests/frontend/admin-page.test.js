const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createApiMock, createWx, loadPage } = require('./wechat-runtime')

const root = path.resolve(__dirname, '../..')
const adminPage = path.join(root, 'pages/admin/admin.js')

function metadataOptions() {
  return {
    metadataVersion: 1,
    groups: {
      cuisine: [{ code: 'SICHUAN', label: '川菜' }],
      flavor: [{ code: 'SPICY', label: '香辣' }],
      scene: [{ code: 'HOME_STYLE', label: '家常菜' }],
      diet: [],
      method: [{ code: 'STIR_FRY', label: '炒' }],
    },
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

function loadAdmin(apiOverrides = {}) {
  const api = createApiMock({
    getAdminUsers: async () => ({ list: [], total: 0, page: 1, pageSize: 20 }),
    getAdminUser: async id => ({ user: { id, nickname: '测试用户' }, customDishes: [] }),
    createAdminUserDish: async (id, dish) => ({ success: true, dish: { id: 88, userId: id, ...dish } }),
    deleteAdminUserDish: async () => ({ success: true }),
    ...apiOverrides,
  })
  const wx = createWx()
  const mocks = {
    '../../utils/api': api,
    '../../utils/recommendation-options': {
      loadRecommendationOptions: async () => ({ options: metadataOptions(), synced: true }),
    },
  }
  return { api, ...loadPage(adminPage, { wx, mocks }) }
}

test('admin list searches from page one and appends the next page', async () => {
  const calls = []
  const { page } = loadAdmin({
    getAdminUsers: async params => {
      calls.push(params)
      const id = params.page === 1 ? 1 : 2
      return { list: [{ id, nickname: `用户${id}`, customCount: id }], total: 2, page: params.page, pageSize: 1 }
    },
  })
  page.pageSize = 1

  await page.onLoad()
  page.onSearchInput({ detail: { value: ' 张三 ' } })
  await page.onSearchSubmit()
  await page.onLoadMore()

  assert.deepEqual(calls.map(item => [item.keyword, item.page, item.pageSize]), [
    [undefined, 1, 1],
    ['张三', 1, 1],
    ['张三', 2, 1],
  ])
  assert.deepEqual(page.data.users.map(item => item.id), [1, 2])
  assert.equal(page.data.hasMore, false)
})

test('admin pull-down refresh resets the list and always stops the indicator', async () => {
  let requests = 0
  const { page, wx } = loadAdmin({
    getAdminUsers: async () => {
      requests += 1
      return { list: [{ id: requests }], total: 1, page: 1, pageSize: 20 }
    },
  })

  await page.onLoad()
  await page.onPullDownRefresh()

  assert.equal(page.data.users[0].id, 2)
  assert.ok(wx.calls.some(call => call[0] === 'stopPullDownRefresh'))
})

test('a newer user search supersedes a pending request and ignores its stale response', async () => {
  const first = deferred()
  const second = deferred()
  const calls = []
  const { page } = loadAdmin({
    getAdminUsers: params => {
      calls.push(params)
      return calls.length === 1 ? first.promise : second.promise
    },
  })

  const initialLoad = page.onLoad()
  await flushPromises()
  page.onSearchInput({ detail: { value: '新用户' } })
  const latestSearch = page.onSearchSubmit()
  await flushPromises()

  assert.equal(calls.length, 2)
  assert.equal(calls[1].keyword, '新用户')

  second.resolve({ list: [{ id: 2, nickname: '新用户' }], total: 1, page: 1, pageSize: 20 })
  await latestSearch
  first.resolve({ list: [{ id: 1, nickname: '旧用户' }], total: 1, page: 1, pageSize: 20 })
  await initialLoad

  assert.deepEqual(page.data.users.map(user => user.id), [2])
  assert.equal(page.data.displayedKeyword, '新用户')
  assert.equal(page.data.loading, false)
  assert.equal(page.data.refreshing, false)
})

test('a failed refresh keeps visible users and ends with a nonblocking notice', async () => {
  const refresh = deferred()
  let calls = 0
  const { page } = loadAdmin({
    getAdminUsers: () => {
      calls += 1
      if (calls === 1) {
        return Promise.resolve({ list: [{ id: 1, nickname: '已有用户' }], total: 1, page: 1, pageSize: 20 })
      }
      return refresh.promise
    },
  })

  await page.onLoad()
  const pendingRefresh = page.loadUsers(true)

  assert.deepEqual(page.data.users.map(user => user.id), [1])
  assert.equal(page.data.displayedKeyword, '')
  assert.equal(page.data.refreshing, true)
  assert.equal(page.data.loading, false)

  refresh.reject(new Error('offline'))
  await pendingRefresh

  assert.deepEqual(page.data.users.map(user => user.id), [1])
  assert.match(page.data.listNotice, /仍显示上次结果/)
  assert.equal(page.data.refreshing, false)
  assert.equal(page.data.loading, false)
})

test('a new search supersedes pending load-more without appending its response', async () => {
  const pageTwo = deferred()
  const calls = []
  const { page } = loadAdmin({
    getAdminUsers: params => {
      calls.push(params)
      if (params.keyword === '目标') {
        return Promise.resolve({ list: [{ id: 9, nickname: '目标用户' }], total: 1, page: 1, pageSize: 1 })
      }
      if (params.page === 2) return pageTwo.promise
      return Promise.resolve({ list: [{ id: 1, nickname: '原用户' }], total: 2, page: 1, pageSize: 1 })
    },
  })
  page.pageSize = 1

  await page.onLoad()
  const pendingMore = page.onLoadMore()
  await flushPromises()
  page.onSearchInput({ detail: { value: '目标' } })
  const latestSearch = page.onSearchSubmit()
  await latestSearch

  assert.deepEqual(page.data.users.map(user => user.id), [9])
  pageTwo.resolve({ list: [{ id: 2, nickname: '迟到用户' }], total: 2, page: 2, pageSize: 1 })
  await pendingMore

  assert.deepEqual(page.data.users.map(user => user.id), [9])
  assert.equal(page.data.loadingMore, false)
})

test('the newest user detail wins when responses arrive out of order', async () => {
  const userOne = deferred()
  const userTwo = deferred()
  const { page } = loadAdmin({
    getAdminUser: id => id === 1 ? userOne.promise : userTwo.promise,
  })
  await page.onLoad()

  const firstDetail = page.loadUserDetail(1)
  const latestDetail = page.loadUserDetail(2)
  userTwo.resolve({ user: { id: 2, nickname: '用户二' }, customDishes: [] })
  await latestDetail
  userOne.resolve({ user: { id: 1, nickname: '用户一' }, customDishes: [] })
  await firstDetail

  assert.equal(page.data.selectedUser.id, 2)
  assert.equal(page.data.detailLoading, false)
  assert.equal(page.data.detailRefreshing, false)
})

test('a failed detail refresh keeps the current user visible with feedback', async () => {
  const refresh = deferred()
  let calls = 0
  const { page } = loadAdmin({
    getAdminUser: async id => {
      calls += 1
      if (calls === 1) return { user: { id, nickname: '当前用户' }, customDishes: [{ id: 8, name: '已有菜' }] }
      return refresh.promise
    },
  })
  await page.onLoad()
  await page.loadUserDetail(7)

  const pendingRefresh = page.loadUserDetail(7)
  assert.equal(page.data.selectedUser.id, 7)
  assert.equal(page.data.detailRefreshing, true)
  assert.equal(page.data.detailLoading, false)

  refresh.reject(new Error('offline'))
  await pendingRefresh

  assert.equal(page.data.selectedUser.id, 7)
  assert.equal(page.data.userDishes[0].id, 8)
  assert.match(page.data.detailNotice, /仍显示上次内容/)
  assert.equal(page.data.detailRefreshing, false)
})

test('admin creates a complete user-owned dish and refreshes user detail', async () => {
  const created = []
  let detailLoads = 0
  const { page } = loadAdmin({
    getAdminUser: async id => {
      detailLoads += 1
      return { user: { id, nickname: '小王' }, customDishes: [] }
    },
    createAdminUserDish: async (id, dish) => {
      created.push({ id, dish })
      return { success: true, dish: { id: 90, userId: id, ...dish } }
    },
  })

  await page.onLoad()
  await page.onSelectUser({ currentTarget: { dataset: { id: 7 } } })
  page.onShowAdd()
  page.onDishInput({ currentTarget: { dataset: { field: 'name' } }, detail: { value: ' 回锅肉 ' } })
  page.onDishInput({ currentTarget: { dataset: { field: 'ingredients' } }, detail: { value: '五花肉\n青椒' } })
  page.onDishInput({ currentTarget: { dataset: { field: 'steps' } }, detail: { value: '切片\n炒熟' } })
  page.onDishInput({ currentTarget: { dataset: { field: 'cookMinutes' } }, detail: { value: '25' } })
  page.onCuisineChange({ detail: { value: 1 } })
  page.onTagTap({ currentTarget: { dataset: { code: 'HOME_STYLE' } } })
  await page.onSaveDish()

  assert.equal(created.length, 1)
  assert.equal(created[0].id, 7)
  assert.deepEqual(created[0].dish, {
    name: '回锅肉',
    type: 'meat',
    cl: '五花肉#青椒',
    step: '切片#炒熟',
    cuisineCode: 'SICHUAN',
    tagCodes: 'HOME_STYLE',
    tags: '家常菜',
    cookMinutes: 25,
  })
  assert.equal(page.data.mode, 'detail')
  assert.equal(detailLoads, 2)
})

test('admin validates required fields and prevents duplicate saves', async () => {
  let resolveSave
  let saveCalls = 0
  const pending = new Promise(resolve => { resolveSave = resolve })
  const { page, wx } = loadAdmin({
    createAdminUserDish: async () => {
      saveCalls += 1
      await pending
      return { success: true }
    },
  })
  page.setData({ selectedUser: { id: 7 }, mode: 'form' })

  await page.onSaveDish()
  assert.ok(wx.calls.some(call => call[0] === 'showToast' && call[1].title.includes('菜名')))

  page.setData({
    newDish: { name: '测试菜', type: 'veg', ingredients: '食材', steps: '步骤', cuisineCode: '', cuisineLabel: '未设置', tagCodes: [], cookMinutes: '' },
  })
  const first = page.onSaveDish()
  const second = page.onSaveDish()
  assert.equal(saveCalls, 1)
  resolveSave()
  await Promise.all([first, second])
})

test('admin template and styles provide mobile list, full-screen form and safe actions', () => {
  const template = fs.readFileSync(path.join(root, 'pages/admin/admin.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'pages/admin/admin.wxss'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(root, 'pages/admin/admin.json'), 'utf8'))

  assert.match(template, /class="search-input"/)
  assert.match(template, /mode === 'form'/)
  assert.match(template, /class="form-page"/)
  assert.match(template, /class="action-bar"/)
  assert.match(template, /refreshing/)
  assert.match(template, /listNotice/)
  assert.match(template, /detailRefreshing/)
  assert.match(template, /detailNotice/)
  assert.match(template, /displayedKeyword/)
  assert.match(template, /正在搜索/)
  assert.doesNotMatch(template, /class="modal"/)
  assert.match(styles, /env\(safe-area-inset-bottom\)/)
  assert.match(styles, /min-height:\s*88rpx/)
  assert.match(styles, /word-break:\s*break-word/)
  assert.equal(config.enablePullDownRefresh, true)
})
