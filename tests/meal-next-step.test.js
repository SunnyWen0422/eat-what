const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const next=fs.existsSync('utils/meal-next-step.js')?require('../utils/meal-next-step'):{}
test('shopping next step resolves actual source meals and never substitutes today',()=>{
 assert.equal(typeof next.distinctMealSources,'function')
 assert.deepEqual(next.distinctMealSources([{sourceDate:'2026-10-15',sourceMealType:'dinner'},{date:'2026-10-15',mealType:'dinner'},{sourceDate:'2026-10-14',sourceMealType:'lunch'}]),[{date:'2026-10-14',mealType:'lunch'},{date:'2026-10-15',mealType:'dinner'}])
 assert.deepEqual(next.distinctMealSources([{dishName:'手动添加'},{date:'2026-02-30',mealType:'lunch'}]),[])
 assert.equal(next.mealSourceUrl({date:'2026-10-15',mealType:'dinner'}),'/pages/calendar-detail/calendar-detail?date=2026-10-15&mealType=dinner')
 assert.throws(()=>next.mealSourceUrl({date:'2026-02-30',mealType:'dinner'}))
})
