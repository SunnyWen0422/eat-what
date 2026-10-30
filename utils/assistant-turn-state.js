function canResume(turn) {
 if(!turn || turn.status!=='awaiting_confirmation')return false
 const steps=turn.continuation&&turn.continuation.steps,cursor=turn.continuation&&turn.continuation.cursor
 return (turn.cards||[]).some(c=>c.data&&c.data.executionMode==='direct') ||
  !!(!turn.pendingAction&&steps&&steps[cursor]&&steps[cursor].status==='pending')
}
function automaticContinuation(turn) {
 return !!(canResume(turn)&&!turn.pendingAction&&(!turn.reply||turn.retryable===false))
}
function isBusy(turn) {
 return !!(turn&&(automaticContinuation(turn)||['queued','running'].includes(turn.status)||
  (turn.cards||[]).some(c=>c.data&&c.data.executionMode==='direct')&&turn.retryable===false))
}
module.exports={canResume,automaticContinuation,isBusy}
