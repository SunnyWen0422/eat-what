Component({properties:{dish:Object,mode:{type:String,value:'browse'},selected:Boolean,disabled:Boolean},data:{imageFailed:false},observers:{'dish.image':function(){this.setData({imageFailed:false})}},methods:{
 fail(){this.setData({imageFailed:true})},
 open(){this.triggerEvent('open',{dish:this.data.dish})},
 choose(){if(this.data.mode==='select'&&!this.data.disabled)this.triggerEvent('select',{dish:this.data.dish})},
}})
