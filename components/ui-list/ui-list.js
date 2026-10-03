Component({properties:{items:{type:Array,value:[]}},methods:{open(e){this.triggerEvent('open',{item:this.properties.items[e.currentTarget.dataset.index],index:e.currentTarget.dataset.index})}}})
