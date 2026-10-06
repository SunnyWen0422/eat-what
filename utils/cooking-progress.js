function key(value) { return `cooking:${value.scope}:${value.date}:${value.mealType}:${value.planRevision}` }
function loadProgress(storage, value) {
  const saved = storage.getStorageSync(key(value))
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
}
function saveProgress(storage, value, progress) { storage.setStorageSync(key(value), { ...progress }) }
module.exports = { loadProgress, saveProgress }
