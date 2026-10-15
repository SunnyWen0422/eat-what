const {validateMealTarget}=require('./meal-save-target')
function createAssistantEntryStore({storage,scopeKey,now=Date.now}) {
  let sequence=0
  function valid(value) {
    if(!value || !Number.isSafeInteger(value.dishId) || value.dishId<1 || typeof value.dishName!=='string' || !value.dishName.trim())return null
    try{return {dishId:value.dishId,dishName:value.dishName.trim().slice(0,255),...validateMealTarget(value)}}catch(error){return null}
  }
  return {
    put(value) {
      const entry=valid(value);if(!entry)return ''
      const created=now(),token=`${created}-${++sequence}-${Math.random().toString(36).slice(2)}`
      storage.setStorageSync(scopeKey(),{token,entry,created});return token
    },
    take(token) {
      if(typeof token!=='string' || !token)return null
      const key=scopeKey(),record=storage.getStorageSync(key)
      if(!record || record.token!==token)return null
      storage.removeStorageSync(key)
      const age=now()-record.created
      return Number.isFinite(age)&&age>=0&&age<=600000 ? valid(record.entry) : null
    }
  }
}
function currentEntryStore() {
  return createAssistantEntryStore({storage:wx,scopeKey:()=>require('./config').API_BASE_URL+':'+require('./util').getUserStorageKey('assistantEntry')})
}
module.exports={createAssistantEntryStore,currentEntryStore}
