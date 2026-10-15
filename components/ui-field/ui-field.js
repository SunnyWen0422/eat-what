let nextFieldId=0
Component({
 properties:{label:String,accessibleLabel:String,errorId:String,value:String,placeholder:String,error:String,required:Boolean,disabled:Boolean,type:{type:String,value:'text'},maxlength:{type:Number,value:255}},
 data:{ariaLabel:'输入内容',resolvedErrorId:''},
 lifetimes:{attached(){this._errorId='field-error-'+(++nextFieldId);this.updateAccessibility()}},
 observers:{'label,accessibleLabel,placeholder,errorId,error,required'(){this.updateAccessibility()}},
 methods:{
  updateAccessibility(){
   const p=this.properties
   const parts=[p.accessibleLabel||p.label||p.placeholder||'输入内容',p.required?'必填':'',p.error||''].filter(Boolean)
   this.setData({ariaLabel:parts.join('，'),resolvedErrorId:p.errorId||this._errorId||'field-error'})
  },
  input(e){if(!this.properties.disabled)this.triggerEvent('change',{value:e.detail.value})},
 },
})
