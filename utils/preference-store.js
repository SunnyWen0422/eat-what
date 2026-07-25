const api = require('./api')
const { getUserStorageKey } = require('./util')

function defaultPreferences() {
  return {
    preferredCuisineCodes: [],
    preferredTagCodes: [],
    excludedTagCodes: [],
    excludedIngredients: [],
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

  function writeCache(value) {
    const normalized = normalizePreferences(value)
    wxRuntime.setStorageSync(cacheKey(), normalized)
    return normalized
  }

  async function load() {
    try {
      const result = await backend.getUserPreferences()
      const preferences = writeCache((result && result.preferences) || result || defaultPreferences())
      return { preferences, synced: true }
    } catch (error) {
      return { preferences: readCache(), synced: false, error }
    }
  }

  async function save(value) {
    const pending = writeCache(value)
    try {
      const result = await backend.updateUserPreferences(pending)
      const preferences = writeCache((result && result.preferences) || pending)
      return { preferences, synced: true }
    } catch (error) {
      return { preferences: pending, synced: false, error }
    }
  }

  async function migrateLegacy() {
    const legacy = wxRuntime.getStorageSync(legacyKey())
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
    if (result.synced) wxRuntime.removeStorageSync(legacyKey())
    return { ...result, migrated: result.synced }
  }

  return { load, save, migrateLegacy, readCache, writeCache }
}

module.exports = { createPreferenceStore, defaultPreferences, normalizePreferences, sanitizePreferencesForOptions }
