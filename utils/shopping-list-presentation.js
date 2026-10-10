function decorateShoppingRows(rows,costs=[],expanded=[]) {
  const byId=new Map()
  for(const cost of costs)for(const item of cost.items||[])if(item.id!=null)byId.set(String(item.id),cost)
  return rows.map(row=>{
    const cost=(row.itemIds||[]).map(id=>byId.get(String(id))).find(Boolean)
    return {...row,ingredientKey:cost&&cost.ingredientKey||'',actualText:cost&&cost.actualText||'—',referenceText:cost&&cost.referenceText||'—',quoteLabel:cost&&cost.quoteLabel||'暂无官方参考价',sourceExpanded:expanded.includes(row.key || row.rowKey)}
  })
}
module.exports={decorateShoppingRows}
