Component({properties:{label:String,selected:Boolean,disabled:Boolean},methods:{tap(){if(!this.properties.disabled)this.triggerEvent('change',{selected:!this.properties.selected})}}})
