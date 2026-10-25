const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {collectRecoveryPointers}=require('../utils/meal-journey-presentation')
test('retired actual request cannot block the unified record or silently retry a write',()=>{
 const rows=new Map([['A:mealActual:pending:2026-10-25:dinner',{scope:'A:mealActual',date:'2026-10-25',mealType:'dinner',body:{requestId:'old'}}]])
 const before=JSON.stringify([...rows]);assert.deepEqual(collectRecoveryPointers({storage:{getStorageInfoSync:()=>({keys:[...rows.keys()]}),getStorageSync:k=>rows.get(k)},storageKey:k=>'A:'+k}),[]);assert.equal(JSON.stringify([...rows]),before)
 for(const file of ['pages/calendar-detail/calendar-detail.wxml','pages/meal-cooking/meal-cooking.wxml'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/meal-actual-sheet|这餐吃了|这餐没吃/)
})
