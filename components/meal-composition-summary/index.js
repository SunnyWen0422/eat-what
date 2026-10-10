Component({
  properties: { people: { type: Number, value: 2 }, summary: { type: String, value: '自动搭配' }, busy: Boolean },
  methods: {
    onPeople() { if (!this.properties.busy) this.triggerEvent('people') },
    onComposition() { if (!this.properties.busy) this.triggerEvent('composition') },
  },
})
