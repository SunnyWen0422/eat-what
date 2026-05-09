// 获取所有菜品（优先从缓存读取）
async function getAllDishes() {
  // 1. 优先从 App 全局缓存读取
  const app = getApp && getApp()
  if (app && app.globalData && app.globalData.allDishes && app.globalData.allDishes.length > 0) {
    console.log('📦 使用 App 全局缓存菜品:', app.globalData.allDishes.length, '条')
    return _processDishes(app.globalData.allDishes)
  }

  // 2. 从本地存储读取
  const cached = wx.getStorageSync('cachedAllDishes')
  if (cached && cached.length > 0) {
    console.log('📦 使用本地存储缓存菜品:', cached.length, '条')
    return _processDishes(cached)
  }

  // 3. 从后端API获取
  const { getDishesLite } = require('./api')
  try {
    console.log('🔄 开始获取后端菜品数据（轻量版）...')
    const dishes = await getDishesLite()
    console.log('✅ API返回数据:', dishes)

    // 更新缓存
    if (app && app.globalData) {
      app.globalData.allDishes = dishes
    }
    wx.setStorageSync('cachedAllDishes', dishes)
    wx.setStorageSync('cachedAllDishesTime', Date.now())

    return _processDishes(dishes)
  } catch (error) {
    console.error('❌ 获取后端菜品数据失败:', error)
    console.log('🔄 回退到本地数据...')

    const { getDefaultDishes } = require('./dishes')
    const defaultDishes = getDefaultDishes()
    const { getUserStorageKey } = require('./util')
    const customKey = getUserStorageKey('customRecipes')
    const customDishes = wx.getStorageSync(customKey) || []

    console.log('✅ 本地数据加载完成:', defaultDishes.length, '个默认菜品')
    return [...defaultDishes, ...customDishes]
  }
}

// 统一处理菜品数据格式
function _processDishes(dishes) {
  const processedDishes = (dishes || []).map(dish => {
    let englishType = dish.type
    if (dish.type === '荤菜' || dish.type === 'meat' || dish.type === '主菜') englishType = 'meat'
    else if (dish.type === '素菜' || dish.type === 'veg' || dish.type === '蔬菜') englishType = 'veg'
    else if (dish.type === '汤品' || dish.type === 'soup' || dish.type === '汤') englishType = 'soup'
    else {
      const name = dish.name || ''
      if (name.includes('汤') || name.includes('羹') || name.includes('粥')) {
        englishType = 'soup'
      } else if (name.includes('炒') || name.includes('蒸') || name.includes('煮') ||
                 name.includes('炖') || name.includes('烤') || name.includes('炸')) {
        englishType = 'meat'
      } else {
        englishType = 'veg'
      }
    }

    return {
      id: dish.id,
      name: dish.name,
      type: englishType,
      tags: Array.isArray(dish.tags) ? dish.tags :
            (dish.tags ? dish.tags.split(',').map(tag => tag.trim()) : []),
      image: dish.image || '',
      ingredientsAmounts: dish.ingredientsAmounts || '',
      step: dish.step || ''
    }
  })

  const typeStats = processedDishes.reduce((acc, dish) => {
    acc[dish.type] = (acc[dish.type] || 0) + 1
    return acc
  }, {})
  console.log('📊 类型统计:', typeStats)

  return processedDishes
}

function pickUnique(array, count, excludeSet) {
  const candidates = array.filter(x => !excludeSet.has(x.name))
  const result = []
  const pool = [...candidates]

  console.log(`🎲 选择菜品: 需要${count}个，从${candidates.length}个候选中选择`)

  while (result.length < count && pool.length) {
    const idx = Math.floor(Math.random() * pool.length)
    result.push(pool.splice(idx, 1)[0])
  }

  console.log(`✅ 实际选择了${result.length}个菜品`)

  return result
}

function applyMealBias(dishes, mealType) {
  console.log(`🍽️ 应用餐次偏好: ${mealType}, 输入菜品数: ${dishes.length}`)

  let filtered = dishes

  if (mealType === 'breakfast') {
    // 早餐推荐：优先选择素菜和清淡菜品
    filtered = dishes.filter(d => d.type === 'veg' ||
                                 (d.tags && d.tags.includes('清淡')) ||
                                 d.name.includes('汤'))
    console.log(`🌅 早餐过滤: ${filtered.length} 个菜品`)
  } else if (mealType === 'dinner') {
    // 晚餐推荐：荤素搭配，优先选择荤菜
    filtered = dishes
    console.log(`🌙 晚餐过滤: ${filtered.length} 个菜品`)
  } else {
    // 午餐和其他：正常推荐
    console.log(`☀️ 午餐过滤: ${filtered.length} 个菜品`)
  }

  return filtered
}

function ensureBalance(meats, vegs) {
  // 简单规则：若全川味，替换一个为清淡菜品
  const isAllSpicy = [...meats, ...vegs].every(d => d.tags && d.tags.includes('川味'))
    if (isAllSpicy) {
      const idx = meats.findIndex(d => d.tags && d.tags.includes('川味'))
      if (idx >= 0) {
        // 替换为清淡菜品，使用后端API返回的数据格式
        meats[idx] = {
          id: 999,
          name: '清蒸南瓜',
          type: 'veg',
          ingredientsAmounts: '南瓜: 适量',
          steps: '蒸熟即可',
          tags: '素,清淡',
          image: '',
          difficulty: '简单',
          cookTime: '15分钟',
          stepImages: '',
          tips: '选择成熟的南瓜，口感更甜',
          methods: '蒸',
          kcal: 50
        }
      }
    }
}

// 获取用户隔离的recentWindow key
function getRecentWindowKey() {
  const { getUserStorageKey } = require('./util')
  return getUserStorageKey('recentWindow')
}

// 最近推荐历史记录上限
const RECENT_LIMIT = 20

// 获取用户隔离的recentWindow
function getRecentWindow() {
  const key = getRecentWindowKey()
  return wx.getStorageSync(key) || []
}

// 保存用户隔离的recentWindow（带存储满容错）
function saveRecentWindow(recentWindow) {
  const key = getRecentWindowKey()
  try {
    wx.setStorageSync(key, recentWindow)
  } catch (e) {
    console.warn('⚠️ 存储已满，recentWindow 保存失败:', e.message || e)
    // 存储满时不影响核心推荐流程
  }
}

// 更新recentWindow（用户隔离）
function updateRecent(dishes) {
  const recentWindow = getRecentWindow()
  dishes.forEach(d => recentWindow.push(d.name))
  while (recentWindow.length > RECENT_LIMIT) recentWindow.shift()
  saveRecentWindow(recentWindow)
}

async function recommendPlans(params, externalAllDishes = null) {
  const { people = 2, meat = 2, veg = 2, soup = 1, mealType = 'lunch', selectedRecipe = null, userSelectedDishes = null } = params || {}
  const exclude = new Set(getRecentWindow())

  console.log('🎯 开始推荐算法，参数:', {meat, veg, soup, mealType, userSelectedDishes})

  // 获取所有菜品：优先使用外部传入的，避免重复请求
  let allDishes = externalAllDishes
  if (!allDishes || allDishes.length === 0) {
    allDishes = await getAllDishes()
  } else {
    console.log('📦 使用外部传入菜品数据:', allDishes.length, '条')
  }
  
  // 按类型分组菜品池
  const meatsPool = allDishes.filter(d => d.type === 'meat')
  const vegsPool = allDishes.filter(d => d.type === 'veg')
  const soupsPool = allDishes.filter(d => d.type === 'soup')

  console.log('🍖 菜品池统计:', {
    meats: meatsPool.length,
    vegs: vegsPool.length,
    soups: soupsPool.length,
    total: allDishes.length
  })

  // 优先使用用户手动选中的菜品
  let userDishes = userSelectedDishes || []
  if (selectedRecipe && selectedRecipe.selectedDishes && selectedRecipe.selectedDishes.length > 0) {
    // 如果有菜谱，也合并进来
    userDishes = [...userDishes, ...selectedRecipe.selectedDishes]
  }

  const plans = []
  for (let i = 0; i < 3; i++) {
    let meats, vegs, soups
    
    if (userDishes.length > 0) {
      // 优先使用用户选中的菜品，按类型取出
      const userMeats = userDishes.filter(d => d.type === 'meat' || d.type === '荤菜' || d.type === 'meat' || d.type === '主菜')
      const userVegs = userDishes.filter(d => d.type === 'veg' || d.type === '素菜' || d.type === '蔬菜')
      const userSoups = userDishes.filter(d => d.type === 'soup' || d.type === '汤品' || d.type === '汤')

      meats = [...userMeats]
      vegs = [...userVegs]
      soups = [...userSoups]
      
      // 差额部分：从菜品池中随机补充
      if (meats.length < meat) {
        const excludeNames = new Set([...exclude, ...meats.map(d => d.name)])
        const additional = pickUnique(meatsPool, meat - meats.length, excludeNames)
        meats = [...meats, ...additional]
      } else if (meats.length > meat) {
        meats = meats.slice(0, meat)
      }
      
      if (vegs.length < veg) {
        const excludeNames = new Set([...exclude, ...vegs.map(d => d.name)])
        const additional = pickUnique(vegsPool, veg - vegs.length, excludeNames)
        vegs = [...vegs, ...additional]
      } else if (vegs.length > veg) {
        vegs = vegs.slice(0, veg)
      }
      
      if (soups.length < soup) {
        const excludeNames = new Set([...exclude, ...soups.map(d => d.name)])
        const additional = pickUnique(soupsPool, soup - soups.length, excludeNames)
        soups = [...soups, ...additional]
      } else if (soups.length > soup) {
        soups = soups.slice(0, soup)
      }
    } else {
      // 正常推荐流程
      meats = pickUnique(meatsPool, meat, exclude)
      vegs = pickUnique(vegsPool, veg, exclude)
      soups = pickUnique(soupsPool, soup, exclude)
    }
    
    ensureBalance(meats, vegs)
    const dishes = [...meats, ...vegs, ...soups]
    if (dishes.length === 0) continue
    plans.push({ dishes })
  }
  console.log('🎯 推荐算法完成，最终方案数:', plans.length)

  if (plans.length > 0) {
    console.log('📋 第一套方案示例:', plans[0])
  }

  if (plans.length) updateRecent(plans.flatMap(p => p.dishes))
  return plans
}

module.exports = { recommendPlans, getAllDishes }


