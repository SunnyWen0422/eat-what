const { validateCounts } = require('./meal-composition')
const { validateMealTarget, matchesSaveSnapshot } = require('./meal-save-target')
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const canonical = value => JSON.stringify(value, function(key, item) { return item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item).sort().reduce((out,k)=>(out[k]=item[k],out),{}) : item })
const canonicalContext = value => {
  const context = normalizeContext(value)
  context.criteria = { cuisineCodes: [], includeTagCodes: [], excludeTagCodes: [], excludedIngredients: [], maxCookMinutes: null, ...context.criteria }
  return canonical(context)
}
const requestId = () => `ws-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`

function defaultTarget(now = new Date()) {
  const china = new Date(now.getTime() + 8 * 3600000)
  const hour = china.getUTCHours()
  return { date: china.toISOString().slice(0, 10), mealType: hour < 10 ? 'breakfast' : hour < 16 ? 'lunch' : 'dinner' }
}

function resolveActiveTarget(mode, params = {}, stored, now = new Date()) {
  const current = defaultTarget(now), saved = stored || {}
  const explicit = /^\d{4}-\d{2}-\d{2}$/.test(params.date || '')
  const base = mode === 'today' && saved.selectedOn !== current.date ? current : { ...current, ...saved }
  return { date: explicit ? params.date : base.date, mealType: ['breakfast', 'lunch', 'dinner'].includes(params.mealType) ? params.mealType : base.mealType }
}

function normalizeContext(input) {
  const c = { people: 2, compositionMode: 'auto', counts: {}, criteria: {}, totalCookMinutes: null, requirements: '', ownedIngredients: [], ...clone(input) }
  validateMealTarget(c)
  c.people = Number(c.people)
  if (!Number.isInteger(c.people) || c.people < 1 || c.people > 50) throw new Error('人数应为 1 至 50')
  if (c.compositionMode === 'auto') {
    const n = Math.min(10, Math.ceil(c.people / 2) + 1)
    c.counts = c.mealType === 'breakfast' ? { staple: c.people < 5 ? 1 : 2, side: c.people < 3 ? 1 : 2 } : { meat: Math.floor(n / 2), veg: n - Math.floor(n / 2) }
  } else if (c.compositionMode !== 'manual') throw new Error('搭配模式无效')
  else { const checked = validateCounts(c.counts); if (!checked.valid) throw new Error(checked.error) }
  return c
}

/** An instance is permanently bound to one account; pages recreate it on account switch. */
function createWorkspaceStore(options = {}) {
  const api = options.api || require('./api')
  const accountIdentity = options.identity || require('./util').getCurrentUserIdentity
  const identity = () => {
    const account = accountIdentity()
    return account === 'guest' ? `api_v2_${encodeURIComponent(require('./config').getApiBaseUrl())}:guest` : account
  }
  const read = options.read || (key => wx.getStorageSync(key))
  const write = options.write || ((key, value) => wx.setStorageSync(key, value))
  const scope = identity()
  let active = true, generation = 0, mutation = 0, key = '', workspace = null, context = null, linked = {}, dirty = false, pending = null, lastAction = null, syncStatus = 'loading'
  const ensure = () => { if (!active || scope !== identity()) throw new Error('账号已切换，请重新进入本餐') }
  const owns = (ticket,mutationTicket) => active && scope===identity() && ticket===generation && mutationTicket===mutation
  const superseded = () => Object.assign(new Error('当前餐已切换'),{superseded:true})
  const persist = () => { ensure(); if (key) write(key, clone({ workspace, context, linked, dirty, pending, lastAction, syncStatus })) }
  const state = () => scope === identity() && active ? clone({ workspace, context, linked, dirty, pending, lastAction, syncStatus }) : { workspace: null, context: null, linked: {}, dirty: false, pending: null, syncStatus: 'account_changed' }
  async function load(date, mealType, defaults = {}) {
    ensure(); const ticket = ++generation, mutationTicket=mutation
    key = `user:${scope}:meal-workspace:${date}:${mealType}`
    const local = read(key) || {}
    workspace = local.workspace || null; context = local.context || normalizeContext({ ...defaults, date, mealType }); linked = local.linked || {}
    dirty = !!local.dirty; pending = local.pending || null; lastAction = local.lastAction || null; syncStatus = pending ? 'unknown' : dirty ? 'unsynced' : 'loading'
    try {
      const response = await api.getMealWorkspace(date, mealType); ensure()
      if (!owns(ticket,mutationTicket)) throw superseded()
      if (workspace && (!response.workspace || (workspace.id === response.workspace.id && workspace.revision > response.workspace.revision))) { persist(); return state() }
      if ((!dirty && !pending) || !workspace) workspace = response.workspace || null; linked = { plan: response.plan || null, actual: response.actual || null, planRevision: response.planRevision || 0 }
      if (!dirty && !pending && workspace) context = clone(workspace.context)
      await verifyActionTask(workspace,ticket,mutationTicket)
      ensure();if(!owns(ticket,mutationTicket))throw superseded()
      syncStatus = pending ? 'unknown' : dirty ? 'unsynced' : 'synced'; persist(); return state()
    } catch (error) {
      ensure()
      // Same-target reads superseded by a newer write remain a resolved no-op
      // for existing store callers. The page must not render/reset that result.
      if(ticket===generation && mutationTicket!==mutation)return {...state(),superseded:true}
      if(!owns(ticket,mutationTicket))throw superseded()
      syncStatus=error.statusCode===409?'conflict':'offline';persist();throw error
    }
  }
  function edit(value) { ensure(); context = normalizeContext(value); dirty = true; if (syncStatus !== 'conflict' && !pending) syncStatus = 'unsynced'; persist(); return state() }
  const available = () => { ensure(); if (syncStatus === 'conflict') throw new Error('本餐已更新，请查看最新内容后重新应用输入'); if (pending) throw new Error('上次结果待确认，请先重试或查询原请求') }
  function rememberAction(operation) {
    if(operation.type!=='command')return null
    if(!lastAction || !lastAction.command || lastAction.command.requestId!==operation.body.requestId) {
      // Pre-update pending caches have no display metadata. Reconstruct it
      // only from the exact original revision, without changing the request.
      const before=workspace && workspace.id===operation.id && workspace.revision===operation.body.expectedWorkspaceRevision && workspace.draft && workspace.draft.planVersion===operation.body.planVersion ? clone(workspace) : null
      lastAction={before,command:clone(operation.body),receipt:null}
    }
    return lastAction
  }
  function acceptResult(result, operation) {
    if(operation.type==='command') {
      if(!result || result.id!==operation.id || result.revision!==operation.body.expectedWorkspaceRevision+1 || !result.draft ||
        ![operation.body.planVersion,operation.body.planVersion+1].includes(result.draft.planVersion))throw new Error('操作回执与原请求不一致，请核对原请求')
      rememberAction(operation).receipt={requestId:operation.body.requestId,workspaceId:result.id,revision:result.revision,planVersion:result.draft.planVersion,taskId:result.taskId || null}
    }
    if(operation.type!=='confirm')return result
    const body=operation.body,receipt=result && result.confirmation,source=workspace && workspace.context
    if(!receipt || !source || result.id!==operation.id || result.revision!==body.expectedWorkspaceRevision+1 ||
      !result.draft || result.draft.planVersion!==body.planVersion || !result.context || result.context.date!==source.date || result.context.mealType!==source.mealType ||
      receipt.requestId!==body.requestId || receipt.planVersion!==body.planVersion || receipt.planRevision!==body.expectedPlanRevision+1 ||
      receipt.date!==(body.targetDate || source.date) || receipt.mealType!==(body.targetMealType || source.mealType))throw new Error('保存回执与原请求不一致，请查询原请求确认结果')
    // Request receipts intentionally omit recipe and private context fields. A
    // confirmation never edits either, so retain the frozen source on recovery.
    return { ...result, context:clone(workspace.context), draft:clone(workspace.draft) }
  }
  async function verifyActionTask(latest, ticket, mutationTicket) {
    const action=lastAction,receipt=action && action.receipt
    if(!receipt || !receipt.taskId || !latest || latest.id!==receipt.workspaceId || latest.revision!==receipt.revision+1 || action.task)return
    // A matching version alone can also be an unrelated old-client command.
    // Verify the original queued task before attributing this menu to it.
    const task=await api.getWorkspaceTask(receipt.workspaceId,receipt.taskId);ensure()
    if(!owns(ticket,mutationTicket) || lastAction!==action)throw superseded()
    if(!task || task.id!==receipt.taskId || task.workspaceId!==receipt.workspaceId || task.baseRevision!==receipt.revision)throw new Error('原任务回执尚未匹配，请核对原请求')
    if(['queued','running'].includes(task.status))throw new Error('原任务仍在处理中，请稍后核对')
    action.task={id:task.id,workspaceId:task.workspaceId,baseRevision:task.baseRevision,status:task.status}
  }
  async function readAcceptedWorkspace(accepted, operation, ticket, mutationTicket) {
    const response=await api.getMealWorkspace(context.date,context.mealType);ensure()
    if(!owns(ticket,mutationTicket))throw superseded()
    if(!response.workspace || response.workspace.id!==operation.id || response.workspace.revision<accepted.revision)throw new Error('原请求已接收，最新菜单仍待核对')
    await verifyActionTask(response.workspace,ticket,mutationTicket)
    ensure();if(!owns(ticket,mutationTicket))throw superseded()
    linked={plan:response.plan || null,actual:response.actual || null,planRevision:response.planRevision || 0}
    return response.workspace
  }
  async function send(operation) {
    ensure(); const ticket = generation, mutationTicket=++mutation
    rememberAction(operation)
    pending = clone(operation); syncStatus = 'saving'; persist()
    try {
      let result
      if (operation.type === 'create') result = await api.createMealWorkspace(operation.body)
      else if (operation.type === 'context') result = await api.saveWorkspaceContext(operation.id, operation.body)
      else if (operation.type === 'confirm') result = await api.confirmMealWorkspace(operation.id, operation.body)
      else result = await api.commandMealWorkspace(operation.id, operation.body)
      ensure(); if (!owns(ticket,mutationTicket)) throw superseded()
      let accepted=acceptResult(result,operation)
      // A replay through the original command endpoint is minimized too. It
      // cannot erase the visible menu if its authoritative reread is offline.
      if(operation.type==='command' && workspace.draft.dishes.length && !accepted.draft.dishes.length)accepted=await readAcceptedWorkspace(accepted,operation,ticket,mutationTicket)
      ensure();if(!owns(ticket,mutationTicket))throw superseded()
      workspace = accepted; pending = null
      if (operation.type === 'create' && canonicalContext(result.context) !== canonicalContext(operation.body.context)) { dirty=true;syncStatus='conflict';persist();return state() }
      if (operation.body.context && JSON.stringify(operation.body.context) === JSON.stringify(context)) dirty = false
      syncStatus = dirty ? 'unsynced' : 'synced'; persist(); return state()
    } catch (error) {
      ensure(); if (owns(ticket,mutationTicket)) {
        if (error.statusCode === 409) { pending = null; syncStatus = 'conflict' }
        else if (error.statusCode >= 400 && error.statusCode < 500) { pending = null; syncStatus = 'unsynced' }
        else syncStatus = 'unknown'
        persist()
      } else throw superseded()
      throw error
    }
  }
  async function save() {
    available()
    if (!workspace) return send({ type: 'create', body: { requestId: requestId(), expectedWorkspaceRevision: 0, context: clone(context) } })
    if (!dirty) return state()
    return send({ type: 'context', id: workspace.id, body: { requestId: requestId(), expectedWorkspaceRevision: workspace.revision, context: clone(context) } })
  }
  async function command(command, extra = {}) {
    available(); if(dirty || !workspace)await save(); available()
    return send({ type: 'command', id: workspace.id, body: { ...extra, requestId: extra.requestId || requestId(), expectedWorkspaceRevision: workspace.revision, planVersion: workspace.draft.planVersion, command } })
  }
  async function confirm(planRevision, target, snapshot) {
    available()
    if (dirty || !workspace) throw new Error('条件未同步，请先保存并重新安排')
    if (snapshot && !matchesSaveSnapshot(snapshot, state(), scope)) throw new Error('菜单已变化，请重新打开保存面板核对方案')
    const destination = target == null ? {} : validateMealTarget(target)
    return send({ type: 'confirm', id: workspace.id, body: { requestId: requestId(), expectedWorkspaceRevision: workspace.revision, planVersion: workspace.draft.planVersion, expectedPlanRevision: planRevision,
      ...(target == null ? {} : { targetDate: destination.date, targetMealType: destination.mealType }) } })
  }
  function revalidateConfirmation(snapshot, latest) {
    ensure()
    if (pending) throw new Error('上次结果待确认，请先查询原请求')
    const local = { ...state(), syncStatus: 'synced' }
    if (!matchesSaveSnapshot(snapshot, local, scope) || !matchesSaveSnapshot(snapshot, { ...local, workspace: latest, context: latest && latest.context }, scope)) throw new Error('原菜单已在另一处变化，请保留面板并核对最新方案')
    syncStatus = 'synced'; persist(); return state()
  }
  async function retry() {
    ensure(); if (syncStatus === 'conflict') throw new Error('请先查看最新内容')
    if (!pending) return save()
    const original = clone(pending),ticket=generation,mutationTicket=++mutation
    rememberAction(original)
    if (original.id) {
      const receipt = await api.getWorkspaceRequest(original.id, original.body.requestId); ensure()
      if(!owns(ticket,mutationTicket))throw superseded()
      if (receipt) {
        const accepted=acceptResult(receipt,original)
        // Logged receipts intentionally omit dishes and private context. Reread
        // the authoritative source before replacing a recovered command menu.
        let recovered=accepted
        if(original.type==='command' || original.type==='context')recovered=await readAcceptedWorkspace(accepted,original,ticket,mutationTicket)
        ensure();if(!owns(ticket,mutationTicket))throw superseded()
        workspace=recovered
        pending=null
        if(original.body.context && JSON.stringify(original.body.context)===JSON.stringify(context))dirty=false
        if(!dirty && workspace.context)context=clone(workspace.context)
        syncStatus=dirty?'unsynced':'synced';persist();return state()
      }
    }
    return send(original)
  }
  async function reloadLatest() {
    ensure(); if (pending) throw new Error('上次保存结果待确认，请先查询原请求')
    dirty = false; syncStatus = 'loading'; persist()
    return load(context.date, context.mealType)
  }
  function dispose() { active = false; generation++ }
  return { load, edit, save, command, confirm, retry, revalidateConfirmation, reloadLatest, state, dispose }
}

module.exports = { resolveActiveTarget, defaultTarget, normalizeContext, createWorkspaceStore, requestId }
