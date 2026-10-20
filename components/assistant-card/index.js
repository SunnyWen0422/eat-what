const {presentCard}=require('../../utils/assistant-cards')
Component({
 properties:{card:Object,busy:Boolean,active:Boolean},data:{view:{rows:[]},failedImages:{}},
 observers:{card(){this.refresh()}},lifetimes:{attached(){this.refresh()}},
 methods:{
  refresh(){const view=presentCard(this.properties.card),menu=this.properties.card&&this.properties.card.menuActions,failedImages={};view.menuActions=menu||null;if(menu&&view.type==='menu')view.text=view.text.replace(/[，,；;]\s*可以撤销最近一次修改[。]?/g,'');view.rows=view.rows.map(row=>({...row,...(menu&&menu.rows||[]).find(action=>action.dishId===row.dishId)}));for(const row of view.rows)if(this.data.failedImages[row.key]===row.mediaIdentity)failedImages[row.key]=row.mediaIdentity;this.setData({view,failedImages})},
  emitDishAction(dishId,action,expectedRef,cardId){
   this.refresh();const card=this.properties.card,menu=this.data.view.menuActions,row=(menu&&menu.rows||[]).find(r=>r.dishId===dishId)
   if(!menu||!menu.enabled||!row||this.properties.busy||cardId!==card.id||!expectedRef||['workspaceId','workspaceRevision','planVersion','date','mealType'].some(key=>menu.expectedRef[key]!==expectedRef[key]))return
   if(action==='replace'&&!row.canReplace||action==='lighter'&&row.locked||action==='keep'&&row.locked||action==='release'&&!row.locked)return
   this.triggerEvent('dishaction',{cardId,dishId,action,expectedRef:{...expectedRef}})
  },
  onDishReplace(event){this.refresh();const menu=this.data.view.menuActions;if(menu)this.emitDishAction(Number(event.currentTarget.dataset.dishId),'replace',menu.expectedRef,this.properties.card.id)},
  onDishRelease(event){this.refresh();const menu=this.data.view.menuActions;if(menu)this.emitDishAction(Number(event.currentTarget.dataset.dishId),'release',menu.expectedRef,this.properties.card.id)},
  onCurrentMenu(){this.triggerEvent('dishaction',{cardId:this.properties.card.id,dishId:null,action:'current',expectedRef:this.data.view.menuActions&&this.data.view.menuActions.expectedRef})},
  onMenuAction(action){
   this.refresh();const menu=this.data.view.menuActions
   if(this.properties.busy||!menu||!(action==='undo'?menu.canUndo:menu.canAdopt))return
   this.triggerEvent('dishaction',{cardId:this.properties.card.id,action,expectedRef:{...menu.expectedRef}})
  },
  onAdopt(){this.onMenuAction('adopt')},
  onImageError(event){const {key,source,identity}=event.currentTarget.dataset,row=this.data.view.rows.find(r=>r.key===key);if(row&&row.image===source&&(identity==null||identity===row.mediaIdentity))this.setData({['failedImages.'+key]:row.mediaIdentity})},
  onDish(event){const row=this.data.view.rows.find(r=>r.key===event.currentTarget.dataset.key);if(row&&row.url)wx.navigateTo({url:row.url})},
  onFact(event){const fact=this.data.view.facts.find(r=>r.key===event.currentTarget.dataset.key);if(fact&&fact.url)wx.navigateTo({url:fact.url})},
  onOpen(){this.refresh();if(this.data.view.url)wx.navigateTo({url:this.data.view.url})},
  onConfirm(){this.refresh();if(this.properties.active&&!this.properties.busy&&this.data.view.canConfirm)this.triggerEvent('confirm',{id:this.properties.card.id})},
  onSelection(event){
   this.refresh();if(!this.properties.active||this.properties.busy||!this.data.view.canSelect)return
   const selected=event.detail.value,allowed=new Set(this.data.view.rows.map(r=>r.sourceKey))
   if(!Array.isArray(selected)||selected.some(key=>!allowed.has(key))||new Set(selected).size!==selected.length)return
   this.triggerEvent('selection',{id:this.properties.card.id,selectedSourceKeys:selected.slice()})
  },
  onChoice(event){this.emitChoice(event.currentTarget.dataset.optionId)},
  onChoiceDate(event){this.emitChoice(event.currentTarget.dataset.optionId,event.detail.value)},
  emitChoice(optionId,date){this.refresh();if(!this.properties.active||this.properties.busy||!this.data.view.canClarify)return;const option=this.data.view.choices.find(o=>o.id===optionId);if(!option||option.requiresDate!==(date!==undefined))return;this.triggerEvent('choice',{id:this.properties.card.id,optionId,...(date!==undefined?{date}:{})})},
  onRepreview(){this.refresh();if(this.properties.active&&!this.properties.busy&&this.data.view.type==='shopping_preview'&&this.data.view.expired)this.triggerEvent('repreview',{id:this.properties.card.id})},
  onUndo(){this.onMenuAction('undo')},
  onHandoff(){this.refresh();if(this.properties.active&&!this.properties.busy&&this.data.view.canHandoff)this.triggerEvent('handoff',{id:this.properties.card.id})},
 }
})
