const test=require('node:test'),assert=require('node:assert/strict')
const {ingredientName,quantityText}=require('../utils/shopping-display')
const {buildShoppingView}=require('../utils/shopping-view')
const pricing=require('../utils/shopping-prices')
const raw=(id,name,amount)=>({id,displayName:name,canonicalName:name,quantityText:amount,sourceQuantityText:amount,calculationStatus:'NEEDS_ADJUSTMENT',checked:false})

test('canonical ingredient identity is never used as a label, pricing key remains unchanged',()=>{
 const item={...raw(1,'盐','5g'),normalizedVariant:'salt',variantLabel:'',sourceDishId:9}
 const list={dishes:[{dishId:9,dishName:'蒸菜',items:[item]}]},before=structuredClone(list)
 assert.equal(ingredientName(item),'盐')
 assert.equal(buildShoppingView(list).rows[0].name,'盐')
 assert.equal(pricing.buildPricing(list).rows[0].displayName,'盐')
 assert.match(pricing.copyList(list),/1\. 盐  5g/)
 assert.doesNotMatch(pricing.copyList(list),/salt/)
 assert.equal(pricing.ingredientKey(item),pricing.ingredientKey({...item,variantLabel:undefined}))
 assert.deepEqual(list,before)
})

test('explicit purchasing specification remains visible independently of identity',()=>{
 assert.equal(ingredientName({displayName:'鸡腿',normalizedVariant:'chicken-leg-boneless',variantLabel:'去骨'}),'鸡腿（去骨）')
})

test('source-shaped ingredients render only explicit amounts, with no internal provenance or cooking repetition',()=>{
 const rows=[raw(1,'五香粉（直接使用）','五香粉|6|克|调味料|直接使用|2名成年人总量+15%冗余|步骤'),raw(2,'鱼（去鳞去内脏并清洗）','鱼 690克（去鳞去内脏并清洗）'),raw(3,'洋葱（去皮切丝）','洋葱|290|克|主料|去皮切丝|2名成年人总量+15%冗余|菜名+步骤')]
 const list={dishes:[{dishId:7,items:rows}]},before=structuredClone(list)
 const view=buildShoppingView(list)
 assert.deepEqual(view.rows.map(r=>[r.name,r.quantityLabel]),[['五香粉','6克'],['鱼','690克'],['洋葱','290克']])
 assert.ok(view.rows.every(r=>r.quantityUncertain&&r.quantityValue===null&&r.calculationStatus==='NEEDS_ADJUSTMENT'))
 assert.deepEqual(list,before)
 assert.equal(pricing.buildPricing(list).pendingText,'—')
})
test('missing, qualitative and explicit manual amounts are never zero-filled or made numeric',()=>{
 for(const value of ['',null,'用量待核对','用量待确认','需调整','盐|待核对|克|调味料'])assert.equal(quantityText(value,{displayName:'盐'}),'')
 assert.equal(quantityText('盐 适量',{displayName:'盐'}),'适量')
 assert.equal(quantityText('1袋（约500克）'),'1袋（约500克）')
 assert.equal(quantityText('我确认半袋'),'我确认半袋')
 assert.equal(ingredientName({displayName:'猪肉',normalizedVariant:'里脊切丝'}),'猪肉（里脊切丝）')
 assert.equal(ingredientName({displayName:'猪肉（五花切片）',normalizedVariant:'五花切片'}),'猪肉（五花切片）')
})
test('clipboard separates dish and meal sections, numbers ingredients, leaves unavailable quantity empty',()=>{
 const list={dishes:[{dishId:9,dishName:'番茄浓汤',sourceDate:'2026-10-19',sourceMealType:'dinner',items:[raw(1,'洋葱（去皮切丝）','洋葱|290|克|主料|去皮切丝|2名成年人总量+15%冗余|步骤'),raw(2,'胡椒',''),{...raw(3,'盐','少许'),checked:true}]}]}
 assert.equal(pricing.copyPending(list),'购物清单（待买）\n\n番茄浓汤 · 10月19日 晚餐\n1. 洋葱  290克\n2. 胡椒')
 assert.match(pricing.copyList(list,'checked'),/1\. 盐  少许/)
 assert.equal(pricing.copyPending({dishes:[]}),'')
})

test('purchase form distinctions survive and source amount units are not duplicated',()=>{
 assert.equal(ingredientName({displayName:'鸡腿',normalizedVariant:'去骨'}),'鸡腿（去骨）')
 assert.equal(ingredientName({displayName:'猪肉（切片）'}),'猪肉（切片）')
 assert.equal(quantityText('盐|6克|克|调味料'),'6克')
 assert.equal(quantityText('盐|适量|克|调味料'),'适量')
 const row=buildShoppingView({dishes:[{items:[{...raw(1,'盐','少许'),warnings:['请核对过敏原','用量待核对']}]}]}).rows[0]
 assert.deepEqual(row.displayWarnings,['请核对过敏原'])
})
