const api = require('./api')
const { normalizeCriteria } = require('./recommendation-criteria')

const CURRENT_VERSION_KEY = 'recommendationOptionsCurrentVersion'
const cacheKey = version => `recommendationOptionsV${version}`

const FALLBACK_OPTIONS = {
  metadataVersion: 1,
  minimumClientVersion: '3.2.0',
  preferencesEnabled: true,
  homeQuickOptions: [
    { id: 'home', code: 'HOME_STYLE', label: '家常菜', kind: 'tag', count: 6035 },
    { id: 'sichuan', code: 'SICHUAN', label: '川菜', kind: 'cuisine', count: 162 },
    { id: 'cantonese', code: 'CANTONESE', label: '粤菜', kind: 'cuisine', count: 65 },
  ],
  groups: {
    cuisine: [
      { code: 'SICHUAN', label: '川菜', count: 162 },
      { code: 'CANTONESE', label: '粤菜', count: 65 },
      { code: 'NORTHEAST', label: '东北菜', count: 74 },
      { code: 'HUNAN', label: '湘菜', count: 24 },
      { code: 'JIANGNAN', label: '江浙沪', count: 42 },
      { code: 'SHANDONG', label: '鲁菜', count: 11 },
      { code: 'FUJIAN', label: '闽菜', count: 9 },
      { code: 'NORTHWEST', label: '西北风味', count: 13 },
    ],
    flavor: [
      { code: 'SPICY', label: '香辣', count: 126 },
      { code: 'NUMB_SPICY', label: '麻辣', count: 81 },
      { code: 'SOUR_SPICY', label: '酸辣', count: 88 },
      { code: 'SWEET_SOUR', label: '酸甜', count: 133 },
      { code: 'TOMATO', label: '番茄味', count: 154 },
      { code: 'LIGHT', label: '清淡', count: 52 },
    ],
    scene: [
      { code: 'HOME_STYLE', label: '家常菜', count: 6035 },
      { code: 'QUICK', label: '20分钟内', count: 4942 },
      { code: 'LOW_EFFORT', label: '省心好做', count: 417 },
      { code: 'LUNCH', label: '午餐', count: 2833 },
      { code: 'DINNER', label: '晚餐', count: 390 },
      { code: 'GATHERING', label: '朋友聚餐', count: 1453 },
    ],
    diet: [
      { code: 'VEGETARIAN', label: '素食', count: 1525 },
      { code: 'HEALTHY', label: '健康食谱', count: 73 },
    ],
    method: [
      { code: 'STEAM', label: '蒸', count: 342 },
      { code: 'STIR_FRY', label: '炒', count: 3384 },
      { code: 'BRAISE', label: '烧焖', count: 111 },
      { code: 'STEW', label: '炖煲', count: 1060 },
      { code: 'BAKE', label: '烤', count: 230 },
      { code: 'FRY', label: '煎炸', count: 611 },
      { code: 'COLD_MIX', label: '凉拌', count: 322 },
    ],
  },
}

function normalizeOption(item) {
  return {
    ...item,
    code: String(item.code || '').toUpperCase(),
    label: item.label || item.code,
    count: Number(item.count) || 0,
  }
}

function normalizeOptions(value) {
  const source = value && value.groups ? value : FALLBACK_OPTIONS
  const groups = {}
  Object.keys(FALLBACK_OPTIONS.groups).forEach(key => {
    const items = source.groups && Array.isArray(source.groups[key]) ? source.groups[key] : FALLBACK_OPTIONS.groups[key]
    groups[key] = items.map(normalizeOption).filter(item => item.code)
  })
  const homeQuickOptions = (Array.isArray(source.homeQuickOptions)
    ? source.homeQuickOptions
    : FALLBACK_OPTIONS.homeQuickOptions).map(normalizeOption)
  return {
    metadataVersion: Number(source.metadataVersion) || 1,
    minimumClientVersion: source.minimumClientVersion || FALLBACK_OPTIONS.minimumClientVersion,
    preferencesEnabled: source.preferencesEnabled !== false,
    homeQuickOptions,
    groups,
  }
}

function sanitizeCriteriaForOptions(value, options) {
  const criteria = normalizeCriteria(value)
  if (!options || !options.groups) return criteria
  const cuisineCodes = new Set((options.groups.cuisine || []).map(item => item.code))
  const tagCodes = new Set(['flavor', 'scene', 'diet', 'method']
    .flatMap(group => options.groups[group] || [])
    .map(item => item.code))
  return {
    ...criteria,
    cuisineCodes: criteria.cuisineCodes.filter(code => cuisineCodes.has(code)),
    includeTagCodes: criteria.includeTagCodes.filter(code => tagCodes.has(code)),
    excludeTagCodes: criteria.excludeTagCodes.filter(code => tagCodes.has(code)),
  }
}

async function loadRecommendationOptions(dependencies = {}) {
  const backend = dependencies.api || api
  const wxRuntime = dependencies.wx || wx
  try {
    const options = normalizeOptions(await backend.getRecommendationOptions())
    wxRuntime.setStorageSync(cacheKey(options.metadataVersion), options)
    wxRuntime.setStorageSync(CURRENT_VERSION_KEY, options.metadataVersion)
    return { options, synced: true }
  } catch (error) {
    const version = Number(wxRuntime.getStorageSync(CURRENT_VERSION_KEY)) || FALLBACK_OPTIONS.metadataVersion
    const cached = wxRuntime.getStorageSync(cacheKey(version)) || wxRuntime.getStorageSync('recommendationOptionsV1')
    return { options: normalizeOptions(cached), synced: false, error }
  }
}

module.exports = { FALLBACK_OPTIONS, loadRecommendationOptions, normalizeOptions, sanitizeCriteriaForOptions }
