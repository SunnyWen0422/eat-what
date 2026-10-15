function key(value) { return `cooking:${value.scope}:${value.date}:${value.mealType}:${value.planRevision}` }
function loadProgress(storage, value) {
  let saved;try{saved=storage.getStorageSync(key(value))}catch(_){return {}}
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
}
function saveProgress(storage, value, progress) { storage.setStorageSync(key(value), { ...progress }) }
// Equality uses the actual readable content, including unversioned legacy recipes.
// It is local reading state, never evidence of cooking or eating.
function contentFingerprint(dish) {
  return JSON.stringify([dish.id||dish.dishId,String(dish.contentVersion||''),dish.stepsList||[],dish.ingredientsList||[]])
}
function restoreReading(storage,context,dishes) {
  const saved=loadProgress(storage,context),entries={},previous=saved.version===2&&saved.entries||{}
  let changed=!!Object.keys(saved).length&&saved.version!==2
  for(const dish of dishes){
    const id=String(dish.id||dish.dishId),fingerprint=contentFingerprint(dish),old=previous[id]
    const matches=!!old&&old.fingerprint===fingerprint
    if(old&&!matches)changed=true
    entries[id]={fingerprint,stepIndex:matches?Math.min(Math.max(0,Number.isInteger(old.stepIndex)?old.stepIndex:0),Math.max(0,(dish.stepsList||[]).length-1)):0}
  }
  const dishIndex=Math.max(0,dishes.findIndex(d=>String(d.id||d.dishId)===saved.activeDishId))
  return {version:2,entries,activeDishId:dishes[dishIndex]?String(dishes[dishIndex].id||dishes[dishIndex].dishId):'',dishIndex,changed}
}
function saveReading(storage,context,state) {
  try{saveProgress(storage,context,{version:2,entries:state.entries,activeDishId:state.activeDishId});return true}catch(_){return false}
}
module.exports = { loadProgress, saveProgress, contentFingerprint, restoreReading, saveReading }
