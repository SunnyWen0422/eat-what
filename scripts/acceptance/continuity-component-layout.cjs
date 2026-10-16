// Offline Chromium geometry smoke check. This is not native WeChat validation.
// Supply PLAYWRIGHT_MODULE when Playwright is supplied by a local tool runtime.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = path.resolve(__dirname, '../..')
const output = path.resolve(process.argv[2] || path.join(root, '.superpowers/sdd/2026-10-16-experience-continuity/layout'))
const baseline = process.argv[3]
const files = ['components/compact-dish-row/index.wxss', 'components/assistant-card/index.wxss', 'components/ui-button/ui-button.wxss', 'components/ui-field/ui-field.wxss']
function css(ref) {
 return files.map(file => ref ? execFileSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, file), 'utf8')).join('\n').replace(/@import[^;]+;/g, '')
}
function markup(scale) {
 const rows = ['番茄炒蛋', '清蒸鲈鱼', '冬瓜汤'].map((name, i) => `<div class="dish-row ${scale >= 1.3 ? 'is-large-text' : ''}" data-row="${i}"><button class="dish-main"><span class="dish-thumbnail"><span class="dish-placeholder">图</span></span><span class="dish-copy"><span class="dish-name">${name}</span><span class="dish-meta">家常菜 · 预计 20 分钟</span></span></button><button class="dish-replace ${i ? 'is-disabled' : ''}" ${i ? 'disabled' : ''}>${i === 1 ? '替换中' : i === 2 ? '已保留' : '换一道'}</button><button class="dish-more ${i === 1 ? 'is-disabled' : ''}" ${i === 1 ? 'disabled' : ''} aria-label="本餐操作">···</button></div>`).join('')
 return `<main>${rows}<section class="assistant-card"><span class="card-title">这餐的三道菜</span><span class="card-meta">2026年10月16日 · 晚餐 · 2人</span>${['番茄炒蛋', '清蒸鲈鱼', '冬瓜汤'].map(name => `<div class="card-row"><button class="card-dish"><span class="card-picture card-fallback">图</span><span class="card-name"><span class="card-name-text">${name}</span><span class="card-meta">查看做法</span></span><span>›</span></button></div>`).join('')}<button class="button primary card-action">确认保存这份搭配到晚餐计划</button><button class="button secondary is-disabled card-action" disabled>正在核对</button><span class="error" role="alert">未能保存，请重试</span></section></main>`
}
async function run() {
 fs.mkdirSync(output, { recursive: true })
 const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath:process.env.CHROMIUM_EXECUTABLE } : {}) }), results = []
 try {
  for (const width of [320, 390]) for (const scale of [1, 1.3, 2]) {
   const page = await browser.newPage({ viewport: { width, height: 844 } })
   const measure = async (style) => {
    await page.setContent(`<meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#E9F0E9;font: ${16 * scale}px/1.5 sans-serif}main{min-width:0}button{font-family:inherit;cursor:pointer;border:0}span{box-sizing:border-box}${style}</style>${markup(scale)}`)
    return page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
     buttons: [...document.querySelectorAll('button')].map(node => ({ className:node.className, width:node.getBoundingClientRect().width, height:node.getBoundingClientRect().height })),
     rows: [...document.querySelectorAll('[data-row]')].map(node => ({ top:node.getBoundingClientRect().top, height:node.getBoundingClientRect().height })),
     images: [...document.querySelectorAll('.dish-thumbnail')].map(node => ({ width:node.getBoundingClientRect().width, height:node.getBoundingClientRect().height })),
     innerBackground: getComputedStyle(document.querySelector('.card-dish')).backgroundColor }))
   }
   const before = baseline ? await measure(css(baseline)) : null, after = await measure(css())
   assert.equal(after.overflow, false, `large labels preserve hit area: horizontal overflow at ${width}/${scale}`)
   for (const button of after.buttons) { assert.ok(button.width >= 44 && button.height >= 44, JSON.stringify(button)); if (button.className.includes('primary')) assert.ok(button.height >= 48) }
   assert.ok(after.images.every(image => image.width === 56 && image.height === 56))
   if (width === 390 && scale === 1) { assert.ok(after.rows[1].top + after.rows[1].height <= 844); if (before) assert.deepEqual(after.rows, before.rows) }
   assert.equal(after.innerBackground, 'rgba(0, 0, 0, 0)')
   const stableRows = await page.evaluate(async () => {
    const boxes = () => [...document.querySelectorAll('[data-row]')].map(node => node.getBoundingClientRect().toJSON())
    const before = boxes(), target = document.querySelector('[data-row="1"]')
    target.querySelector('.dish-replace').disabled = true
    target.querySelector('.dish-thumbnail').innerHTML = '<img style="display:block;width:56px;height:56px" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">'
    await target.querySelector('img').decode(); target.querySelector('.dish-name').textContent = '香菇炖鸡'
    target.querySelector('.dish-replace').disabled = false
    return { before, after:boxes() }
   })
   assert.deepEqual(stableRows.before, stableRows.after, 'changed dish keeps surrounding geometry before/after image load')
   await page.screenshot({ path:path.join(output, `${width}-${scale}.png`), fullPage:true })
   const row = page.locator('[data-row="0"]'), rowColor = await row.evaluate(node => getComputedStyle(node).backgroundColor)
   const more = page.locator('[data-row="0"] .dish-more'), box = await more.boundingBox()
   await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(120)
   assert.equal(await more.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(237, 243, 237)', 'more remains visibly pressable')
   assert.equal(await row.evaluate(node => getComputedStyle(node).backgroundColor), rowColor, 'press only changes its action')
   await page.screenshot({ path:path.join(output, `${width}-${scale}-pressed.png`), fullPage:true }); await page.mouse.up()
   results.push({ scenario:'large labels preserve hit area / changed dish keeps surrounding geometry', width, scale, before, after })
   await page.close()
  }
 } finally { await browser.close() }
 fs.writeFileSync(path.join(output, 'geometry.json'), JSON.stringify({ environment:'offline Chromium CSS fixtures; not native WeChat', baseline, results }, null, 2))
 console.log(`Passed 6 layout fixtures (320/390px x 1/1.3/2); output: ${output}`)
}
run().catch(error => { console.error(error); process.exitCode = 1 })
