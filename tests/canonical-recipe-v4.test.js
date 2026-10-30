const test = require('node:test'), assert = require('node:assert/strict')
const {policy}=require('./fixtures/canonical-dish')
const canonical = require('../utils/canonical-recipe')
const authoring = require('../utils/canonical-authoring')
const display = require('../utils/recipe-display')
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
function fixture() {
  return {id:1,type:'veg',catalogRevision:'v4',recipe:{...policy,id:1,name:'原批次菜谱',baseServings:null,servingBasis:'recipe_batch',categoryCode:'CAT_VEGETABLE',mealCodes:['MEAL_DINNER'],timing:{activeMinutes:null,waitMinutes:null,totalMinutes:null},dietaryCodes:null,allergenCodes:null,
    ingredients:[{id:'i1',ingredientId:'salt',quantity:null,quantityKind:'discretionary',quantityDisplay:'适量',unit:'g',preparation:'',optional:false,defaultEnabled:true,ingredient:{id:'salt',name:'食盐',unit:'g'}},{id:'i2',ingredientId:'oil',quantity:5,quantityKind:'exact',unit:'g',preparation:'',optional:true,defaultEnabled:false,ingredient:{id:'oil',name:'油',unit:'g'}}],
    steps:[{id:'s1',text:'取 1/2 加入，煮 3 分钟。',ingredientLineIds:['i1'],activeMinutes:null,waitMinutes:null,dependsOn:[]}],calculatedNutrition:{completeness:'partial',total:null,perServing:null,quantifiedSubtotal:{total:{energyKcal:45}}}}}
}
test('unknown servings and discretionary quantities remain readable without invented numbers',()=>{
  const dish=fixture(),before=JSON.stringify(dish)
  assert.equal(canonical.recipeOf(dish).baseServings,null)
  assert.deepEqual(display.presentRecipeIngredients(dish).lines,['食盐 适量'])
  assert.equal(display.presentRecipeIngredients(dish).basis,'整道菜用量')
  assert.equal(canonical.facts(dish).allergensKnown,false)
  assert.equal(canonical.nutritionView({servings:null,nutrition:dish.recipe.calculatedNutrition}).nutritionAvailable,false)
  assert.equal(canonical.stepLines(dish)[0],'取 1/2 加入，煮 3 分钟。')
  assert.equal(JSON.stringify(dish),before)
})
test('complete whole batch nutrition is usable, partial subtotals and missing energy are not totals',()=>{
  assert.equal(canonical.nutritionView({servings:null,nutrition:{completeness:'complete',total:{energyKcal:120,proteinG:1,fatG:1,carbohydrateG:1,fiberG:0,sodiumMg:0},perServing:null}}).nutritionText,'约 120 千卡')
  assert.equal(canonical.nutritionView({servings:2,nutrition:{completeness:'partial',total:{energyKcal:100}}}).nutritionAvailable,false)
  assert.equal(canonical.nutritionView({servings:2,nutrition:{completeness:'complete',total:{energyKcal:null}}}).nutritionAvailable,false)
  assert.equal(canonical.nutritionView({nutrition:{total:{energyKcal:120}}}).nutritionAvailable,false)
  assert.equal(canonical.nutritionView({nutrition:{completeness:'complete',total:{energyKcal:120}}}).nutritionAvailable,false)
})
test('copy editing preserves nulls and optional defaults without requiring dictionary lookups',async()=>{
  const dish=fixture(),form=authoring.form(dish)
  assert.equal(form.cookMinutes,'');assert.equal(form.servingDescription,'')
  assert.match(form.ingredients,/食盐 适量/);assert.doesNotMatch(form.ingredients,/null/)
  const result=await authoring.body(dish,form,'veg',()=>{throw Error('unchanged lines must not be resolved again')})
  assert.equal(result.recipe.baseServings,null);assert.equal(result.recipe.timing.totalMinutes,null)
  assert.equal(result.recipe.ingredients[1].defaultEnabled,false)
  assert.equal(result.recipe.quantityPolicy,'fixed-recipe-v1');assert.equal(result.recipe.scaling,undefined);assert.ok(result.recipe.ingredients.every(line=>!line.scaleRule))
})
test('copy form uses baseline step text without persisting appended allocation display notes',async()=>{
 const dish=fixture();dish.recipe.steps[0].ingredientQuantities={i1:null};dish.scaledRecipe={steps:[{text:'四人份的步骤'}]}
 const form=authoring.form(dish);assert.equal(form.steps,'取 1/2 加入，煮 3 分钟。')
 const result=await authoring.body(dish,{...form,name:'新的菜名'},'veg',()=>{throw Error('unexpected lookup')})
 assert.equal(result.recipe.steps[0].id,'s1');assert.equal(result.recipe.steps[0].text,form.steps)
})
test('changing one ingredient retains other ingredient identity, IDs, default choices and fractional text',async()=>{
  const dish=fixture(),form=authoring.form(dish)
  form.ingredients=form.ingredients.replace('油 5g','油 6g')
  const result=await authoring.body(dish,form,'veg',async name=>[{id:'oil',name,unit:'g'}])
  assert.equal(result.recipe.ingredients[0].quantity,null);assert.equal(result.recipe.ingredients[0].id,'i1')
  assert.equal(result.recipe.ingredients[1].quantity,6);assert.equal(result.recipe.ingredients[1].defaultEnabled,false)
  assert.equal(result.recipe.steps[0].text,dish.recipe.steps[0].text)
})
test('raw amount tokens cannot be shown as readable instructions',()=>{
  const dish=fixture();dish.recipe.steps[0].text='加入 {{amount:i1}}'
  assert.throws(()=>canonical.stepLines(dish),/步骤用量/)
})
function pageAt(name,api) {
  let page;const storage=new Map(),wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value)}
  const directory=path.resolve('pages',name)
  vm.runInNewContext(fs.readFileSync(path.join(directory,name+'.js'),'utf8'),{Page:value=>page=value,wx,console,setTimeout,clearTimeout,getApp:()=>({globalData:{loginReady:true}}),require:request=>request.endsWith('/api')?api:request.endsWith('/util')?{getUserStorageKey:key=>'test:'+key}:require(path.resolve(directory,request))})
  page.setData=(values,callback)=>{for(const [key,value] of Object.entries(values)){const names=key.split('.');let object=page.data;for(const name of names.slice(0,-1))object=object[name];object[names[names.length-1]]=value}if(callback)callback()}
  return page
}
test('actual detail and cooking handlers never request people scaling for an unknown batch',async()=>{
  let calls=0;const api={getDishById:async()=>fixture(),getDishScale:async()=>{calls++;throw Error('unknown_base_servings')}}
  const detail=pageAt('dish-detail',api);await detail.loadDishDetail(1)
  assert.equal(detail.data.error,false);assert.equal(detail.data.dish.ingredientsList[0],'食盐 适量');assert.equal(calls,0)
  const cooking=pageAt('meal-cooking',api);cooking.onLoad({recipeId:'1',people:'4'});await cooking.onShow()
  assert.equal(cooking.data.errorMessage,'');assert.equal(cooking.data.steps[0],'取 1/2 加入，煮 3 分钟。');assert.equal(calls,0)
})
test('actual optional handler uses a baseline request, updates computed facts and preserves last success on failure',async()=>{
  const calls=[];let failing=false
  const api={getDishById:async()=>fixture(),getDishScale:async(...args)=>{calls.push(args);if(failing)throw Error('offline');return {...policy,diners:null,recipeId:1,catalogRevision:'v4',baseServings:null,servings:null,dietaryCodes:[],allergenCodes:['ALLERGEN_SOY'],ingredients:fixture().recipe.ingredients.map(line=>({...line,lineId:line.id,enabled:true})),steps:[{text:'按原配方加入材料。'}],nutrition:{completeness:'partial',total:null,perServing:null}}}}
  const detail=pageAt('dish-detail',api);await detail.loadDishDetail(1);await detail.onToggleOptional({currentTarget:{dataset:{id:'i2'}}})
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[[1,null,{i2:true}]]);assert.equal(detail.data.dish.optionalIngredients[0].enabled,true);assert.equal(detail.data.dish.recipeFacts.allergens[0],'大豆');assert.equal(detail.data.qualityView.nutritionAvailable,false)
  failing=true;await detail.onToggleOptional({currentTarget:{dataset:{id:'i2'}}});assert.equal(detail.data.dish.optionalIngredients[0].enabled,true);assert.match(detail.data.quantityError,/未完成/)
  failing=false;await detail.onRetryQuantities();assert.deepEqual(JSON.parse(JSON.stringify(calls[2])),[1,null,{i2:false}]);assert.equal(detail.data.quantityError,'')
})

test('one, two and eight diners leave both known and unknown original servings fixed',async()=>{
 for(const baseServings of [null,2])for(const people of [1,2,8]){
  const dish=fixture();dish.recipe.baseServings=baseServings;dish.recipe.ingredients[1].defaultEnabled=true
  let calls=0;const api={getDishById:async()=>dish,getDishScale:async()=>{calls++;throw Error('unexpected scaling')}}
  const detail=pageAt('dish-detail',api);detail.data.targetPeople=people;await detail.loadDishDetail(1)
  assert.deepEqual(Array.from(detail.data.dish.ingredientsList),['食盐 适量','油 5克']);assert.match(detail.data.dish.stepsList[0],/1\/2.*3 分钟/);assert.equal(calls,0)
 }
})
test('old quantity policies fail closed while missing facts cannot become full nutrition',()=>{
 const dish=fixture();dish.recipe.quantityPolicy='servings-scale-v2';assert.throws(()=>canonical.recipeOf(dish),/版本/)
 assert.throws(()=>canonical.fixedCalculation({quantityPolicy:'servings-scale-v2',diners:null}),/规则/)
 assert.equal(canonical.nutritionView({nutrition:{completeness:'complete',total:{energyKcal:10,proteinG:0,fatG:0,carbohydrateG:0,fiberG:null,sodiumMg:0}}}).nutritionAvailable,false)
})
