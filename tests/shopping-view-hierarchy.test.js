const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs')
test('missing trusted quantity metadata remains uncertain while explicit manual quantity is respected',()=>{
 const {buildShoppingView}=require('../utils/shopping-view')
 const rows=buildShoppingView({dishes:[{items:[{id:1,displayName:'盐',calculationStatus:'CALCULATED',quantityText:'20g',servingsVerified:true},{id:2,displayName:'油',userOverride:true,quantityText:'我确认少许'}]}]}).rows
 assert.equal(rows[0].quantityUncertain,true);assert.equal(rows[0].quantityLabel,'20g')
 assert.equal(rows[1].quantityUncertain,false);assert.equal(rows[1].quantityLabel,'我确认少许')
})
test('purchase hierarchy puts provenance before tabs and keeps add secondary when nonempty',()=>{
 const markup=fs.readFileSync('pages/shopping-list/shopping-list.wxml','utf8')
 assert.ok(markup.indexOf('bindtap="onOpenSourceMeal"')<markup.indexOf('class="ew-tabs"'))
 assert.match(markup,/variant="\{\{pagePresentation.addEmphasis\}\}"/)
 const preview=fs.readFileSync('pages/shopping-preview/shopping-preview.wxml','utf8')
 assert.match(preview,/bindtap="onOwnedRow"/)
 assert.doesNotMatch(preview,/wx:for="\{\{warnings\}\}"/)
})
test('purchase row references the same single expense while details are collapsed',()=>{
 const {decorateShoppingRows}=require('../utils/shopping-list-presentation')
 const costs=[{ingredientKey:'tomato',items:[{id:1},{id:2}],actualText:'¥0.00',referenceText:'—',quoteLabel:'暂无官方参考价'}]
 const result=decorateShoppingRows([{rowKey:'r1',itemIds:[1],warnings:['QUANTITY']},{rowKey:'r2',itemIds:[2]}],costs,[])
 assert.equal(result[0].ingredientKey,result[1].ingredientKey);assert.equal(result[0].actualText,'¥0.00');assert.equal(result[0].sourceExpanded,false);assert.deepEqual(result[0].warnings,['QUANTITY'])
 assert.equal(decorateShoppingRows(result,costs,['r1'])[0].sourceExpanded,true)
})
