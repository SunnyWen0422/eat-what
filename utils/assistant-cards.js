const {imageSource,imageIdentity,placeholderIcon}=require('./dish-image')
const safeText=value=>typeof value==='string' && !/\b(?:HTTP|Exception|traceback|workspaceRevision|previewToken|tool_calls)\b/i.test(value)?value:''
const meals={breakfast:'早餐',lunch:'午餐',dinner:'晚餐'}
function conversationBlocksMenu(state={}) {
 state=state||{}
 return !!(state.busy || state.recoverable || state.confirmationPending || state.selectionPending || state.actionsEnabled===false || state.turn && (state.turn.pendingAction || ['queued','running','awaiting_confirmation'].includes(state.turn.status)))
}
function presentMenuActions({card,workspace,conversationState={},workspaceState={}}={}) {
 const data=card && card.data || {},source=card && card.workspaceRef
 const expectedRef=source?{workspaceId:source.workspaceId,workspaceRevision:source.workspaceRevision,planVersion:source.planVersion,date:source.date || data.date,mealType:source.mealType || data.mealType}:null
 const exact=card && card.type==='menu' && require('./meal-record-view').workspaceRepresentsRecord({...workspaceState,workspace}) && require('./meal-workspace').matchesWorkspaceReference(expectedRef,workspace,workspaceState.context || workspace && workspace.context) && data.date===expectedRef.date && data.mealType===expectedRef.mealType
 const enabled=!!exact && !conversationBlocksMenu(conversationState) && !workspaceState.pending && !['loading','saving','unknown','offline','conflict','account_changed'].includes(workspaceState.syncStatus) && !workspaceState.busy && workspace.status!=='generating'
 const dishes=workspace && workspace.draft && workspace.draft.dishes || [],locks=workspace && workspace.draft && workspace.draft.lockedDishIds || []
 const rows=(Array.isArray(data.dishes)?data.dishes:[]).flatMap(dish=>{
  const dishId=dish.id || dish.dishId,current=dishes.find(d=>(d.id || d.dishId)===dishId)
  if(!Number.isInteger(dishId) || dishId<=0 || !current)return []
  const locked=locks.includes(dishId) || current.locked===true
  return [{dishId,locked,canReplace:enabled&&!locked}]
 })
 const writable=enabled&&!workspaceState.dirty&&['draft','planned'].includes(workspace&&workspace.status)
 const receipt=workspace&&workspace.confirmation
 const sameMenu=!!expectedRef&&!!workspace&&expectedRef.workspaceId===workspace.id&&expectedRef.planVersion===(workspace.draft&&workspace.draft.planVersion)&&
  expectedRef.date===(workspace.context&&workspace.context.date)&&expectedRef.mealType===(workspace.context&&workspace.context.mealType)
 const adopted=!!sameMenu&&!!receipt&&receipt.planVersion===expectedRef.planVersion&&receipt.date===expectedRef.date&&receipt.mealType===expectedRef.mealType&&
  (!workspaceState.linked||workspaceState.linked.planRevision===receipt.planRevision)
 const undoEligible=require('./menu-undo').canUndoMenu(workspace)
 // The synthetic current-menu projection has a placeholder false; only that view reads live eligibility.
 // A configuration reply never inherits an earlier menu checkpoint from the shared workspace.
 const cardAllowsUndo=data.changeKind!=='configuration'&&((card&&card.id==='current-menu')||data.canUndo!==false)
 return {enabled,rows,expectedRef,current:!!exact,showCurrent:!!card&&card.type==='menu'&&!exact,
  canUndo:!!writable&&undoEligible&&cardAllowsUndo,canAdopt:!!writable&&dishes.length>0&&!adopted,adopted}
}
function clarificationOptions(card,now=Date.now()){
 const data=card.data||{},options=data.authorizedOptions,ref=card.workspaceRef
 if(card.type!=='clarification'||Number(card.expiresAt)<=now||!Number.isFinite(Number(card.expiresAt))||!ref||typeof data.continuationRef!=='string'||!data.continuationRef||data.consumedByRequestId||!Array.isArray(options)||!options.length||options.length>(data.kind==='meal_requirement'?3:4))return []
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
 const rows=dishes.map((dish,index)=>({key:String(dish.sourceKey || dish.id || dish.dishId || index),dishId:dish.dishId || dish.id,sourceKey:typeof dish.sourceKey==='string'?dish.sourceKey:'',name:safeText(dish.name || dish.ingredientName),image:imageSource(dish.image),mediaIdentity:imageIdentity(dish),placeholderIcon:placeholderIcon(dish.type),url:typeof (dish.dishId || dish.id)==='number' && (dish.dishId || dish.id)>0 && type!=='shopping_preview'?'/pages/dish-detail/dish-detail?id='+encodeURIComponent(dish.dishId || dish.id):'',quantityLabel:dish.quantity==null?safeText(dish.quantityText):String(dish.quantity)+(safeText(dish.unit)||''),priceLabel:dish.price==null?'':String(dish.price),steps:(Array.isArray(dish.steps)?dish.steps:Array.isArray(dish.methods)?dish.methods:[]).map(safeText).filter(Boolean).map(require('./recipe-steps').stripStepNumber),ingredients:(Array.isArray(dish.ingredients)?dish.ingredients:[]).map(i=>typeof i==='string'?safeText(i):safeText(i.name)+(i.quantity==null?'':' · '+i.quantity+safeText(i.unit))).filter(Boolean),selected:dish.selected===true}))
 const facts=(Array.isArray(data.meals)?data.meals:[]).map((m,index)=>({key:String(index),label:[/^\d{4}-\d{2}-\d{2}$/.test(m.date || '')?m.date:'',meals[m.mealType] || '',{recorded:'已记录',unrecorded:'尚未记录'}[m.status] || ''].filter(Boolean).join(' · '),text:(Array.isArray(m.dishes)?m.dishes:[]).map(d=>safeText(d.name)).filter(Boolean).join('、'),url:/^\d{4}-\d{2}-\d{2}$/.test(m.date || '')&&meals[m.mealType]?`/pages/calendar-detail/calendar-detail?date=${m.date}&mealType=${m.mealType}`:''}))
 let url='',actionLabel=''
 if(shoppingReceipt){url='/pages/shopping-list/shopping-list';actionLabel='查看清单'}
 else if(receipt && (type==='calendar_save' || data.action==='calendar_save' || (type==='receipt'&&date&&meal)) && date&&meal){url=`/pages/calendar-detail/calendar-detail?date=${date}&mealType=${meal}`;actionLabel='查看日历'}
 return {choices,canClarify:choices.length>0,canHandoff:type==='handoff'&&Number(card.expiresAt)>now&&!!require('./assistant-action-handoff').validate(data),id:card.id,type,title:safeText(card.title)||({menu:'本餐菜单',recipe:'菜谱做法',calendar_save:'保存到日历',shopping_preview:'准备食材',receipt:'已完成',clarification:'一起确认一下'}[type] || '这一餐'),text:safeText(card.text),targetLabel:date&&meal?`${date} ${meals[meal]}`:'',peopleLabel:Number.isInteger(data.people)&&data.people>0?`${data.people}人`:'',rows,facts,canSelect:data.executionMode!=='direct'&&write&&type==='shopping_preview'&&!receipt&&!!card.taskId&&!!card.previewToken&&rows.every(r=>r.sourceKey),canConfirm:data.executionMode!=='direct'&&write&&!receipt&&!!card.taskId&&!!card.previewToken&&Number(card.expiresAt)>now,canUndo:type==='menu'&&!!card.workspaceRef&&data.canUndo===true&&data.changeKind!=='configuration',url,actionLabel,expired:write&&!receipt&&!!card.previewToken&&Number(card.expiresAt)<=now}
}
module.exports={presentCard,presentMenuActions,conversationBlocksMenu,safeText,clarificationOptions}
