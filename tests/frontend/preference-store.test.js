const assert = require('node:assert/strict')
const test = require('node:test')

const { createWx, installGlobals } = require('./wechat-runtime')
const { createPreferenceStore, defaultPreferences, sanitizePreferencesForOptions } = require('../../utils/preference-store')

test('preference store loads the backend value and caches it per user', async () => {
  const wx = createWx({ initialStorage: { userInfo: { id: 7 } } })
  installGlobals({ wx })
  const api = {
    getUserPreferences: async () => ({
      success: true,
      preferences: {
        preferredCuisineCodes: ['SICHUAN'],
        preferredTagCodes: ['HOME_STYLE'],
        excludedTagCodes: [],
        excludedIngredients: ['花生'],
        avoidRecentDays: 14,
        version: 2,
      },
    }),
  }

  const result = await createPreferenceStore({ api, wx }).load()

  assert.equal(result.synced, true)
  assert.deepEqual(result.preferences.preferredCuisineCodes, ['SICHUAN'])
  assert.deepEqual(wx.getStorageSync('user:id_7:userPreferencesV2').excludedIngredients, ['花生'])
})

test('preference store falls back to cached preferences when backend is unavailable', async () => {
  const cached = { ...defaultPreferences(), preferredCuisineCodes: ['CANTONESE'], version: 1 }
  const wx = createWx({
    initialStorage: {
      userInfo: { id: 9 },
      'user:id_9:userPreferencesV2': cached,
    },
  })
  installGlobals({ wx })
  const store = createPreferenceStore({ api: { getUserPreferences: async () => { throw new Error('offline') } }, wx })

  const result = await store.load()

  assert.equal(result.synced, false)
  assert.deepEqual(result.preferences.preferredCuisineCodes, ['CANTONESE'])
})

test('legacy cuisine booleans migrate to canonical codes and save before removal', async () => {
  const wx = createWx({
    initialStorage: {
      userInfo: { id: 11 },
      'user:id_11:userPreferences': { preferChuan: true, preferYue: true, lowCalorie: true },
    },
  })
  installGlobals({ wx })
  let saved
  const store = createPreferenceStore({
    api: {
      updateUserPreferences: async preferences => {
        saved = preferences
        return { success: true, preferences: { ...preferences, version: 1 } }
      },
    },
    wx,
  })

  const result = await store.migrateLegacy()

  assert.deepEqual(saved.preferredCuisineCodes, ['CANTONESE', 'SICHUAN'])
  assert.equal(result.migrated, true)
  assert.equal(wx.getStorageSync('user:id_11:userPreferences'), undefined)
})

test('an offline legacy migration never overwrites newer V2 edits', async () => {
  const wx = createWx({
    initialStorage: {
      userInfo: { id: 12 },
      'user:id_12:userPreferences': { preferChuan: true },
      'user:id_12:userPreferencesV2': {
        ...defaultPreferences(),
        preferredCuisineCodes: ['CANTONESE'],
        excludedIngredients: ['花生'],
      },
    },
  })
  installGlobals({ wx })
  const store = createPreferenceStore({
    api: { updateUserPreferences: async () => { throw new Error('offline') } },
    wx,
  })

  const result = await store.migrateLegacy()

  assert.equal(result.synced, false)
  assert.deepEqual(result.preferences.preferredCuisineCodes, ['CANTONESE'])
  assert.deepEqual(result.preferences.excludedIngredients, ['花生'])
  assert.deepEqual(wx.getStorageSync('user:id_12:userPreferences'), { preferChuan: true })
})

test('metadata version changes remove only preference codes no longer in the catalog', () => {
  const sanitized = sanitizePreferencesForOptions({
    preferredCuisineCodes: ['SICHUAN', 'REMOVED_CUISINE'],
    preferredTagCodes: ['HOME_STYLE', 'REMOVED_TAG'],
    excludedTagCodes: ['FRY', 'REMOVED_TAG'],
  }, {
    groups: {
      cuisine: [{ code: 'SICHUAN' }],
      scene: [{ code: 'HOME_STYLE' }],
      method: [{ code: 'FRY' }],
      flavor: [],
      diet: [],
    },
  })

  assert.deepEqual(sanitized.preferredCuisineCodes, ['SICHUAN'])
  assert.deepEqual(sanitized.preferredTagCodes, ['HOME_STYLE'])
  assert.deepEqual(sanitized.excludedTagCodes, ['FRY'])
})
