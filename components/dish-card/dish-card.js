const { imageSource, imageIdentity } = require('../../utils/dish-image')
function refresh(){const dish=this.properties.dish || {},identity=imageIdentity(dish);this.setData({imageFailed:this.data.imageIdentity===identity&&this.data.imageFailed||false,imageIdentity:identity,imageSource:imageSource(dish.image)})}
Component({properties:{dish:Object,mode:{type:String,value:'browse'},selected:Boolean,disabled:Boolean},data:{imageFailed:false,imageSource:'',imageIdentity:''},observers:{'dish.image':refresh,'dish.id,dish.dishId,dish.contentVersion':refresh},methods:{
 fail(event){const identity=event&&event.currentTarget&&event.currentTarget.dataset.identity;if(identity!=null&&identity!==this.data.imageIdentity)return;this.setData({imageFailed:true})},
 open(){this.triggerEvent('open',{dish:this.data.dish})},
 choose(){if(this.data.mode==='select'&&!this.data.disabled)this.triggerEvent('select',{dish:this.data.dish})},
}})
