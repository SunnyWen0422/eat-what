const test=require('node:test'),assert=require('node:assert/strict')
const native=require('../scripts/acceptance/experience-continuity-native.cjs')
test('empty shopping deliberately omits expenses; missing expected controls still fail',()=>{
 assert.equal(native.shoppingFooterEvidence({showExpenses:false},null,{top:500}).status,'not-applicable')
 assert.equal(native.shoppingFooterEvidence({showExpenses:true},null,{top:500}).status,'failed')
 assert.equal(native.shoppingFooterEvidence(undefined,null,null).status,'blocked')
 assert.equal(native.shoppingFooterEvidence({showExpenses:true},{bottom:501},{top:500}).status,'measured')
 assert.equal(native.shoppingFooterEvidence({showExpenses:true},{bottom:502},{top:500}).status,'failed')
})
test('fixture pages declare actual empty shopping and a readable recipe rather than absent data',()=>{
 assert.equal(native.fixtureData('shopping-list',1).pagePresentation.emptyAction,'从日历准备食材')
 assert.equal(native.fixtureData('dish-detail',1).dish.name,'合成验收·番茄炒蛋')
})
