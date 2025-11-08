// utils/dishes.js - 菜品数据管理

// 默认菜品库（可替换为API数据）
const DEFAULT_DISHES = [
  // 荤菜
  { name: '清炒西兰花', type: 'veg', calories: 120, protein: 5, tags: ['素', '清淡'] },
  { name: '凉拌黄瓜', type: 'veg', calories: 80, protein: 3, tags: ['素', '清淡'] },
  { name: '红烧鸡翅', type: 'meat', calories: 320, protein: 25, tags: ['荤', '家常'] },
  { name: '番茄炒蛋', type: 'meat', calories: 220, protein: 14, tags: ['荤', '家常'] },
  { name: '宫保鸡丁', type: 'meat', calories: 360, protein: 28, tags: ['荤', '川味'] },
  { name: '鱼香肉丝', type: 'meat', calories: 340, protein: 24, tags: ['荤', '川味'] },
  { name: '回锅肉', type: 'meat', calories: 380, protein: 22, tags: ['荤', '川味'] },
  { name: '麻婆豆腐', type: 'meat', calories: 180, protein: 12, tags: ['荤', '川味'] },
  { name: '糖醋排骨', type: 'meat', calories: 320, protein: 25, tags: ['荤', '家常'] },
  { name: '可乐鸡翅', type: 'meat', calories: 280, protein: 23, tags: ['荤', '家常'] },
  
  // 素菜
  { name: '蒜蓉菠菜', type: 'veg', calories: 100, protein: 4, tags: ['素', '清淡'] },
  { name: '清炒豆芽', type: 'veg', calories: 60, protein: 3, tags: ['素', '清淡'] },
  { name: '干煸四季豆', type: 'veg', calories: 140, protein: 6, tags: ['素', '川味'] },
  { name: '拍黄瓜', type: 'veg', calories: 70, protein: 2, tags: ['素', '清淡'] },
  { name: '醋溜白菜', type: 'veg', calories: 90, protein: 4, tags: ['素', '家常'] },
  
  // 汤品
  { name: '紫菜蛋花汤', type: 'soup', calories: 60, protein: 6, tags: ['汤', '清淡'] },
  { name: '西红柿牛腩汤', type: 'soup', calories: 190, protein: 16, tags: ['汤', '家常'] },
  { name: '玉米排骨汤', type: 'soup', calories: 210, protein: 18, tags: ['汤', '滋补'] },
  { name: '冬瓜排骨汤', type: 'soup', calories: 180, protein: 15, tags: ['汤', '清淡'] },
  { name: '西湖牛肉羹', type: 'soup', calories: 120, protein: 12, tags: ['汤', '家常'] }
]

// 获取默认菜品
function getDefaultDishes() {
  return DEFAULT_DISHES
}

// 搜索菜品
function searchDishes(keyword, type = null) {
  return DEFAULT_DISHES.filter(dish => {
    const matchKeyword = dish.name.includes(keyword)
    const matchType = !type || dish.type === type
    return matchKeyword && matchType
  })
}

// 添加自定义菜品
function addCustomDish(dish) {
  const customDishes = wx.getStorageSync('customDishes') || []
  customDishes.push(dish)
  wx.setStorageSync('customDishes', customDishes)
}

// 获取所有菜品（包括自定义）
function getAllDishes() {
  const defaultDishes = getDefaultDishes()
  const customDishes = wx.getStorageSync('customDishes') || []
  return [...defaultDishes, ...customDishes]
}

module.exports = {
  getDefaultDishes,
  searchDishes,
  addCustomDish,
  getAllDishes
}

