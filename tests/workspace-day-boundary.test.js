const test=require('node:test'),assert=require('node:assert/strict'),rules=require('../utils/meal-workspace')
test('today ignores a stale saved target after a China natural day changes',()=>{
 assert.equal(typeof rules.resolveActiveTarget,'function')
 const value=rules.resolveActiveTarget('today',{}, {date:'2026-10-07',mealType:'dinner',selectedOn:'2026-10-07'},new Date('2026-10-07T16:01:00Z'))
 assert.equal(value.date,'2026-10-08')
})
test('explicit historical editing preserves its date and same-day choices stay valid',()=>{
 assert.equal(typeof rules.resolveActiveTarget,'function')
 assert.equal(rules.resolveActiveTarget('today',{date:'2026-09-30',mealType:'dinner'},null,new Date('2026-10-08T10:00:00Z')).date,'2026-09-30')
 assert.equal(rules.resolveActiveTarget('today',{}, {date:'2026-10-09',mealType:'dinner',selectedOn:'2026-10-08'},new Date('2026-10-08T10:00:00Z')).date,'2026-10-09')
})
