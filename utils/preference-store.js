const api = require('./api')
const { getUserStorageKey } = require('./util')

function defaultPreferences() {
  return {
    preferredCuisineCodes: [],
    preferredTagCodes: [],
    excludedTagCodes: [],
    excludedIngredients: [],
    defaultPeople: 2,
    avoidRecentDays: 7,
    maxCookMinutes: null,
    version: 1,
  }
}

function unique(values, max) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim().toUpperCase())
    .filter(Boolean))]
    .sort()
    .slice(0, max)
}

function normalizePreferences(value = {}) {
  const days = Number(value.avoidRecentDays)
  const minutes = Number(value.maxCookMinutes)
  return {
    preferredCuisineCodes: unique(value.preferredCuisineCodes, 12),
    preferredTagCodes: unique(value.preferredTagCodes, 20),
    excludedTagCodes: unique(value.excludedTagCodes, 20),
    excludedIngredients: [...new Set((Array.isArray(value.excludedIngredients) ? value.excludedIngredients : [])
      .map(item => String(item || '').trim().slice(0, 20))
      .filter(Boolean))].sort().slice(0, 30),
    defaultPeople: Number.isInteger(Number(value.defaultPeople)) && Number(value.defaultPeople) >= 1 && Number(value.defaultPeople) <= 50 ? Number(value.defaultPeople) : 2,
    avoidRecentDays: Number.isFinite(days) ? Math.max(0, Math.min(30, Math.round(days))) : 7,
    maxCookMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(240, Math.round(minutes)) : null,
    version: Number(value.version) || 1,
  }
}

function sanitizePreferencesForOptions(value, options) {
  const normalized = normalizePreferences(value)
  if (!options || !options.groups) return normalized
  const cuisineCodes = new Set((options.groups.cuisine || []).map(item => item.code))
  const tagCodes = new Set(['flavor', 'scene', 'diet', 'method']
    .flatMap(group => options.groups[group] || [])
    .map(item => item.code))
  return {
    ...normalized,
    preferredCuisineCodes: normalized.preferredCuisineCodes.filter(code => cuisineCodes.has(code)),
    preferredTagCodes: normalized.preferredTagCodes.filter(code => tagCodes.has(code)),
    excludedTagCodes: normalized.excludedTagCodes.filter(code => tagCodes.has(code)),
  }
}

function createPreferenceStore(dependencies = {}) {
  const backend = dependencies.api || api
  const wxRuntime = dependencies.wx || wx
  const cacheKey = () => getUserStorageKey('userPreferencesV2')
  const legacyKey = () => getUserStorageKey('userPreferences')

  function readCache() {
    return normalizePreferences(wxRuntime.getStorageSync(cacheKey()) || defaultPreferences())
  }

  function writeCache(value, key = cacheKey()) {
    const normalized = normalizePreferences(value)
    wxRuntime.setStorageSync(key, normalized)
    return normalized
  }

  async function load() {
    const key = cacheKey()
    try {
      const result = await backend.getUserPreferences()
      if (key !== cacheKey()) return { preferences: readCache(), synced: false, accountChanged: true }
      const preferences = writeCache((result && result.preferences) || result || defaultPreferences(), key)
      return { preferences, synced: true }
    } catch (error) {
      return { preferences: readCache(), synced: false, error }
    }
  }

  async function save(value) {
    const key = cacheKey()
    const pending = writeCache(value, key)
    try {
      const result = await backend.updateUserPreferences(pending)
      if (key !== cacheKey()) return { preferences: readCache(), synced: false, accountChanged: true }
      const preferences = writeCache((result && result.preferences) || pending, key)
      return { preferences, synced: true }
    } catch (error) {
      return { preferences: pending, synced: false, error, accountChanged: key !== cacheKey() }
    }
  }

  async function migrateLegacy() {
    const oldKey = legacyKey()
    const legacy = wxRuntime.getStorageSync(oldKey)
    if (!legacy) return { migrated: false, preferences: readCache() }
    const existingV2 = wxRuntime.getStorageSync(cacheKey())
    let next
    if (existingV2) {
      next = normalizePreferences(existingV2)
    } else {
      const cuisines = []
      if (legacy.preferChuan) cuisines.push('SICHUAN')
      if (legacy.preferYue) cuisines.push('CANTONESE')
      if (legacy.preferLu) cuisines.push('SHANDONG')
      if (legacy.preferHuaiyang || legacy.preferZhe || legacy.preferHu) cuisines.push('JIANGNAN')
      next = normalizePreferences({ ...defaultPreferences(), preferredCuisineCodes: cuisines })
    }
    const result = await save(next)
    if (result.synced && oldKey === legacyKey()) wxRuntime.removeStorageSync(oldKey)
    return { ...result, migrated: result.synced }
  }

  return { load, save, migrateLegacy, readCache, writeCache }
}

module.exports = { createPreferenceStore, defaultPreferences, normalizePreferences, sanitizePreferencesForOptions }
