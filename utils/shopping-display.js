// Display only. Never use these strings to calculate, merge, price or persist an ingredient.
const { cleanRecipeText } = require('./recipe-display')
const placeholder = /^(?:(?:用量)?待(?:核对|确认|核实)|需调整|需核对|未知|不详|未填写|UNKNOWN|UNVERIFIED|[-—])$/i
// Keep a standalone purchasing form (去骨、去皮、切片). Remove instructions,
// especially combined preparation, rather than erasing variant identity.
const preparation = /^(?:直接使用|备用|洗净|清洗|去鳞|去内脏|去[皮壳籽核筋蒂根].*(?:切|洗|清|并|后)|切块|剁碎|捣碎|焯水|沥干|泡发|煮熟|蒸熟)/
const clean = value => cleanRecipeText(value == null ? '' : String(value)).trim()
const removePreparation = value => value.replace(/[（(]([^（）()]*)[）)]/g, (whole, note) => preparation.test(note.trim()) ? '' : whole).trim()

function ingredientName(item = {}) {
  const name = removePreparation(clean(item.displayName || item.name || item.canonicalName)) || '未命名食材'
  const variant = clean(typeof item.variantLabel === 'string' ? item.variantLabel : item.normalizedVariant)
  // Keep purchasing distinctions such as 里脊切丝 / 五花切片; omit cooking directions.
  return variant && !preparation.test(variant) && !name.includes(variant) ? `${name}（${variant}）` : name
}

function quantityText(value, item = {}) {
  let text = clean(value)
  if (!text || placeholder.test(text)) return ''
  if (text.includes('|')) {
    const parts = text.split('|').map(part => part.trim())
    // The source schema is name | amount | unit | role | preparation | provenance.
    // Read only explicit amount/unit; do not infer quantities from servings/provenance.
    const amount=parts[1] || '',unit=parts[2] || ''
    text = parts.length >= 3 && amount && !placeholder.test(amount) ? amount + (unit && !amount.endsWith(unit) && !/^(适量|少许|少量|若干)$/.test(amount) ? unit : '') : ''
  } else {
    const names = [item.displayName, item.canonicalName, item.name].filter(Boolean).map(clean)
    names.push(...names.map(removePreparation))
    for (const name of [...new Set(names)].sort((a, b) => b.length - a.length)) {
      if (name && text.startsWith(name)) { text = text.slice(name.length).replace(/^[\s:：]+/, ''); break }
    }
    text = removePreparation(text)
  }
  return !text || placeholder.test(text) ? '' : text
}

module.exports = { ingredientName, quantityText }
