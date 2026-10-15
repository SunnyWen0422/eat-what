function feedbackAction({ kind, dishId, busy, locked } = {}) {
  if (busy || !Number.isSafeInteger(dishId) || dishId <= 0) return { action: 'none' }
  const action = kind === 'keep' ? (locked ? 'release' : 'keep')
    : kind === 'change' ? (locked ? 'none' : 'replace')
      : kind === 'quicker' ? 'open_time' : 'none'
  return action === 'none' ? { action } : { action, dishId }
}
module.exports = { feedbackAction }
