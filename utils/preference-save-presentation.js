function preferenceSaveIssue({ peopleDraft, ingredientDraft } = {}) {
  if (peopleDraft !== undefined && (!/^[1-9][0-9]?$/.test(String(peopleDraft)) || Number(peopleDraft) > 50)) {
    return { field: 'peopleDraft', message: '常用人数应为 1 至 50' }
  }
  if (String(ingredientDraft || '').trim()) return { field: 'ingredientDraft', message: '请先添加这项忌口' }
  return null
}

module.exports = { preferenceSaveIssue }
