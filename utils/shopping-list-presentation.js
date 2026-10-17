const { shoppingPagePresentation } = require('./shopping-page-presentation')

function decorateShoppingRows(rows,costs=[],expanded=[]) {
  const byId=new Map()
  for(const cost of costs)for(const item of cost.items||[])if(item.id!=null)byId.set(String(item.id),cost)
  return rows.map(row=>{
    const cost=(row.itemIds||[]).map(id=>byId.get(String(id))).find(Boolean)
    return {...row,ingredientKey:cost&&cost.ingredientKey||'',actualText:cost&&cost.actualText||'—',referenceText:cost&&cost.referenceText||'—',quoteLabel:cost&&cost.quoteLabel||'暂无官方参考价',sourceExpanded:expanded.includes(row.key || row.rowKey)}
  })
}
function describeShoppingOperation(operation, list) {
  const p=operation.payload||{}, all=(list.dishes||[]).flatMap(d=>d.items||[])
  const label=i=>(i.displayName||i.canonicalName||'未命名食材')+(i.normalizedVariant?'（'+i.normalizedVariant+'）':'')
  const names=rows=>rows.map(label).join('、')
  const target=all.find(i=>String(i.id)===String(operation.itemId))
  if(operation.type==='manual')return {text:'手动添加：'+p.name+' '+(p.quantityText||'')}
  if(operation.type==='batch-add')return {text:'从菜谱加入：'+(p.dishes||[]).map(d=>`${d.sourceDate||''} ${require('./meal-workflow').mealNames[d.sourceMealType]||''} ${d.dishName||''} ${(d.items||[]).map(label).join('、')}`).join('；')}
  if(operation.type==='clear'){
    const rows=p.scope==='all'?all:all.filter(i=>i.checked)
    return {text:`将移除最新清单中的${p.scope==='all'?'全部':'已买'}食材，共 ${rows.length} 项：${names(rows)||'无'}。包含冲突后新增的符合范围的条目。日历、菜谱和实际饮食记录保留。`}
  }
  if(operation.type==='check'){
    const rows=(p.itemIds||[]).map(id=>all.find(i=>String(i.id)===String(id)))
    if(!rows.length||rows.some(i=>!i))return {error:'部分食材已不存在，请核对最新清单；原草稿保留。'}
    return {text:`将 ${names(rows)} 标记为${p.checked?'已买':'待买'}。`}
  }
  if(operation.type==='expense'){
    const row=require('./shopping-prices').buildPricing(list).rows.find(r=>r.ingredientKey===p.ingredientKey)
    if(!row)return {error:'这项食材已不存在，请核对最新清单；原草稿保留。'}
    return {text:p.remove?`移除 ${label(row)} 的实际花费记录。`:`将 ${label(row)} 的实际花费设为 ${require('./shopping-prices').money(require('./shopping-prices').amountCents(p.amount))}，购买渠道：${p.channel||'未填写'}。参考价保持独立。`}
  }
  if(!target)return {error:'这项食材已不存在，请核对最新清单；原草稿保留。'}
  if(operation.type==='delete')return {text:`删除 ${label(target)}（${target.quantityText||'用量待核对'}）这一项食材。`}
  if(operation.type==='patch')return {text:`修改 ${label(target)}：`+['displayName','quantityText','note'].filter(k=>Object.prototype.hasOwnProperty.call(p,k)).map(k=>({displayName:'名称',quantityText:'用量',note:'备注'}[k])+'改为“'+(p[k]||'空')+'”').join('；')}
  return {error:'该草稿需重新核对，请保留原请求。'}
}
module.exports={decorateShoppingRows,shoppingPagePresentation,describeShoppingOperation}
