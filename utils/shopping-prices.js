const presentation = require('./shopping-display')
const totalQuantity = items => items.map(i => presentation.quantityText(i.quantityText, i)).filter(Boolean).join(' + ')
const CHANNELS = ['叮咚', '盒马', '菜市场', '超市', '其他']
const hex = value => String(value || '').split('').map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')
function ingredientKey(item) {
  const name = item.canonicalName || item.displayName || ''
  return !item.sourceDishId ? 'm' + hex(item.canonicalName || (item.id != null ? 'id_' + item.id : item.clientKey)) : 'i' + hex(name) + 'v' + hex(item.normalizedVariant)
}
function amountCents(value) {
  const text = String(value == null ? '' : value).trim()
  if (!/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(text)) throw Error('请输入有效金额，最多两位小数')
  const [whole, fraction = ''] = text.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
function scaled(value, places) {
  const text = String(value == null ? '' : value)
  if (!new RegExp('^\\d+(\\.\\d{1,' + places + '})?$').test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  const result = Number(whole) * 10 ** places + Number(fraction.padEnd(places, '0'))
  return Number.isSafeInteger(result) ? result : null
}
function shanghaiDate(now = new Date()) { return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10) }
function usableQuote(quote, today) {
  if (!quote || quote.status !== 'AVAILABLE' || !/^\d{4}-\d{2}-\d{2}$/.test(quote.quoteDate || '')) return false
  if (!Number.isFinite(Date.parse(quote.quoteDate)) || new Date(quote.quoteDate).toISOString().slice(0, 10) !== quote.quoteDate) return false
  const age = (Date.parse(today) - Date.parse(quote.quoteDate)) / 86400000
  return age >= 0 && age <= 7
}
function matchesIdentity(item, quote) {
  // Old quote DTOs serialized a default empty variant without echoing canonicalName.
  // Their exact query identity is carried by ingredientKey; an echoed identity must match fully.
  const echoedVariant = quote.canonicalName != null || !!quote.normalizedVariant
  return !(quote.ingredientKey != null && quote.ingredientKey !== ingredientKey(item) || quote.canonicalName != null && quote.canonicalName !== (item.canonicalName || item.displayName) || echoedVariant && quote.normalizedVariant != null && quote.normalizedVariant !== (item.normalizedVariant || ''))
}
function estimate(item, quote, today) {
  if (!usableQuote(quote, today) || item.userOverride || item.parseStatus !== 'PARSED' || item.calculationStatus !== 'CALCULATED') return null
  // New servers echo the exact requested identity after applying the stored official mapping.
  // Legacy responses are still bound to their requested ingredient key by the query adapter.
  if (!matchesIdentity(item, quote)) return null
  const factor = { g: 1, kg: 1000, ml: 1, l: 1000 }
  const family = { g: 'mass', kg: 'mass', ml: 'volume', l: 'volume' }
  if (!factor[item.unitCode] || !factor[quote.unitCode] || item.unitFamily !== family[item.unitCode] || quote.unitFamily !== family[quote.unitCode] || item.unitFamily !== quote.unitFamily) return null
  const quantity = scaled(item.quantityValue, 4), price = scaled(quote.price, 4), base = scaled(quote.unitQuantity, 4)
  if (quantity == null || quantity <= 0 || price == null || !base || price <= 0) return null
  const numerator = quantity * factor[item.unitCode] * price
  const denominator = base * factor[quote.unitCode] * 100
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) return null
  const whole = Math.floor(numerator / denominator)
  return whole + (numerator % denominator >= Math.ceil(denominator / 2) ? 1 : 0)
}
const money = cents => cents == null ? '—' : '¥' + (cents / 100).toFixed(2)
function buildPricing(list, quotes = {}, today = shanghaiDate()) {
  const groups = new Map(), dishCosts = {}
  const sources = new Map()
  let pendingCents = 0, pendingMissing = 0, pendingPriced = 0
  for (const dish of list.dishes || []) {
    let cents = 0, missing = 0, priced = 0
    for (const raw of dish.items || []) {
      const item = { ...raw, sourceDishId: dish.dishId || raw.sourceDishId }
      const key = ingredientKey(item), quote = quotes[key]
      let cost = estimate(item, quote, today)
      if (!item.checked && cost != null && !Number.isSafeInteger(pendingCents + cost)) cost = null
      if (!groups.has(key)) groups.set(key, { ingredientKey: key, displayName: item.displayName || item.canonicalName || '未命名食材', canonicalName: item.canonicalName || item.displayName, normalizedVariant: item.normalizedVariant || '', variantLabel:item.variantLabel, items: [], cents: 0, missing: 0, priced: 0, quote: usableQuote(quote, today) && matchesIdentity(item, quote) ? quote : null })
      const group = groups.get(key); group.items.push(item)
      if (cost == null) { missing++; group.missing++ } else { cents += cost; priced++; group.cents += cost; group.priced++ }
      if (!item.checked) { if (cost == null) pendingMissing++; else {
        pendingCents += cost; pendingPriced++
        const source = { quoteDate: quote.quoteDate, sourceUrl: quote.sourceUrl || null, sourceLabel: quote.sourceLabel || '上海市发展和改革委员会' }
        sources.set(JSON.stringify(source), source)
      } }
    }
    dishCosts[dish.selectionKey] = { cents, missing, priced }
  }
  let actualCents = 0, recorded = 0
  const rows = [...groups.values()].map(group => {
    const saved = (list.expenses || {})[group.ingredientKey]
    const expense = saved && saved.amount != null ? saved : null
    if (expense && expense.amount != null) { actualCents += amountCents(expense.amount); recorded++ }
    const q = group.quote
    return { ...group, displayName: presentation.ingredientName(group), quantityText: totalQuantity(group.items), referenceText: group.missing ? '—' : money(group.priced ? group.cents : null),
      unitPriceText: q ? '¥' + q.price + '/' + q.unitQuantity + ({ g: '克', kg: '千克', ml: '毫升', l: '升' }[q.unitCode] || q.unitCode) : '—',
      quoteLabel: q ? (q.quoteDate === today ? '报价日期 ' : '最近报价 ') + q.quoteDate : '暂无官方参考价',
      actualText: expense ? money(amountCents(expense.amount)) : '—', channel: expense && expense.channel || '', expense: expense || null }
  })
  const pendingTotal = pendingMissing + pendingPriced
  const complete = pendingTotal > 0 && pendingMissing === 0
  const estimateSummary = { scope: 'pending_source_items', coveredCount: pendingPriced, missingCount: pendingMissing, totalCount: pendingTotal,
    knownSubtotalCents: pendingPriced ? pendingCents : null, totalCents: complete ? pendingCents : null, complete,
    quoteDates: [...new Set([...sources.values()].map(source => source.quoteDate))].sort(), sources: [...sources.values()] }
  return { rows, dishCosts, pendingText: money(estimateSummary.knownSubtotalCents), pendingMissing, pendingPriced, pendingTotal, estimateSummary, actualText: money(recorded ? actualCents : null), recorded, total: rows.length }
}
function summarizeEstimate(list, quotes = {}, today = shanghaiDate()) { return buildPricing(list, quotes, today).estimateSummary }
function copyList(list = {}, status = 'pending') {
  const groups = require('./shopping-view').buildShoppingView(list, status).groups
  if (!groups.length) return ''
  const meals = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }
  return ['购物清单（' + (status === 'checked' ? '已买' : '待买') + '）', ...groups.map(group => {
    const date = group.sourceDate ? Number(group.sourceDate.slice(5, 7)) + '月' + Number(group.sourceDate.slice(8)) + '日' : ''
    const context = [date, meals[group.sourceMealType]].filter(Boolean).join(' ')
    return [group.dishName || '手动添加', context].filter(Boolean).join(' · ') + '\n' + group.items.map((row, index) => (index + 1) + '. ' + row.name + (row.quantityLabel ? '  ' + row.quantityLabel : '')).join('\n')
  })].join('\n\n')
}
function copyPending(list) { return copyList(list, 'pending') }
module.exports = { CHANNELS, ingredientKey, amountCents, estimate, buildPricing, summarizeEstimate, copyPending, copyList, shanghaiDate, money }
