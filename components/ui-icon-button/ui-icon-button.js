Component({properties:{name:String,label:String,disabled:Boolean},methods:{tap(){if(!this.properties.disabled)this.triggerEvent('press')}}})
