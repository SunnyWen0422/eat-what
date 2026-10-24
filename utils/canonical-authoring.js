// Explicit user quantities are resolved against the shared dictionary, never guessed.
const clone = value => JSON.parse(JSON.stringify(value))
const category = { meat:'CAT_MEAT',veg:'CAT_VEGETABLE',soup:'CAT_SOUP',staple:'CAT_STAPLE',dessert:'CAT_DESSERT',side:'CAT_SIDE' }
const ingredientText = line => `${line.ingredient.name} ${line.quantityKind==='discretionary' ? '适量' : line.quantity == null ? '' : line.quantity+line.unit}${line.preparation?'（'+line.preparation+'）':''}`
const nullableNumber = value => value == null || String(value).trim()==='' ? null : Number(value)
function stepText(step) { if(/\{\{\s*amount\b/.test(step.text))throw Error('步骤用量暂未读到，请重新读取');return step.text }
function form(dish, draft=false) {
  const recipe=draft?dish.recipe:require('./canonical-recipe').recipeOf(dish)
  return {name:recipe.name,ingredients:recipe.ingredients.map(line=>ingredientText(line.ingredient?line:{...line,ingredient:{name:line.ingredientId||'待核对食材'}})).join('\n'),steps:recipe.steps.map(stepText).join('\n'),cookMinutes:recipe.timing.totalMinutes == null ? '' : String(recipe.timing.totalMinutes),servingDescription:recipe.baseServings == null ? '' : String(recipe.baseServings),image:recipe.imageUrl||'',mealCodes:[...recipe.mealCodes]}
}
async function body(dish, input, type, lookup) {
  const original=dish && dish.recipe, previous=original?form(dish):null
  const recipe=original?clone(original):{mealCodes:input.mealCodes||['MEAL_LUNCH','MEAL_DINNER'],flavor:{baseCodes:[],specialCodes:[],spiceLevel:0},methodCodes:[],requiredEquipmentCodes:[],sceneCodes:[],operationCodes:[],servingRole:'dish'}
  const servings=nullableNumber(input.servingDescription),minutes=nullableNumber(input.cookMinutes)
  if(servings!==null&&(!Number.isInteger(servings)||servings<1||servings>50))throw Error('基准人数应为 1 至 50，未知可留空')
  if(minutes!==null&&(!Number.isFinite(minutes)||minutes<0||minutes>480))throw Error('烹饪时间应为 0 至 480 分钟，未知可留空')
  recipe.name=input.name.trim();recipe.baseServings=servings;recipe.imageUrl=input.image||null
  if(!category[type])throw Error('请选择菜品分类')
  if(!original || type!==dish.type)recipe.categoryCode=category[type]
  if(!original || input.ingredients!==previous.ingredients){
    recipe.ingredients=[]
    const reused=new Set()
    for(const [index,text] of input.ingredients.split('\n').filter(row=>row.trim()).entries()){
      const unchanged=original && original.ingredients.find(line=>!reused.has(line.id)&&ingredientText(line)===text.trim())
      if(unchanged){recipe.ingredients.push(clone(unchanged));reused.add(unchanged.id);continue}
      const match=text.trim().match(/^(.+?)\s+(?:(\d+(?:\.\d+)?)\s*(g|ml|unit|piece|个|只|片|根|颗|克|毫升)|(适量))(?:[（(](.*)[）)])?$/)
      if(!match)throw Error('食材请按“名称 数量单位”或“名称 适量”填写，例如“食盐 2g”')
      const matches=(await lookup(match[1])).filter(item=>item.name===match[1]||(item.aliases||[]).includes(match[1]))
      if(matches.length!==1)throw Error('食材“'+match[1]+'”未找到唯一规格，请填写标准名称')
      const ingredient=matches[0],unit=match[4]?ingredient.unit:{克:'g',毫升:'ml',个:'piece'}[match[3]]||match[3]
      if(unit!=='g'&&unit!==ingredient.unit)throw Error(ingredient.name+'请使用 '+ingredient.unit+' 或 g')
      if(!match[4]&&!(Number(match[2])>0))throw Error('明确用量必须大于零，未知请填写适量')
      const old=original && original.ingredients.find(line=>!reused.has(line.id)&&line.ingredientId===ingredient.id)
      if(old)reused.add(old.id)
      let id=old?old.id:'i'+(index+1)
      if(!old)while((original&&original.ingredients.some(line=>line.id===id))||recipe.ingredients.some(line=>line.id===id))id+='n'
      recipe.ingredients.push({...old,id,ingredientId:ingredient.id,quantity:match[4]?null:Number(match[2]),quantityKind:match[4]?'discretionary':'exact',quantityDisplay:match[4]?'适量':undefined,unit,preparation:match[5]||'',optional:old?old.optional:false,defaultEnabled:old?old.defaultEnabled:true,role:old?old.role:'main'})
    }
    if(new Set(recipe.ingredients.map(line=>line.id)).size!==recipe.ingredients.length)throw Error('食材条目重复，请合并后保存')
  }
  if(!original || input.steps!==previous.steps){
    recipe.steps=input.steps.split('\n').filter(text=>text.trim()).map((text,index)=>({id:'s'+(index+1),text:text.trim(),ingredientLineIds:[],activeMinutes:minutes===null?null:index===0?minutes:0,waitMinutes:minutes===null?null:0,dependsOn:index?['s'+index]:[]}))
    recipe.timing={activeMinutes:minutes,waitMinutes:minutes===null?null:0,totalMinutes:minutes}
  } else if(minutes!==nullableNumber(previous.cookMinutes)) throw Error('保留原步骤时请保留原用时；修改步骤后可填写新的总操作时间')
  recipe.ingredients.forEach(line=>{delete line.ingredient;delete line.scaleRule})
  delete recipe.scaling
  recipe.quantityPolicy='fixed-recipe-v1'
  recipe.servingBasis=servings===null?'recipe_batch':'declared_servings'
  delete recipe.calculatedNutrition
  return {recipe,...(dish&&dish.contentVersion?{expectedVersion:dish.contentVersion}:{})}
}
module.exports={form,body,draftForm:dish=>form(dish,true)}
