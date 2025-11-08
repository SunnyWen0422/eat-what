# 定制菜谱功能总结

## 功能概述

新增了"定制菜谱"功能，允许用户自定义菜品并创建个人菜谱，这些自定义菜品会被纳入推荐系统中。

## 已实现的功能

### 1. 主页修改（pages/index/）

#### 新增按钮
- 在原有"今天吃什么"按钮下方增加了"定制菜谱"按钮
- 点击后跳转到自定义菜谱页面

#### 代码变更
```12:14:pages/index/index.wxml
<button type="default" size="default" bindtap="onCustomize" style="margin-top: 12px;">定制菜谱</button>
```

```71:76:pages/index/index.js
// 跳转到定制菜谱页面
onCustomize() {
  wx.vibrateShort({ type: 'light' })
  wx.navigateTo({ url: '/pages/customize/customize' })
}
```

### 2. 自定义菜谱页面（pages/customize/）

新创建的页面包含以下功能：

#### 左侧分类菜单
- **人数**：设置用餐人数（1-10人）
- **荤菜**：浏览和搜索荤菜
- **素菜**：浏览和搜索素菜
- **汤品**：浏览和搜索汤品
- **自定义**：管理用户自定义的菜品

#### 右侧内容区域
- **人数设置**：通过滑块调整用餐人数
- **菜品搜索**：实时搜索菜品名称
  - 不输入关键词时显示所有默认菜品
  - 输入关键词后显示搜索结果
  - 搜索结果包括系统菜品和用户自定义菜品
- **菜品管理**：
  - 查看菜品详情（名称、标签、热量、蛋白质）
  - 选择菜品添加到菜谱
  - 自定义新菜品

#### 核心方法
1. **搜索功能**：`onSearchInput()` - 实时搜索菜品
2. **自定义菜品**：`addCustomDish()` - 添加用户自定义菜品
3. **保存菜谱**：`onSaveRecipe()` - 保存完整的菜谱配置
4. **API调用**：`callSaveDishAPI()` - 与后端API交互（待实现）

### 3. 菜品数据管理（utils/dishes.js）

新创建的工具文件，提供菜品数据管理功能：

- `getDefaultDishes()` - 获取系统默认菜品（已扩展为15+道菜品）
- `searchDishes(keyword, type)` - 搜索菜品
- `addCustomDish(dish)` - 添加自定义菜品到本地存储
- `getAllDishes()` - 获取所有菜品（包括自定义）

### 4. 推荐算法升级（utils/recommend.js）

更新了推荐算法以支持自定义菜品：

```48:57:utils/recommend.js
function recommendPlans(params) {
  const { people = 2, meat = 2, veg = 2, soup = 1, mealType = 'lunch' } = params || {}
  const exclude = new Set(recentWindow)

  // 获取所有菜品（包括系统默认和用户自定义）
  const allDishes = getAllDishes()
  
  const meatsPool = applyMealBias(allDishes.filter(d => d.type === 'meat'), mealType)
  const vegsPool = applyMealBias(allDishes.filter(d => d.type === 'veg'), mealType)
  const soupsPool = applyMealBias(allDishes.filter(d => d.type === 'soup'), mealType)
```

**改进点**：
- 推荐时会考虑用户自定义的菜品
- 自定义菜品与系统菜品同等参与推荐
- 保持了原有的多样性逻辑（避免重复）

### 5. 后端API规范（docs/API_SPEC.md）

设计了完整的Java后端API规范，包括：

#### 数据模型
- `Dish` - 菜品实体
- `CustomRecipe` - 自定义菜谱实体
- `User` - 用户实体

#### RESTful API接口

**菜品管理**：
- `GET /api/dishes` - 获取所有菜品
- `GET /api/dishes/search` - 搜索菜品
- `POST /api/dishes/custom` - 创建自定义菜品

**菜谱管理**：
- `POST /api/recipes` - 保存自定义菜谱
- `GET /api/recipes` - 获取用户所有菜谱
- `DELETE /api/recipes/{id}` - 删除菜谱

**推荐服务**：
- `POST /api/recommend` - 生成推荐菜谱

**用户服务**：
- `POST /api/user/login` - 用户登录/注册

#### 技术实现
- Spring Boot框架
- MyBatis/JPA ORM
- MySQL数据库
- CORS跨域配置
- 详细的数据库表结构设计

## 使用流程

### 用户操作流程
1. 用户在主页点击"定制菜谱"按钮
2. 进入自定义菜谱页面
3. 设置用餐人数（如3人）
4. 选择分类（荤菜/素菜/汤品）
5. 使用搜索功能查找菜品，或添加自定义菜品
6. 选择需要的菜品
7. 保存菜谱
8. 返回主页，自定义菜谱会参与推荐

### 自定义菜品流程
1. 在荤菜/素菜/汤品页面点击"+ 自定义"按钮
2. 输入菜品名称
3. 自动添加到本地存储
4. 调用后端API保存到服务器（待实现）
5. 自定义菜品出现在搜索结果中
6. 可在"自定义"分类中查看所有自定义菜品

## 技术特点

### 前端实现
- 使用微信小程序原生框架
- 触觉反馈增强用户体验
- 响应式布局，适配不同屏幕
- 本地存储管理自定义数据

### 数据管理
- 本地存储（wx.setStorageSync）用于临时数据
- 后端API用于持久化存储
- 数据结构设计兼顾扩展性

### 推荐算法
- 整合系统菜品和自定义菜品
- 保持多样性避免重复
- 支持餐次偏好（早餐/午餐/晚餐）
- 智能平衡营养搭配

## 待实现功能

### 后端对接
目前小程序端已经实现了调用后端API的方法（`callSaveDishAPI`），需要：
- 配置实际的API地址
- 实现网络请求逻辑
- 处理认证和会话管理

### 菜谱选择
可以在主页增加"选择我的菜谱"功能，让用户：
- 从已保存的菜谱中选择
- 快速应用之前的配置

### 高级搜索
- 按标签筛选
- 按热量范围筛选
- 按营养配比筛选

## 文件结构

```
├── pages/
│   ├── index/
│   │   ├── index.js (已修改)
│   │   ├── index.wxml (已修改)
│   └── customize/
│       ├── customize.js (新建)
│       ├── customize.json (新建)
│       ├── customize.wxml (新建)
│       └── customize.wxss (新建)
├── utils/
│   ├── dishes.js (新建)
│   └── recommend.js (已修改)
├── docs/
│   ├── API_SPEC.md (新建)
│   └── FEATURE_SUMMARY.md (新建)
└── app.json (已修改)
```

## 总结

定制菜谱功能完整实现了用户需求：
1. ✅ 在主页增加定制菜谱按钮
2. ✅ 左侧分类菜单（人数、菜品、自定义）
3. ✅ 右侧内容展示
4. ✅ 菜品搜索功能
5. ✅ 自定义菜品功能
6. ✅ 自定义菜谱参与推荐
7. ✅ 后端API接口设计
8. ✅ 合理的数据结构和命名

功能设计合理，命名清晰，接口设计具有良好的容纳度和扩展性。

