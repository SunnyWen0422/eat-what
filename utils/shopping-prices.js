const totalQuantity = items => items.map(i => i.quantityText || '用量待核对').join(' + ')
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
  const age = (Date.parse(today) - Date.parse(quote.quoteDate)) / 86400000
  return age >= 0 && age <= 7
}
function estimate(item, quote, today) {
  if (!usableQuote(quote, today) || item.userOverride || item.parseStatus !== 'PARSED' || item.calculationStatus !== 'CALCULATED') return null
  const factor = { g: 1, kg: 1000, ml: 1, l: 1000 }
  if (!factor[item.unitCode] || !factor[quote.unitCode] || item.unitFamily !== quote.unitFamily) return null
  const quantity = scaled(item.quantityValue, 4), price = scaled(quote.price, 4), base = scaled(quote.unitQuantity, 4)
  if (quantity == null || price == null || !base || price <= 0) return null
  const numerator = quantity * factor[item.unitCode] * price
  const denominator = base * factor[quote.unitCode] * 100
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) return null
  return Math.floor(numerator / denominator + 0.5)
}
const money = cents => cents == null ? '—' : '¥' + (cents / 100).toFixed(2)
function buildPricing(list, quotes = {}, today = shanghaiDate()) {
  const groups = new Map(), dishCosts = {}
  let pendingCents = 0, pendingMissing = 0, pendingPriced = 0
  for (const dish of list.dishes || []) {
    let cents = 0, missing = 0, priced = 0
    for (const raw of dish.items || []) {
      const item = { ...raw, sourceDishId: dish.dishId || raw.sourceDishId }
      const key = ingredientKey(item), quote = quotes[key], cost = estimate(item, quote, today)
      if (!groups.has(key)) groups.set(key, { ingredientKey: key, displayName: item.displayName, canonicalName: item.canonicalName || item.displayName, normalizedVariant: item.normalizedVariant || '', items: [], cents: 0, missing: 0, priced: 0, quote: usableQuote(quote, today) ? quote : null })
      const group = groups.get(key); group.items.push(item)
      if (cost == null) { missing++; group.missing++ } else { cents += cost; priced++; group.cents += cost; group.priced++ }
      if (!item.checked) { if (cost == null) pendingMissing++; else { pendingCents += cost; pendingPriced++ } }
    }
    dishCosts[dish.selectionKey] = { cents, missing, priced }
  }
  let actualCents = 0, recorded = 0
  const rows = [...groups.values()].map(group => {
    const expense = (list.expenses || {})[group.ingredientKey]
    if (expense && expense.amount != null) { actualCents += amountCents(expense.amount); recorded++ }
    const q = group.quote
    return { ...group, quantityText: totalQuantity(group.items), referenceText: group.missing ? '—' : money(group.priced ? group.cents : null),
      unitPriceText: q ? '¥' + q.price + '/' + q.unitQuantity + ({ g: '克', kg: '千克', ml: '毫升', l: '升' }[q.unitCode] || q.unitCode) : '—',
      quoteLabel: q ? (q.quoteDate === today ? '报价日期 ' : '最近报价 ') + q.quoteDate : '暂无官方参考价',
      actualText: expense ? money(amountCents(expense.amount)) : '—', channel: expense && expense.channel || '', expense: expense || null }
  })
  return { rows, dishCosts, pendingText: money(pendingPriced ? pendingCents : null), pendingMissing, pendingPriced, actualText: money(recorded ? actualCents : null), recorded, total: rows.length }
}
function copyPending(list) {
  return buildPricing({ ...list, dishes: (list.dishes || []).map(d => ({ ...d, items: d.items.filter(i => !i.checked) })) }).rows.map(row => row.displayName + (row.normalizedVariant ? '（' + row.normalizedVariant + '）' : '') + ' ' + row.quantityText).join('\n')
}
module.exports = { CHANNELS, ingredientKey, amountCents, estimate, buildPricing, copyPending, shanghaiDate, money }
