// Only the server knows whether its one menu checkpoint is still valid.
// Old history/configuration snapshots and old card text are not qualification.
function canUndoMenu(workspace) {
  return !!workspace && !!workspace.draft && workspace.draft.canUndo === true
}
module.exports = { canUndoMenu }
