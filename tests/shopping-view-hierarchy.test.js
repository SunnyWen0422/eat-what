const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs')
test('aggregate overflow remains uncertain without losing source quantities or manual confirmation',()=>{
 const {buildShoppingView}=require('../utils/shopping-view')
 const safe=(id,quantityValue,sourceQuantityText)=>({id,displayName:'猪肉',normalizedVariant:'里脊切丝',quantityValue,quantityText:sourceQuantityText,sourceQuantityText,calculationStatus:'CALCULATED',servingsVerified:true,parseStatus:'PARSED',unitFamily:'mass',unitCode:'g',warnings:[]})
 const list={dishes:[
  {selectionKey:'first',sourceDate:'2026-10-16',sourceMealType:'dinner',items:[safe(1,Number.MAX_VALUE,'第一餐原量MAX克')]},
  {selectionKey:'second',sourceDate:'2026-10-17',sourceMealType:'lunch',items:[safe(2,Number.MAX_VALUE,'第二餐原量MAX克'),safe(3,1,'第三行原量1克'),{...safe(4,Number.MAX_VALUE,'我确认半袋'),userOverride:true}]},
 ]}
 const before=structuredClone(list),view=buildShoppingView(list),row=view.rows.find(row=>row.sourceCount===3)
 assert.equal(row.quantityValue,null);assert.equal(row.quantityLabel, '');assert.equal(row.quantityUncertain,true)
 assert.deepEqual(row.itemIds,[1,2,3]);assert.equal(new Set(row.sources.map(source=>source.sourceKey)).size,3)
 assert.deepEqual(row.sources.map(source=>source.sourceQuantityText),['第一餐原量MAX克','第二餐原量MAX克','第三行原量1克'])
 assert.deepEqual(row.sources.map(source=>source.sourceDate),['2026-10-16','2026-10-17','2026-10-17'])
 const originals=view.groups.flatMap(group=>group.items)
 assert.deepEqual(originals.map(item=>item.quantityValue),[Number.MAX_VALUE,Number.MAX_VALUE,1,Number.MAX_VALUE])
 assert.ok(originals.every(item=>item.normalizedVariant==='里脊切丝'))
 const manual=view.rows.find(row=>row.itemIds.includes(4))
 assert.equal(manual.sourceCount,1);assert.equal(manual.quantityUncertain,false);assert.equal(manual.quantityLabel,'我确认半袋')
 assert.deepEqual(list,before)
})
test('missing trusted quantity metadata remains uncertain while explicit manual quantity is respected',()=>{
 const {buildShoppingView}=require('../utils/shopping-view')
 const rows=buildShoppingView({dishes:[{items:[{id:1,displayName:'盐',calculationStatus:'CALCULATED',quantityText:'20g',servingsVerified:true},{id:2,displayName:'油',userOverride:true,quantityText:'我确认少许'}]}]}).rows
 assert.equal(rows[0].quantityUncertain,true);assert.equal(rows[0].quantityLabel,'20g')
 assert.equal(rows[1].quantityUncertain,false);assert.equal(rows[1].quantityLabel,'我确认少许')
})
test('purchase hierarchy puts provenance before tabs and keeps add secondary when nonempty',()=>{
 const markup=fs.readFileSync('pages/shopping-list/shopping-list.wxml','utf8')
 assert.ok(markup.indexOf('bindtap="onOpenSourceMeal"')<markup.indexOf('class="ew-tabs shopping-status-tabs"'))
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

test('shopping sources hide internal statistics without changing identity, original text or quantity safety',()=>{
 const {buildShoppingView}=require('../utils/shopping-view')
 const raw={id:7,displayName:'豆腐',sourceQuantityText:'豆腐|460|克|主料|切块||2名成年人总量+15%冗余',quantityText:'用量待确认',calculationStatus:'NEEDS_ADJUSTMENT',warnings:['2名成年人总量+15%冗余','原使用量仅供参考','请按人数调整用量'],checked:false}
 const before=JSON.stringify(raw),row=buildShoppingView({dishes:[{dishId:8,dishName:'豆腐汤',items:[raw]}]}).rows[0]
 assert.equal(row.sourceDisplayText,'豆腐 460克（切块）');assert.deepEqual(row.displayWarnings,[])
 assert.equal(row.quantityUncertain,true);assert.equal(row.sourceQuantityText,raw.sourceQuantityText);assert.equal(JSON.stringify(raw),before);assert.ok(raw.warnings.every(warning=>row.warnings.includes(warning)))
})
