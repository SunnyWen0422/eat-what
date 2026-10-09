const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const file=path.resolve(__dirname,'../utils/dish-workspace-handoff.js')
test('detail addition preserves existing choices and binds exact workspace revision',()=>{
 assert.ok(fs.existsSync(file),'dish workspace handoff missing')
 const body=require(file).buildDishSelection(9,{workspace:{id:'ws',revision:3,draft:{dishes:[{id:1},{id:2}]}}},{date:'2026-10-08',mealType:'dinner'})
 assert.deepEqual(body.dishIds,[1,2,9]);assert.equal(body.expectedWorkspaceRevision,3);assert.equal(body.expectedWorkspaceId,'ws')
})
test('duplicate selection stays unique and maximum ten is enforced',()=>{
 assert.ok(fs.existsSync(file),'dish workspace handoff missing');const build=require(file).buildDishSelection,target={date:'2026-10-08',mealType:'dinner'}
 assert.deepEqual(build(1,{workspace:{draft:{dishes:[{id:1}]}}},target).dishIds,[1])
 assert.throws(()=>build(20,{workspace:{draft:{dishes:Array.from({length:10},(_,id)=>({id:id+1}))}}},target),/10/)
})
