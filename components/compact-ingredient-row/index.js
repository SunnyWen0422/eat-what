Component({
  properties: { row: Object, checked: Boolean, busy: Boolean, deleting: Boolean },
  data: { rowView: {} },
  lifetimes: { attached() { this.updateRow() } },
  observers: { row() { this.updateRow() } },
  methods: {
    updateRow() {
      const row = this.properties.row || {}
      this.setData({ rowView: { name: row.name || '未命名食材', quantityLabel: row.quantityLabel || '', sourceCount: row.sourceCount || 0 } })
    },
    onCheck() { if (!this.properties.busy && !this.properties.deleting) this.triggerEvent('check', { itemIds: [...((this.properties.row || {}).itemIds || [])] }) },
    onEdit() { if (!this.properties.busy && !this.properties.deleting) this.triggerEvent('edit', { itemIds: [...((this.properties.row || {}).itemIds || [])] }) },
    onRemove() { if (!this.properties.busy && this.properties.deleting) this.triggerEvent('remove', { key: (this.properties.row || {}).key }) },
    onSources() { if (!this.properties.busy && !this.properties.deleting) this.triggerEvent('sources', { key: (this.properties.row || {}).key }) },
  },
})
