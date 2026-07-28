const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')

test('complete admin workspaces are registered', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  for (const page of [
    'pages/admin-dashboard/admin-dashboard',
    'pages/admin-users/admin-users',
    'pages/admin-user-detail/admin-user-detail',
    'pages/admin-dishes/admin-dishes',
    'pages/admin-audit/admin-audit',
  ]) assert.ok(app.pages.includes(page), page)
})

test('admin API wrappers expose overview, status, dishes and audit contracts', () => {
  const source = fs.readFileSync(path.join(root, 'utils/api.js'), 'utf8')
  for (const name of [
    'getAdminOverview', 'updateAdminUserStatus', 'getAdminDishes',
    'getAdminDish', 'updateAdminDish', 'updateAdminDishStatus',
    'updateAdminUserDish', 'getAdminAuditLogs',
  ]) assert.match(source, new RegExp(`function ${name}\\(`), name)
})
