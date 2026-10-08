const {deriveStateAppearance}=require('../../utils/ui-state-presentation')
Component({
  properties:{kind:{type:String,value:'empty'},illustration:String,title:String,description:String,actionLabel:String,density:{type:String,value:'page'}},
  data:{inline:false,showIllustration:false,icon:''},
  observers:{'kind,illustration,density':function(kind,illustration,density){this.setData(deriveStateAppearance({kind,illustration,density}))}},
  methods:{onAction(){this.triggerEvent('action')}},
})
