const tokens=require('../../utils/ui-tokens')
const experiencePreferences=require('../../utils/experience-preferences')
Component({
 properties:{label:String,variant:{type:String,value:'primary'},disabled:Boolean,loading:Boolean,reducedMotion:Boolean},
 data:{pressDuration:0},
 lifetimes:{attached(){this.updateMotion()}},
 pageLifetimes:{show(){this.updateMotion()}},
 observers:{reducedMotion(){this.updateMotion()}},
 methods:{
  updateMotion(){this.setData({pressDuration:this.properties.reducedMotion||experiencePreferences().get().reducedMotion?0:tokens.motion.press})},
  onTap(){if(!this.data.disabled&&!this.data.loading)this.triggerEvent('action')},
 },
})
