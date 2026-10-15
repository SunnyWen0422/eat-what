// Visual acceptance only: fixtures suppress page lifecycle and deny transport.
// Product interactions are covered separately by offline regression tests.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const arg = name => process.argv[process.argv.indexOf(name) + 1]
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const root = path.resolve(__dirname, '../..')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = (promise, ms = 20000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('Native operation timed out')), ms)
  promise.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
})
function validate(project) {
  const resolved = fs.realpathSync(project), parent = path.dirname(resolved)
  if (resolved === root || resolved.startsWith(root + path.sep)) throw Error('Canonical repository is not an acceptance export')
  const manifest = read(path.join(parent, 'native-manifest.json'))
  if (sha(path.join(resolved, 'native-guard.js')) !== manifest.guardSha256) throw Error('Guard mismatch')
  if (sha(path.join(resolved, 'source-manifest.json')) !== manifest.sourceManifestSha256) throw Error('Source manifest mismatch')
  const config = fs.readFileSync(path.join(resolved, 'utils/config.js'), 'utf8')
  if (!config.includes('http://127.0.0.1:9/api') || /https:\/\/chishenme\.icu/.test(config)) throw Error('Only disconnected loopback API allowed')
  if (read(path.join(resolved, 'project.config.json')).appid !== 'touristappid') throw Error('Tourist fixture required')
  const app = fs.readFileSync(path.join(resolved, 'app.js'), 'utf8')
  if (!app.includes("require('./native-guard')") || !app.includes('nativeAcceptance')) throw Error('Guard is not loaded before pages')
  for (const item of manifest.overrides) if (sha(path.join(resolved, item.path)) !== item.fixtureSha256) throw Error('Override mismatch: ' + item.path)
  const overrides = new Set(manifest.overrides.map(item => item.path))
  for (const item of manifest.sourceManifest.files) {
    const file = path.resolve(resolved, item.path)
    if (!file.startsWith(resolved + path.sep)) throw Error('Source path escapes export')
    if (!overrides.has(item.path) && sha(file) !== item.sha256) throw Error('Source file mismatch: ' + item.path)
  }
  if (sha(path.join(parent, 'native-fixtures.json')) !== manifest.fixtureCasesSha256) throw Error('Fixture mismatch')
  return { resolved, parent, manifest }
}
async function main() {
  const verified = validate(arg('--project')), output = path.resolve(arg('--output'))
  if (output === root || output.startsWith(root + path.sep)) throw Error('Evidence must stay outside repository')
  fs.mkdirSync(output, { recursive: true })
  const sdk = require(path.resolve(arg('--sdk'))), endpoint = arg('--endpoint')
  if (!/^ws:\/\/127\.0\.0\.1:\d+$/.test(endpoint)) throw Error('Only local automation allowed')
  const report = { source: verified.manifest.finalSourceSignal, project: verified.resolved, cases: [], exceptions: [], limits: ['Synthetic data, suppressed lifecycle; no backend/model or real-device proof', 'Native viewport is measured, never inferred from requested width'] }
  const save = () => fs.writeFileSync(path.join(output, 'native-results.json'), JSON.stringify(report, null, 2))
  const mini = await timeout(sdk.connect({ wsEndpoint: endpoint }))
  mini.on('exception', error => { report.exceptions.push(String(error.message || error).slice(0, 500)); save() })
  try {
    const identity = await timeout(mini.evaluate(() => ({ label: getApp().globalData.nativeAcceptance.label, runId: getApp().globalData.nativeAcceptance.runId })))
    if (identity.label !== '原生验收 · 合成数据' || identity.runId !== path.basename(verified.parent)) throw Error('Connected project identity mismatch')
    report.viewport = await timeout(mini.systemInfo())
    const fixtures = read(path.join(verified.parent, 'native-fixtures.json'))
    const filter = process.argv.includes('--cases') ? arg('--cases').split(',') : null
    for (const test of fixtures.filter(row => !filter || filter.includes(row.name))) {
      const key = ['index', 'customize', 'dish-detail', 'chat', 'shopping-preview'].includes(test.route)
      const scales = process.argv.includes('--scales') ? arg('--scales').split(',').map(Number) : key ? [1, 1.3, 2] : [1]
      for (const scale of scales) {
        const result = { id: test.name, page: test.route, fontScale: scale, actualWidth: report.viewport.windowWidth }
        try {
          const page = await timeout(mini.reLaunch('/pages/' + test.route + '/' + test.route))
          await timeout(page.setData({ ...test.data, fontScale: scale })); await sleep(150)
          if (['dish-detail', 'shopping-preview'].includes(test.route)) {
            await timeout(mini.evaluate(method => { const page = getCurrentPages().slice(-1)[0]; return page[method]() }, test.route === 'dish-detail' ? 'measureDetailActions' : 'measurePreviewActions'))
            await sleep(100)
          }
          result.screenshot = path.join(output, test.name + '-font' + scale + '.png')
          await timeout(mini.screenshot({ path: result.screenshot }))
          result.buttons = await timeout(mini.evaluate(() => new Promise(resolve => wx.createSelectorQuery().selectAll('.ew-hit-target, .ew-page >>> .button, .connected-assistant >>> .button').boundingClientRect(resolve).exec())))
          result.buttons = (result.buttons || []).filter(rect => rect.width > 0 && rect.height > 0).map(rect => ({ ...rect, clipped: rect.left < -1 || rect.right > report.viewport.windowWidth + 1 }))
          result.status = 'captured'
          if (process.argv.includes('--inspect')) {
            result.componentButtons = await timeout(mini.evaluate(() => new Promise(resolve => wx.createSelectorQuery().selectAll('.ew-page >>> .dish-main, .ew-page >>> .dish-replace, .ew-page >>> .dish-more').boundingClientRect(resolve).exec())))
            result.componentButtons = (result.componentButtons || []).filter(rect => rect.width > 0 && rect.height > 0)
            const scroll = await timeout(page.$('scroll-view'))
            if (scroll) {
              await timeout(scroll.scrollTo(0, 999999)); await sleep(150)
              result.scroll = { height: await timeout(scroll.scrollHeight()), viewport: await timeout(scroll.size()) }
            } else { await timeout(mini.pageScrollTo(999999)); await sleep(150); result.scroll = { kind: 'page' } }
            result.bottomScreenshot = path.join(output, test.name + '-font' + scale + '-bottom.png')
            await timeout(mini.screenshot({ path: result.bottomScreenshot }))
          }
        } catch (error) { result.error = String(error.message).slice(0, 500) }
        report.cases.push(result); save()
        console.log(result.id + ' ' + scale + ': ' + (result.error || 'captured'))
        if (result.error && /timed out/.test(result.error)) throw Error('Stopped after native timeout; remaining cases uncovered')
      }
    }
    report.guard = await timeout(mini.evaluate(() => ({ denied: getApp().globalData.nativeAcceptance.denied, lifecycle: getApp().globalData.nativeAcceptance.lifecycle })))
  } finally { mini.disconnect(); report.endedAt = new Date().toISOString(); save() }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { validate }
