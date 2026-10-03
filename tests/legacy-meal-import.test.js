const test=require('node:test');const assert=require('node:assert/strict');const {mealsFromSession}=require('../utils/legacy-meal-import')
test('legacy multi meal drafts remain separate explicit imports with their people and source version',()=>{
 const rows=mealsFromSession({state:{plan:{version:4,period:{people:4},meals:[{date:'2026-10-04',meal_type:'lunch',dishes:[{id:1,name:'午餐'}]},{date:'2026-10-04',meal_type:'dinner',dishes:[{id:2,name:'晚餐'}]},{date:'2026-10-05',meal_type:'lunch',dishes:[{id:'bad'}]}]}}})
 assert.equal(rows.length,2);assert.equal(rows[0].people,4);assert.equal(rows[1].version,4);assert.deepEqual(rows[1].dishIds,[2])
})
