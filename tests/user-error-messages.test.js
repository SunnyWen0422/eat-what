const test = require('node:test')
const assert = require('node:assert/strict')
const { errorMessage } = require('../utils/meal-workflow')

test('errors keep actionable validation and conflicts while suppressing raw technical details', () => {
  assert.equal(errorMessage(new Error('人数应为 1 至 50')), '人数应为 1 至 50')
  assert.equal(errorMessage({ statusCode: 400, data: { message: '日期格式错误，应为 yyyy-MM-dd' } }), '日期格式错误，应为 yyyy-MM-dd')
  assert.equal(errorMessage(new Error('手机号格式错误，请输入11位手机号')), '手机号格式错误，请输入11位手机号')
  assert.equal(errorMessage({ statusCode: 409, data: { message: '菜单已在另一处修改，请重新读取' } }), '菜单已在另一处修改，请重新读取')
  for (const value of ['TypeError: cannot read properties of undefined', '保存失败：java.lang.IllegalArgumentException: 字段无效', '接口请求失败 HTTP 500', 'SQL 查询失败 SELECT * FROM food', '失败：C:\\service\\application.yml', '读取失败：/opt/app/x.js', '<html>服务异常</html>', '诊断 ID：WORKSPACE_INTERNAL_ERROR', '请求体格式错误，请检查 JSON 格式']) {
    assert.equal(errorMessage({ statusCode: 400, data: { message: value } }, '暂未保存，输入仍保留，请重试'), '暂未保存，输入仍保留，请重试')
  }
  assert.equal(errorMessage({ statusCode: 409, data: { message: 'SQL执行失败' } }), '内容已更新，请重新读取后确认修改')
})

test('unknown save result uses the original recovery message rather than a server error', () => {
  assert.equal(errorMessage({ statusCode: 503, data: { message: '服务器内部错误，请稍后重试' } }, '保存结果待确认，请重试这次保存'), '保存结果待确认，请重试这次保存')
  assert.equal(errorMessage({ errMsg: 'request:fail timeout' }, '加载未完成，请重试'), '加载未完成，请重试')
})

test('API toast applies the same safe message rule and preserves the rejected response for recovery', async () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
  const module = { exports: {} }, toasts = []
  const response = { message: '服务错误：java.lang.IllegalArgumentException: /opt/app/x.js' }
  const wx = { getStorageSync: key => key === 'userInfo' ? { id: 'A' } : '', showToast: value => toasts.push(value.title), request: value => value.success({ statusCode: 400, data: response }) }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../utils/api.js'),'utf8'), { module, wx, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
    require: name => name === './config' ? { getApiBaseUrl: () => 'https://test.invalid/api' } : name === './meal-workflow' ? require('../utils/meal-workflow') : require(path.join(__dirname,'../utils',name)) })
  await assert.rejects(module.exports.request('/example','GET'), error => error.statusCode === 400 && error.data === response)
  assert.deepEqual(toasts, ['暂未完成，请稍后重试'])
})
