const {presentCard}=require('../../utils/assistant-cards')
Component({
 properties:{card:Object,busy:Boolean,active:Boolean},data:{view:{rows:[]},failedImages:{}},
 observers:{card(){this.refresh()}},lifetimes:{attached(){this.refresh()}},
 methods:{
  refresh(){const view=presentCard(this.properties.card),failedImages={};for(const row of view.rows)if(this.data.failedImages[row.key]===row.mediaIdentity)failedImages[row.key]=row.mediaIdentity;this.setData({view,failedImages})},
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
  onUndo(){if(this.properties.active&&!this.properties.busy&&this.data.view.canUndo)this.triggerEvent('undo',{id:this.properties.card.id})},
  onHandoff(){this.refresh();if(this.properties.active&&!this.properties.busy&&this.data.view.canHandoff)this.triggerEvent('handoff',{id:this.properties.card.id})},
 }
})
