const tokens = require('../../utils/ui-tokens')
const experiencePreferences = require('../../utils/experience-preferences')

Component({
  properties: { feedback: Object, busy: Boolean, reducedMotion: Boolean },
  data: { motionDuration: 0 },
  lifetimes: { attached() { this.updateMotion() } },
  pageLifetimes: { show() { this.updateMotion() } },
  observers: { feedback() { this.updateMotion() }, reducedMotion() { this.updateMotion() } },
  methods: {
    updateMotion() { this.setData({ motionDuration: this.properties.reducedMotion || experiencePreferences().get().reducedMotion ? 0 : tokens.motion.row }) },
    onUndo() { const value = this.properties.feedback || {}; if (!this.properties.busy && value.state === 'success' && value.undoAvailable) this.triggerEvent('undo', { requestId: value.requestId }) },
    onView() { const value = this.properties.feedback || {}; if (!this.properties.busy && value.state === 'success' && value.target) this.triggerEvent('view', { target: value.target }) },
  },
})
