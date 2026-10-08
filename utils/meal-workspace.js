const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const canonical = value => JSON.stringify(value, function(key, item) { return item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item).sort().reduce((out,k)=>(out[k]=item[k],out),{}) : item })
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date) || !['breakfast', 'lunch', 'dinner'].includes(c.mealType)) throw new Error('请指定有效日期和餐次')
  c.people = Number(c.people)
  if (!Number.isInteger(c.people) || c.people < 1 || c.people > 50) throw new Error('人数应为 1 至 50')
  if (c.compositionMode === 'auto') {
    const n = Math.min(10, Math.ceil(c.people / 2) + 1)
    c.counts = c.mealType === 'breakfast' ? { staple: c.people < 5 ? 1 : 2, side: c.people < 3 ? 1 : 2 } : { meat: Math.floor(n / 2), veg: n - Math.floor(n / 2) }
  } else if (c.compositionMode !== 'manual') throw new Error('搭配模式无效')
  return c
}

/** An instance is permanently bound to one account; pages recreate it on account switch. */
function createWorkspaceStore(options = {}) {
  const api = options.api || require('./api')
  const identity = options.identity || require('./util').getCurrentUserIdentity
  const read = options.read || (key => wx.getStorageSync(key))
  const write = options.write || ((key, value) => wx.setStorageSync(key, value))
  const scope = identity()
  let active = true, generation = 0, key = '', workspace = null, context = null, linked = {}, dirty = false, pending = null, syncStatus = 'loading'
  const ensure = () => { if (!active || scope !== identity()) throw new Error('账号已切换，请重新进入本餐') }
  const persist = () => { ensure(); if (key) write(key, clone({ workspace, context, linked, dirty, pending, syncStatus })) }
  const state = () => scope === identity() && active ? clone({ workspace, context, linked, dirty, pending, syncStatus }) : { workspace: null, context: null, linked: {}, dirty: false, pending: null, syncStatus: 'account_changed' }
  async function load(date, mealType, defaults = {}) {
    ensure(); const ticket = ++generation
    key = `user:${scope}:meal-workspace:${date}:${mealType}`
    const local = read(key) || {}
    workspace = local.workspace || null; context = local.context || normalizeContext({ ...defaults, date, mealType }); linked = local.linked || {}
    dirty = !!local.dirty; pending = local.pending || null; syncStatus = pending ? 'unknown' : dirty ? 'unsynced' : 'loading'
    try {
      const response = await api.getMealWorkspace(date, mealType); ensure()
      if (ticket !== generation) throw new Error('当前餐已切换')
      if (workspace && (!response.workspace || (workspace.id === response.workspace.id && workspace.revision > response.workspace.revision))) { persist(); return state() }
      if ((!dirty && !pending) || !workspace) workspace = response.workspace || null; linked = { plan: response.plan || null, actual: response.actual || null, planRevision: response.planRevision || 0 }
      if (!dirty && !pending && workspace) context = clone(workspace.context)
      syncStatus = pending ? 'unknown' : dirty ? 'unsynced' : 'synced'; persist(); return state()
    } catch (error) { ensure(); if (ticket === generation) { syncStatus = error.statusCode === 409 ? 'conflict' : 'offline'; persist() } throw error }
  }
  function edit(value) { ensure(); context = normalizeContext(value); dirty = true; if (syncStatus !== 'conflict' && !pending) syncStatus = 'unsynced'; persist(); return state() }
  const available = () => { ensure(); if (syncStatus === 'conflict') throw new Error('本餐已更新，请查看最新内容后重新应用输入'); if (pending) throw new Error('上次结果待确认，请先重试或查询原请求') }
  async function send(operation) {
    ensure(); const ticket = generation
    pending = clone(operation); syncStatus = 'saving'; persist()
    try {
      let result
      if (operation.type === 'create') result = await api.createMealWorkspace(operation.body)
      else if (operation.type === 'context') result = await api.saveWorkspaceContext(operation.id, operation.body)
      else if (operation.type === 'confirm') result = await api.confirmMealWorkspace(operation.id, operation.body)
      else result = await api.commandMealWorkspace(operation.id, operation.body)
      ensure(); if (ticket !== generation) throw new Error('当前餐已切换')
      workspace = result; pending = null
      if (operation.type === 'create' && canonical(normalizeContext(result.context)) !== canonical(normalizeContext(operation.body.context))) { dirty=true;syncStatus='conflict';persist();return state() }
      if (operation.body.context && JSON.stringify(operation.body.context) === JSON.stringify(context)) dirty = false
      syncStatus = dirty ? 'unsynced' : 'synced'; persist(); return state()
    } catch (error) {
      ensure(); if (ticket === generation) {
        if (error.statusCode === 409) { pending = null; syncStatus = 'conflict' }
        else if (error.statusCode >= 400 && error.statusCode < 500) { pending = null; syncStatus = 'unsynced' }
        else syncStatus = 'unknown'
        persist()
      }
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
    available(); await save(); available()
    return send({ type: 'command', id: workspace.id, body: { ...extra, requestId: requestId(), expectedWorkspaceRevision: workspace.revision, planVersion: workspace.draft.planVersion, command } })
  }
  async function confirm(planRevision) {
    available()
    if (dirty || !workspace) throw new Error('条件未同步，请先保存并重新安排')
    return send({ type: 'confirm', id: workspace.id, body: { requestId: requestId(), expectedWorkspaceRevision: workspace.revision, planVersion: workspace.draft.planVersion, expectedPlanRevision: planRevision } })
  }
  async function retry() {
    ensure(); if (syncStatus === 'conflict') throw new Error('请先查看最新内容')
    if (!pending) return save()
    const original = clone(pending)
    if (original.id) {
      const receipt = await api.getWorkspaceRequest(original.id, original.body.requestId); ensure()
      if (receipt) { workspace = receipt; pending = null; if (original.body.context && JSON.stringify(original.body.context) === JSON.stringify(context)) dirty = false; syncStatus = dirty ? 'unsynced' : 'synced'; persist(); return state() }
    }
    return send(original)
  }
  async function reloadLatest() {
    ensure(); if (pending) throw new Error('上次保存结果待确认，请先查询原请求')
    dirty = false; syncStatus = 'loading'; persist()
    return load(context.date, context.mealType)
  }
  function dispose() { active = false; generation++ }
  return { load, edit, save, command, confirm, retry, reloadLatest, state, dispose }
}

module.exports = { resolveActiveTarget, defaultTarget, normalizeContext, createWorkspaceStore, requestId }
