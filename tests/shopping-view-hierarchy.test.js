const test=require('node:test'),assert=require('node:assert/strict')
test('purchase row references the same single expense while details are collapsed',()=>{
 const {decorateShoppingRows}=require('../utils/shopping-list-presentation')
 const costs=[{ingredientKey:'tomato',items:[{id:1},{id:2}],actualText:'¥0.00',referenceText:'—',quoteLabel:'暂无官方参考价'}]
 const result=decorateShoppingRows([{rowKey:'r1',itemIds:[1],warnings:['QUANTITY']},{rowKey:'r2',itemIds:[2]}],costs,[])
 assert.equal(result[0].ingredientKey,result[1].ingredientKey);assert.equal(result[0].actualText,'¥0.00');assert.equal(result[0].sourceExpanded,false);assert.deepEqual(result[0].warnings,['QUANTITY'])
 assert.equal(decorateShoppingRows(result,costs,['r1'])[0].sourceExpanded,true)
})
