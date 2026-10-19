// One server-backed snapshot per account/API environment, shared by every dish star.
function createFavoriteStore({ api, current = () => true, now = Date.now }) {
  let favorites = new Set(), known = false, readTask = null, fetchedAt = 0, revision = 0
  const listeners = new Map(), writes = new Map(), active = new Set(), uncertain = new Map()
  const validId = id => Number.isSafeInteger(Number(id)) && Number(id) > 0
  const error = code => Object.assign(new Error(code), { code })
  const state = id => ({ favorite: favorites.has(Number(id)), known: known && !uncertain.has(Number(id)), busy: writes.has(Number(id)) })
  function notify() {
    if (!current()) return
    for (const [id, callbacks] of listeners) for (const callback of callbacks) callback(state(id))
  }
  function setFavorite(id, value) { if (value) favorites.add(id); else favorites.delete(id) }
  function ensure(force = false) {
    if (!current()) return Promise.reject(error('ACCOUNT_CHANGED'))
    if (readTask) return readTask
    if (!force && known && now() - fetchedAt < 30000) return Promise.resolve()
    const readRevision = revision
    readTask = Promise.resolve().then(() => {
      if (!current()) throw error('ACCOUNT_CHANGED')
      // This existing endpoint returns all favorite IDs; one request serves all visible cards.
      return api.batchCheckFavoriteDishes([...listeners.keys()])
    }).then(ids => {
      if (!current()) throw error('ACCOUNT_CHANGED')
      if (!Array.isArray(ids) || ids.some(id => !validId(id))) throw error('READ_FAILED')
      // A background read started before a click must never undo the newer star state.
      if (revision === readRevision && !active.size) {
        const next = new Set(ids.map(Number))
        for (const id of uncertain.keys()) { if (favorites.has(id)) next.add(id); else next.delete(id) }
        favorites = next; known = true; fetchedAt = now(); notify()
      }
    }).finally(() => { readTask = null })
    return readTask
  }
  async function reconcile(id) {
    if (!current()) throw error('ACCOUNT_CHANGED')
    const result = await api.checkFavoriteDish(id)
    if (!current()) throw error('ACCOUNT_CHANGED')
    if (!result || typeof result.isFavorite !== 'boolean') throw error('READ_FAILED')
    revision++; uncertain.delete(id); setFavorite(id, result.isFavorite)
    return result.isFavorite
  }
  function toggle(input) {
    const id = Number(input)
    if (!validId(input)) return Promise.reject(error('INVALID_DISH'))
    if (!current()) return Promise.reject(error('ACCOUNT_CHANGED'))
    if (writes.has(id)) return Promise.resolve({ ignored: true })
    const task = Promise.resolve().then(async () => {
      await ensure()
      if (!current()) throw error('ACCOUNT_CHANGED')
      if (!known) throw error('READ_FAILED')
      if (uncertain.has(id)) {
        const desired = uncertain.get(id), favorite = await reconcile(id)
        return { id, favorite, reconciled: true, matched: favorite === desired }
      }
      const previous = favorites.has(id), desired = !previous
      revision++; active.add(id); setFavorite(id, desired); notify()
      try {
        const result = await (desired ? api.addFavoriteDish(id) : api.removeFavoriteDish(id))
        if (!current()) throw error('ACCOUNT_CHANGED')
        if (!result || result.success !== true) throw error('WRITE_FAILED')
        return { id, favorite: desired }
      } catch (failure) {
        if (!current()) throw error('ACCOUNT_CHANGED')
        // A timeout may still have saved on the server. Read before offering another write.
        let actual
        try { actual = await reconcile(id) }
        catch (readFailure) {
          if (!current()) throw error('ACCOUNT_CHANGED')
          setFavorite(id, previous); uncertain.set(id, desired)
          throw error('OUTCOME_UNKNOWN')
        }
        if (actual === desired) return { id, favorite: actual, reconciled: true, matched: true }
        throw error('WRITE_FAILED')
      }
    }).finally(() => { writes.delete(id); active.delete(id); notify() })
    writes.set(id, task); notify()
    return task
  }
  return {
    ensure, toggle, state,
    subscribe(input, callback) {
      const id = Number(input)
      if (!validId(input)) return () => {}
      if (!listeners.has(id)) listeners.set(id, new Set())
      listeners.get(id).add(callback); callback(state(id))
      return () => { const set = listeners.get(id); if (set) { set.delete(callback); if (!set.size) listeners.delete(id) } }
    },
  }
}
let currentStore, currentScope
function getFavoriteStore() {
  const { getUserStorageKey } = require('./util'), scope = getUserStorageKey('favoriteState')
  if (!currentStore || currentScope !== scope) {
    currentScope = scope
    currentStore = createFavoriteStore({ api: require('./api'), current: () => scope === getUserStorageKey('favoriteState') })
  }
  return currentStore
}
module.exports = { createFavoriteStore, getFavoriteStore }
