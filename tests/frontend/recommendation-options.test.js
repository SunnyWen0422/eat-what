const assert = require('node:assert/strict')
const test = require('node:test')

const { createWx } = require('./wechat-runtime')
const { loadRecommendationOptions, sanitizeCriteriaForOptions } = require('../../utils/recommendation-options')

test('recommendation options are cached and restored by metadata version', async () => {
  const wx = createWx()
  const remote = {
    metadataVersion: 2,
    minimumClientVersion: '3.2.0',
    homeQuickOptions: [],
    groups: {
      cuisine: [{ code: 'SICHUAN', label: 'Sichuan', count: 162 }],
      flavor: [], scene: [], diet: [], method: [],
    },
  }
  const first = await loadRecommendationOptions({
    wx,
    api: { getRecommendationOptions: async () => remote },
  })

  assert.equal(first.options.metadataVersion, 2)
  assert.equal(wx.getStorageSync('recommendationOptionsCurrentVersion'), 2)
  assert.equal(wx.getStorageSync('recommendationOptionsV2').metadataVersion, 2)

  const offline = await loadRecommendationOptions({
    wx,
    api: { getRecommendationOptions: async () => { throw new Error('offline') } },
  })
  assert.equal(offline.synced, false)
  assert.equal(offline.options.metadataVersion, 2)
  assert.equal(offline.options.groups.cuisine[0].count, 162)
})

test('criteria keep valid codes and discard removed catalog codes', () => {
  const criteria = sanitizeCriteriaForOptions({
    cuisineCodes: ['SICHUAN', 'REMOVED'],
    includeTagCodes: ['SPICY', 'REMOVED'],
    excludeTagCodes: ['FRY', 'REMOVED'],
  }, {
    groups: {
      cuisine: [{ code: 'SICHUAN' }],
      flavor: [{ code: 'SPICY' }],
      method: [{ code: 'FRY' }],
      scene: [],
      diet: [],
    },
  })

  assert.deepEqual(criteria.cuisineCodes, ['SICHUAN'])
  assert.deepEqual(criteria.includeTagCodes, ['SPICY'])
  assert.deepEqual(criteria.excludeTagCodes, ['FRY'])
})
