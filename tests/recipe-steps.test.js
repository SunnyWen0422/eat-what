const test=require('node:test'),assert=require('node:assert/strict')
const {presentRecipeSteps,stripStepNumber,presentHowto}=require('../utils/recipe-steps')
const {presentRecipeLines}=require('../utils/recipe-quality')
const {presentCard}=require('../utils/assistant-cards')

test('source numbering is removed from display while source and image positions stay intact',()=>{
 const source=['1. 鱼3斤有点大,麻辣鱼佐料。','2. 姜,料酒腌制后,纸吸干水分。','3. 油炸7成熟。']
 const before=JSON.stringify(source)
 assert.equal(presentRecipeLines(source)[0],'1. 鱼3斤有点大,麻辣鱼佐料。') // Reproduces old double-number source.
 assert.deepEqual(presentRecipeSteps(source),['鱼3斤有点大,麻辣鱼佐料。','姜,料酒腌制后,纸吸干水分。','油炸7成熟。'])
 assert.equal(JSON.stringify(source),before)
 assert.equal(presentRecipeSteps(source).length,source.length)
})
test('explicit ordinal variants normalize without deleting cooking quantities',()=>{
 for(const prefix of ['1. ','2、','3）','（4）','5．','第六步：','步骤7：','Step 8: ','⑨ '])
  assert.equal(stripStepNumber(prefix+'加入1.5克盐，180℃烤20分钟'),'加入1.5克盐，180℃烤20分钟',prefix)
 for(const text of ['1.5克盐','180℃烤20分钟','3斤鱼切块','1/2勺盐','10:30开始腌制','七成熟时捞出','1.','（2）'])
  assert.equal(stripStepNumber(text),text)
})
test('JSON, objects, legacy separators and plain instructions share the presentation without rewriting originals',()=>{
 assert.deepEqual(presentRecipeSteps('1. 洗菜###2. 沥干'),['洗菜','沥干'])
 assert.deepEqual(presentRecipeSteps('[{"instruction":"1. 洗菜"},{"text":"2. 沥干"}]'),['洗菜','沥干'])
 assert.deepEqual(presentRecipeSteps('洗菜\n沥干'),['洗菜','沥干'])
 const howto={title:'鱼',steps:['1. 洗净','2. 加盐'],ingredients:['盐 1.5克']}
 const view=presentHowto(howto)
 assert.deepEqual(view.steps,['洗净','加盐'])
 assert.deepEqual(howto.steps,['1. 洗净','2. 加盐'])
 assert.deepEqual(view.ingredients,['盐 1.5克'])
 assert.equal(presentHowto(null),null)
})
test('assistant recipe cards remove duplicate ordinals after applying existing safety filtering',()=>{
 const card={type:'recipe',data:{name:'鱼',steps:['1. 洗净','2. 加1.5克盐','HTTP Exception traceback']}}
 const before=JSON.stringify(card)
 assert.deepEqual(presentCard(card).rows[0].steps,['洗净','加1.5克盐'])
 assert.equal(JSON.stringify(card),before)
})
