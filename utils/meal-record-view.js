// Saved meal presentation shared by home and assistant. This never creates a draft.
function displayedRecord(state = {}) {
  const workspace = state.workspace, plan = state.linked && state.linked.plan
  return plan && !state.dirty && !state.pending &&
    (!workspace || workspace.status === 'planned' || !(workspace.draft && workspace.draft.dishes && workspace.draft.dishes.length)) ? plan : null
}

function workspaceRepresentsRecord(state = {}) {
  const plan = displayedRecord(state)
  if (!plan) return true
  const workspace = state.workspace, receipt = workspace && workspace.confirmation
  const context = state.context || workspace && workspace.context
  return !!receipt && !!context && receipt.date === context.date && receipt.mealType === context.mealType &&
    receipt.planVersion === (workspace.draft && workspace.draft.planVersion) && receipt.planRevision === plan.revision
}

module.exports = { displayedRecord, workspaceRepresentsRecord }
