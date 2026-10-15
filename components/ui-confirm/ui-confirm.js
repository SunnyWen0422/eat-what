Component({
  options: { multipleSlots: true },
  properties: { visible: Boolean, title: String, description: String, busy: Boolean, reducedMotion:Boolean,returnFocusId:String,confirmLabel: { type: String, value: '确认' } },
  methods: {
    cancel(){if(!this.properties.busy)this.triggerEvent('cancel')},
    confirm(){if(!this.properties.busy)this.triggerEvent('confirm')},
    restoreFocus(event){if(event.detail&&event.detail.id)this.triggerEvent('restorefocus',{id:event.detail.id})},
  },
})
