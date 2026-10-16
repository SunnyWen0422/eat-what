// Read-only projection of the catalog's current browse conditions. Hard meal
// exclusions and saved preferences are deliberately outside this interface.
const GROUPS = [
  ['cuisine', 'cuisineCodes'], ['flavor', 'tagCodes'], ['scene', 'tagCodes'],
  ['diet', 'tagCodes'], ['method', 'methodCodes'],
]
function activeBrowseFilters(criteria = {}, optionGroups = {}) {
  const rows = [], seen = new Set()
  for (const [group, field] of GROUPS) {
    for (const item of optionGroups[group] || []) {
      const key = field + ':' + item.code
      if ((criteria[field] || []).includes(item.code) && !seen.has(key)) {
        rows.push({ key, group, code: item.code, label: item.label || item.code }); seen.add(key)
      }
    }
    // Retain a removable representation when metadata is unavailable or stale.
    const lastGroup = GROUPS.filter(pair => pair[1] === field).slice(-1)[0][0]
    if (group === lastGroup) for (const code of criteria[field] || []) {
      const key = field + ':' + code
      if (!seen.has(key)) { rows.push({ key, group, code, label: code }); seen.add(key) }
    }
  }
  if (criteria.maxCookMinutes) rows.push({ key: 'maxCookMinutes', group: 'duration', code: String(criteria.maxCookMinutes), label: `${criteria.maxCookMinutes}分钟内` })
  return rows
}
function removeBrowseFilter(criteria = {}, key) {
  const next = { ...criteria }
  if (key === 'maxCookMinutes') next.maxCookMinutes = null
  else if (typeof key === 'string') {
    const separator = key.indexOf(':'), field = key.slice(0, separator), code = key.slice(separator + 1)
    if (separator > 0 && ['cuisineCodes', 'tagCodes', 'methodCodes'].includes(field)) next[field] = (criteria[field] || []).filter(value => value !== code)
  }
  return next
}
module.exports = { activeBrowseFilters, removeBrowseFilter }
