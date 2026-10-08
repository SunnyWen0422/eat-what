const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const defaultIdentity = () => require('./util').getCurrentUserIdentity()
const newRequestId = () => `tools-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
const terminal = task => task && (task.status === 'completed' || task.retryable === false)
const empty = () => ({ status:'idle', taskId:null, requestId:null, task:null, report:null, message:'', retryable:false, target:null })

/** One account-bound, durable operation. Recovery always queries the original task first. */
function createControlledHarness(options = {}) {
  const api = options.api || require('./api')
  const identity = options.identity || defaultIdentity
  const read = options.read || (key => wx.getStorageSync(key))
  const write = options.write || ((key, value) => wx.setStorageSync(key, value))
  const confirm = options.confirm || (content => new Promise(resolve => wx.showModal({
    title:'保存计划并查看回顾', content, confirmText:'确认保存', cancelText:'取消',
    success:result => resolve(!!result.confirm), fail:() => resolve(false)
  })))
  const scope = identity(), key = `user:${scope}:controlled-harness`
  let alive = true, running = null, record = clone(read(key)) || null, view = empty()
  const current = () => alive && identity() === scope && (!options.current || options.current())
  const changed = () => ({ ...empty(), status:'account_changed' })
  const persist = () => { if (current()) write(key, clone(record)) }
  const state = () => current() ? clone(view) : changed()
  function taskView(task) {
    return { status:task.status, taskId:task.id, requestId:record.body.requestId, task:clone(task),
      report:clone(task.report) || null, message:task.message || '', retryable:!!task.retryable, target:clone(record.target) }
  }
  function adopt(task) {
    record.task = clone(task); record.taskId = task.id; delete record.unknown; delete record.unknownMessage
    view = taskView(task)
    persist(); return state()
  }
  if (record) {
    if (record.task) {
      view = taskView(record.task)
      if (record.unknown) view = { ...view, status:'unknown', message:record.unknownMessage || '上次结果待查询，请恢复原任务', retryable:true }
    }
    else view = { ...empty(), status:'unknown', requestId:record.body.requestId, message:'上次结果待查询，请恢复原任务', retryable:true, target:clone(record.target) }
  }
  function unknown(error) {
    if (!current()) return changed()
    view = { ...view, status:'unknown', taskId:record && record.taskId || null, requestId:record && record.body.requestId || null,
      message:error && error.message || '结果尚未确认，请查询原任务后继续', retryable:true, target:record && clone(record.target) }
    if (record) { record.unknown = true; record.unknownMessage = view.message }
    persist(); return state()
  }
  function rejectPreview(error) {
    if (!current()) return changed()
    if (error && error.statusCode >= 400 && error.statusCode < 500) {
      record = null; persist(); view = { ...empty(), status:'failed', message:error.message || '当前内容无法预览，请刷新本餐后重试' }; return state()
    }
    return unknown(error)
  }
  async function commitOrReview(task) {
    if (!current()) return changed()
    adopt(task)
    if (terminal(task)) return state()
    if (!record.approved) {
      // This is the server-owned summary, never a locally reconstructed plan.
      view.status = 'awaiting_confirmation'
      const approved = await confirm(task.summary || '请查看服务器预览后确认')
      if (!current()) return changed()
      if (!approved) { record = null; persist(); view = { ...empty(), status:'cancelled' }; return state() }
      record.approved = true; persist()
    }
    view.status = 'confirming'
    // Persist uncertainty before dispatch, so closing the app mid-request cannot hide it.
    record.unknown = true; record.unknownMessage = '上次确认结果待查询，请恢复原任务'; persist()
    try {
      const result = await api.confirmControlledTask(record.taskId, record.task.previewToken)
      if (!current()) return changed()
      return adopt(result)
    } catch (error) { return unknown(error) }
  }
  async function resolveOriginal() {
    if (!current()) return changed()
    if (!record) return state()
    try {
      const task = record.taskId
        ? await api.getControlledTask(record.taskId)
        : await api.getControlledTaskByRequest(record.body.requestId)
      if (!current()) return changed()
      if (task) return commitOrReview(task)
      // A lost preview response is recovered with its identical request ID and arguments.
      // A known task missing from the server must not become a new write.
      if (record.taskId) return unknown(new Error('原任务暂未找到，请稍后查询；不会创建新的保存操作'))
      view.status = 'previewing'
      let preview
      try { preview = await api.previewControlledTask(clone(record.body)) }
      catch (error) { return rejectPreview(error) }
      if (!current()) return changed()
      return commitOrReview(preview)
    } catch (error) { return unknown(error) }
  }
  function exclusive(action) {
    if (running) return running
    if (!current()) return Promise.resolve(changed())
    running = Promise.resolve().then(action).finally(() => { running = null })
    return running
  }
  function run(target) {
    return exclusive(async () => {
      if (!current()) return changed()
      if (record && !terminal(record.task)) {
        if (JSON.stringify(record.target) !== JSON.stringify(target)) {
          view.message = '还有原任务结果待确认，请先恢复原任务'; view.retryable = true
          return state()
        }
        return resolveOriginal()
      }
      record = { target:clone(target), taskId:null, task:null, approved:false, body:{ requestId:newRequestId(), steps:[
        { tool:'confirm_current_meal', arguments:{ date:target.date, mealType:target.mealType } },
        { tool:'read_actual_diet_review', arguments:{ startDate:target.startDate, endDate:target.endDate } }
      ] } }
      view = { ...empty(), status:'previewing', requestId:record.body.requestId, target:clone(target), retryable:true }; persist()
      try {
        const task = await api.previewControlledTask(clone(record.body))
        if (!current()) return changed()
        return commitOrReview(task)
      } catch (error) {
        // A definitive validation rejection before a preview exists has no write to recover.
        return rejectPreview(error)
      }
    })
  }
  function recover() { return exclusive(resolveOriginal) }
  function dispose() { alive = false }
  return { run, recover, state, dispose }
}

module.exports = { createControlledHarness }
