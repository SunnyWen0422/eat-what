// 获取所有菜品（包括自定义）
function getAllDishes() {
  const { getDefaultDishes } = require('./dishes')
  const defaultDishes = getDefaultDishes()
  const customDishes = wx.getStorageSync('customRecipes') || []
  return [...defaultDishes, ...customDishes]
}

function pickUnique(array, count, excludeSet) {
  const candidates = array.filter(x => !excludeSet.has(x.name))
  const result = []
  const pool = [...candidates]
  while (result.length < count && pool.length) {
    const idx = Math.floor(Math.random() * pool.length)
    result.push(pool.splice(idx, 1)[0])
  }
  return result
}

function applyMealBias(dishes, mealType) {
  if (mealType === 'breakfast') {
    return dishes.filter(d => d.calories <= 260)
  }
  if (mealType === 'dinner') {
    return dishes
  }
  return dishes
}

function ensureBalance(meats, vegs) {
  // 简单规则：若全川味，替换一个为清淡
  const isAllSpicy = [...meats, ...vegs].every(d => d.tags.includes('川味'))
  if (isAllSpicy) {
    const idx = meats.findIndex(d => d.tags.includes('川味'))
    if (idx >= 0) meats[idx] = { name: '清蒸南瓜', type: 'veg', calories: 120, protein: 3, tags: ['素', '清淡'] }
  }
}

// 简单的多样性：维持一个最近窗口，避免重复
const recentWindow = []
const RECENT_LIMIT = 12

function updateRecent(dishes) {
  dishes.forEach(d => recentWindow.push(d.name))
  while (recentWindow.length > RECENT_LIMIT) recentWindow.shift()
}

function recommendPlans(params) {
  const { people = 2, meat = 2, veg = 2, soup = 1, mealType = 'lunch', selectedRecipe = null } = params || {}
  const exclude = new Set(recentWindow)

  // 获取所有菜品（包括系统默认和用户自定义）
  const allDishes = getAllDishes()
  
  const meatsPool = applyMealBias(allDishes.filter(d => d.type === 'meat'), mealType)
  const vegsPool = applyMealBias(allDishes.filter(d => d.type === 'veg'), mealType)
  const soupsPool = applyMealBias(allDishes.filter(d => d.type === 'soup'), mealType)

  // 如果选择了菜谱，优先使用菜谱中的菜品
  let recipeDishes = []
  if (selectedRecipe && selectedRecipe.selectedDishes && selectedRecipe.selectedDishes.length > 0) {
    recipeDishes = selectedRecipe.selectedDishes
  }

  const plans = []
  for (let i = 0; i < 3; i++) {
    let meats, vegs, soups
    
    if (recipeDishes.length > 0) {
      // 使用菜谱中的菜品
      meats = recipeDishes.filter(d => d.type === 'meat').slice(0, meat)
      vegs = recipeDishes.filter(d => d.type === 'veg').slice(0, veg)
      soups = recipeDishes.filter(d => d.type === 'soup').slice(0, soup)
      
      // 如果菜谱中的菜品不够，从菜品池中补充
      if (meats.length < meat) {
        const additional = pickUnique(meatsPool, meat - meats.length, new Set([...exclude, ...meats.map(d => d.name)]))
        meats = [...meats, ...additional]
      }
      if (vegs.length < veg) {
        const additional = pickUnique(vegsPool, veg - vegs.length, new Set([...exclude, ...vegs.map(d => d.name)]))
        vegs = [...vegs, ...additional]
      }
      if (soups.length < soup) {
        const additional = pickUnique(soupsPool, soup - soups.length, new Set([...exclude, ...soups.map(d => d.name)]))
        soups = [...soups, ...additional]
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
  if (plans.length) updateRecent(plans.flatMap(p => p.dishes))
  return plans
}

module.exports = { recommendPlans, getAllDishes }


