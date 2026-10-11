const {presentCard}=require('../../utils/assistant-cards')
Component({
 properties:{card:Object,busy:Boolean,active:Boolean},data:{view:{rows:[]},failedImages:{}},
 observers:{card(){this.refresh()}},lifetimes:{attached(){this.refresh()}},
 methods:{
  refresh(){this.setData({view:presentCard(this.properties.card)})},
  onImageError(event){const {key,source}=event.currentTarget.dataset,row=this.data.view.rows.find(r=>r.key===key);if(row&&row.image===source)this.setData({['failedImages.'+key]:true})},
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
  onRepreview(){this.refresh();if(this.properties.active&&!this.properties.busy&&this.data.view.type==='shopping_preview'&&this.data.view.expired)this.triggerEvent('repreview',{id:this.properties.card.id})},
  onUndo(){if(!this.properties.busy&&this.data.view.canUndo)this.triggerEvent('undo',{id:this.properties.card.id})},
 }
})
