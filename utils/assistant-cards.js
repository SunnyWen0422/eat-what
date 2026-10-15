const {imageSource,imageIdentity,placeholderIcon}=require('./dish-image')
const safeText=value=>typeof value==='string' && !/\b(?:HTTP|Exception|traceback|workspaceRevision|previewToken|tool_calls)\b/i.test(value)?value:''
const meals={breakfast:'早餐',lunch:'午餐',dinner:'晚餐'}
function clarificationOptions(card,now=Date.now()){
 const data=card.data||{},options=data.authorizedOptions,ref=card.workspaceRef
 if(card.type!=='clarification'||Number(card.expiresAt)<=now||!Number.isFinite(Number(card.expiresAt))||!ref||typeof data.continuationRef!=='string'||!data.continuationRef||data.consumedByRequestId||!Array.isArray(options)||!options.length||options.length>4)return []
 const seen=new Set(),result=[]
 for(const option of options){
  if(!option||typeof option.id!=='string'||!option.id||option.id.length>100||seen.has(option.id)||!safeText(option.label)||option.label.length>120)return []
  seen.add(option.id);result.push({id:option.id,label:option.label,requiresDate:data.questionCode==='target_date'&&option.id==='date'})
 }
 return result
}
function presentCard(card={}, now=Date.now()) {
 const choices=clarificationOptions(card,now)
 const data=card.data || {},type=card.type,write=['calendar_save','shopping_preview'].includes(type)&&data.kind!=='readonly_fact',receipt=!!card.receiptRef
 const shoppingReceipt=receipt&&(type==='shopping_preview'||data.action==='shopping_preview')
 const date=/^\d{4}-\d{2}-\d{2}$/.test(data.date || '')?data.date:'',meal=meals[data.mealType]?data.mealType:''
 const sourceRows=Array.isArray(data.dishes)?data.dishes:type==='recipe'?[data]:Array.isArray(data.items)?data.items:[]
 const dishes=shoppingReceipt?sourceRows.filter(item=>item.selected===true):sourceRows
 const rows=dishes.map((dish,index)=>({key:String(dish.sourceKey || dish.id || dish.dishId || index),sourceKey:typeof dish.sourceKey==='string'?dish.sourceKey:'',name:safeText(dish.name || dish.ingredientName),image:imageSource(dish.image),mediaIdentity:imageIdentity(dish),placeholderIcon:placeholderIcon(dish.type),url:typeof (dish.dishId || dish.id)==='number' && (dish.dishId || dish.id)>0 && type!=='shopping_preview'?'/pages/dish-detail/dish-detail?id='+encodeURIComponent(dish.dishId || dish.id):'',quantityLabel:dish.quantity==null?safeText(dish.quantityText):String(dish.quantity)+(safeText(dish.unit)||''),priceLabel:dish.price==null?'':String(dish.price),steps:(Array.isArray(dish.steps)?dish.steps:Array.isArray(dish.methods)?dish.methods:[]).map(safeText).filter(Boolean),ingredients:(Array.isArray(dish.ingredients)?dish.ingredients:[]).map(i=>typeof i==='string'?safeText(i):safeText(i.name)+(i.quantity==null?'':' · '+i.quantity+safeText(i.unit))).filter(Boolean),selected:dish.selected===true}))
 const facts=(Array.isArray(data.meals)?data.meals:[]).map((m,index)=>({key:String(index),label:[/^\d{4}-\d{2}-\d{2}$/.test(m.date || '')?m.date:'',meals[m.mealType] || '',{planned:'已安排',eaten:'已吃',skipped:'这餐没吃',unrecorded:'尚未记录'}[m.status] || ''].filter(Boolean).join(' · '),text:(Array.isArray(m.dishes)?m.dishes:[]).map(d=>safeText(d.name)).filter(Boolean).join('、'),url:/^\d{4}-\d{2}-\d{2}$/.test(m.date || '')&&meals[m.mealType]?`/pages/calendar-detail/calendar-detail?date=${m.date}&mealType=${m.mealType}`:''}))
 let url='',actionLabel=''
 if(shoppingReceipt){url='/pages/shopping-list/shopping-list';actionLabel='查看清单'}
 else if(receipt && (type==='calendar_save' || data.action==='calendar_save' || (type==='receipt'&&date&&meal)) && date&&meal){url=`/pages/calendar-detail/calendar-detail?date=${date}&mealType=${meal}`;actionLabel='查看日历'}
 return {choices,canClarify:choices.length>0,canHandoff:type==='handoff'&&Number(card.expiresAt)>now&&!!require('./assistant-action-handoff').validate(data),id:card.id,type,title:safeText(card.title)||({menu:'本餐菜单',recipe:'菜谱做法',calendar_save:'保存到日历',shopping_preview:'准备食材',receipt:'已完成',clarification:'一起确认一下'}[type] || '这一餐'),text:safeText(card.text),targetLabel:date&&meal?`${date} ${meals[meal]}`:'',peopleLabel:Number.isInteger(data.people)&&data.people>0?`${data.people}人`:'',rows,facts,canSelect:write&&type==='shopping_preview'&&!receipt&&!!card.taskId&&!!card.previewToken&&rows.every(r=>r.sourceKey),canConfirm:write&&!receipt&&!!card.taskId&&!!card.previewToken&&Number(card.expiresAt)>now,canUndo:type==='menu'&&!!card.workspaceRef&&data.canUndo===true,url,actionLabel,expired:write&&!receipt&&!!card.previewToken&&Number(card.expiresAt)<=now}
}
module.exports={presentCard,safeText,clarificationOptions}
