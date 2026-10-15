const {deriveStateAppearance}=require('../../utils/ui-state-presentation')
const experiencePreferences=require('../../utils/experience-preferences')
Component({
  properties:{kind:{type:String,value:'empty'},illustration:String,title:String,description:String,actionLabel:String,density:{type:String,value:'page'},reducedMotion:Boolean},
  data:{inline:false,showIllustration:false,icon:'',motionReduced:true},
  lifetimes:{attached(){this.updateMotion()}},pageLifetimes:{show(){this.updateMotion()}},
  observers:{'kind,illustration,density':function(kind,illustration,density){this.setData(deriveStateAppearance({kind,illustration,density}));this.updateMotion()},reducedMotion(){this.updateMotion()}},
  methods:{updateMotion(){this.setData({motionReduced:!!(this.properties.reducedMotion||experiencePreferences().get().reducedMotion)})},onAction(){this.triggerEvent('action')}},
})
