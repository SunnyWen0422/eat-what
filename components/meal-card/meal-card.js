Component({ properties: { title: String, name: String, status: String, description: String }, methods: { open() { this.triggerEvent('open') } } })
