// Synthetic test data only. Production never infers canonical facts from legacy columns.
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const policy = { quantityPolicy:'fixed-recipe-v1', quantityBasis:'fixed_recipe', portionBasis:'equal_share_reference' }
const category = {meat:'CAT_MEAT',veg:'CAT_VEGETABLE',soup:'CAT_SOUP',staple:'CAT_STAPLE',dessert:'CAT_DESSERT',side:'CAT_SIDE'}
function lines(value) { if(typeof value==='string'){try{return lines(JSON.parse(value))}catch(_){return value.split(/###|#|\n/).filter(Boolean)}}return Array.isArray(value)?value:[] }
function ingredient(name, unit='g') { return {id:'test-'+name,name,unit,aliases:[],animal:null,allergens:null} }
function canonicalDish(value={}, overrides={}) {
  if(value==null)return value
  const dish={...clone(value),quantityPolicy:'fixed-recipe-v1'}
  if(dish.recipe){dish.recipe={...dish.recipe,...clone(overrides)};return dish}
  const ingredients=lines(dish.ingredientsAmounts||dish.cl||'测试食材 100g').map((item,index)=>{
    const object=typeof item==='object'&&item!==null?item:null, text=object?'':String(item), columns=text.split('|')
    const match=text.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(\S+)$/)
    const name=object?(object.name||object.ingredientName||object.ingredient||object.text||'测试食材'):columns.length>2?columns[0]:match?match[1]:text.replace(/\s+适量$/,'')
    const raw=object?(object.quantity??object.amount):columns.length>2?columns[1]:match?match[2]:null
    const quantity=raw!=null&&Number.isFinite(Number(raw))&&Number(raw)>0?Number(raw):null
    const unit=object?object.unit||'g':columns.length>2?columns[2]:match?match[3]:'g'
    const definition=ingredient(name,unit)
    return {id:'i'+(index+1),ingredientId:definition.id,ingredient:definition,quantity,quantityKind:quantity===null?'discretionary':'exact',...(quantity===null?{quantityDisplay:'适量'}:{}),unit,preparation:object?(object.note||object.preparation||''):columns[4]||'',optional:false,defaultEnabled:true,role:'main'}
  })
  const steps=lines(dish.steps||dish.step||'按配方煮熟').map((item,index)=>({...(typeof item==='object'?item:{}),id:'s'+(index+1),text:typeof item==='string'?item:item.text||item.instruction||item.description||item.step||'煮熟',ingredientLineIds:[],dependsOn:[],activeMinutes:null,waitMinutes:null}))
  dish.catalogRevision=dish.catalogRevision||'test-fixed-v1'
  dish.recipe={...policy,id:dish.id,name:dish.name||'测试菜谱',baseServings:null,servingBasis:'recipe_batch',dishGroupId:'test-'+dish.id,servingRole:'dish',categoryCode:category[dish.type]||'CAT_VEGETABLE',mealCodes:['MEAL_LUNCH','MEAL_DINNER'],dietaryCodes:null,allergenCodes:null,imageUrl:dish.image||null,timing:{activeMinutes:dish.cookMinutes??null,waitMinutes:0,totalMinutes:dish.cookMinutes??null},ingredients,steps,calculatedNutrition:{completeness:'partial',total:null,perServing:null},...clone(overrides)}
  return dish
}
function fixedCalculation(dish, overrides={}, diners=null) {
  dish=canonicalDish(dish)
  return {...policy,recipeId:dish.id,catalogRevision:dish.catalogRevision,contentVersion:dish.contentVersion,baseServings:dish.recipe.baseServings,servings:diners,diners,dietaryCodes:dish.recipe.dietaryCodes,allergenCodes:dish.recipe.allergenCodes,ingredients:dish.recipe.ingredients.map(line=>({...clone(line),lineId:line.id,name:line.ingredient.name,procurementQuantity:line.quantity,enabled:line.optional?overrides[line.id]??line.defaultEnabled!==false:true})),steps:clone(dish.recipe.steps),nutrition:clone(dish.recipe.calculatedNutrition)}
}
function canonicalApi(api) {
  return new Proxy(api,{get(target,name){
    if(name==='getIngredientStandards'&&!target[name])return async value=>[ingredient(value)]
    const call=target[name]
    if(!['getDishById','getCustomDishes','getDishes'].includes(name)||typeof call!=='function')return call
    return async(...args)=>{const value=await call(...args);return name==='getDishById'?canonicalDish(value):Array.isArray(value)?value.map(row=>canonicalDish(row)):value&&Array.isArray(value.list)?{...value,list:value.list.map(row=>canonicalDish(row))}:value}
  }})
}

module.exports={canonicalDish,fixedCalculation,canonicalApi,ingredient,policy}
