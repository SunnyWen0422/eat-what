const descriptors=new Set(['快手','干锅','手撕','爽口','锡纸','脆皮','广式'])
function presentRecipeQuality(dish={}) {
 const q=dish.quality
 if(!q) {
  if(!String(dish.fl||'').includes('2名成年人总量+15%冗余'))return null
  const names=String(dish.ingredientsAmounts||dish.cl||'').split(/###|#|\n/).filter(Boolean).map(x=>x.split('|')[0].split(/[：:]/)[0].trim()).filter(x=>x&&!descriptors.has(x))
  return {ingredientLines:names.map(name=>name+' · 用量待核实'),notice:'原配方份数和用量待核实，请按实际情况核对。',nutritionText:'热量资料待核实',statusLabel:'配方资料待核实',sourceLines:[]}
 }
 const facts=(q.ingredients||[]).filter(x=>x.identityStatus!=='REJECTED')
 const ingredientLines=facts.map(x=>{
  const trusted=q.reviewStatus==='VERIFIED'&&x.identityStatus==='VERIFIED'&&x.quantityStatus==='VERIFIED'&&Number(x.quantityValue)>0
  return x.name+' · '+(trusted?'原配方 '+x.quantityValue+(x.unit||''):'用量待核实')
 })
 const people=q.servingsStatus==='VERIFIED'&&Number(q.basePeople)>0?q.basePeople:null
 return {ingredientLines,notice:people?`原配方 ${people} 人，用量仍需结合本餐情况核对。`:'原配方份数待核实，用量需要你核对。',
  statusLabel:q.reviewStatus==='VERIFIED'?'已核对配方来源':'配方资料待核实',
  nutritionText:q.nutritionStatus==='VERIFIED'&&q.nutritionKcal!=null?`原配方参考 ${q.nutritionKcal} 千卡`:'热量资料待核实',
  sourceLines:facts.map(x=>({name:x.name,text:x.rawText||'',status:x.quantityStatus==='VERIFIED'?'有用量核验记录':'原加工值仅供复核'}))}
}
function dishCategoryLabel(value) {
 const type=String(value||'').trim()
 const labels={meat:'荤菜',veg:'素菜',soup:'汤品',staple:'主食',dessert:'甜品',side:'配菜'}
 return labels[type] || (/^[\u3400-\u9fff]{1,12}$/.test(type)?type:'未分类')
}
function editRecipeQualityNotice(dish, form) {
 const { editableRecipeText } = require('./personal-recipes')
 const changed = String(form.ingredients || '').trim() !== editableRecipeText(dish.ingredientsAmounts || dish.cl).trim() ||
  String(form.steps || '').trim() !== editableRecipeText(dish.steps || dish.step).trim() || String(form.servingDescription || '') !== String(dish.fl || '')
 if (changed) return '配方已修改，来源和用量需重新核实；保存后不会沿用原配方已核验状态。'
 const view = presentRecipeQuality(dish)
 return view ? view.statusLabel + '。' + view.notice : '用户提供的配方，请按实际情况核对。'
}
module.exports={presentRecipeQuality,dishCategoryLabel,editRecipeQualityNotice}
