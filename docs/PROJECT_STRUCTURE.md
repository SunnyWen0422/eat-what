# 项目结构说明

本文档详细说明"吃什么"小程序项目的完整结构，包括前端、后端和数据库。

---

## 📁 整体结构

```
吃什么项目/
├── 前端（微信小程序）          # 项目根目录
├── 后端（Spring Boot）         # backend/ 文件夹
└── 数据库（MySQL）             # food数据库
```

---

## 🎨 前端结构（微信小程序）

```
吃什么/
├── pages/                      # 页面目录
│   ├── index/                  # 主页 - 参数设置
│   │   ├── index.js           # 页面逻辑
│   │   ├── index.wxml         # 页面结构
│   │   ├── index.wxss         # 页面样式
│   │   └── index.json         # 页面配置
│   │
│   ├── result/                 # 结果页 - 推荐展示
│   │   ├── result.js
│   │   ├── result.wxml
│   │   ├── result.wxss
│   │   └── result.json
│   │
│   ├── customize/              # 定制页 - 自定义菜谱
│   │   ├── customize.js
│   │   ├── customize.wxml
│   │   ├── customize.wxss
│   │   └── customize.json
│   │
│   └── logs/                   # 日志页
│       ├── logs.js
│       ├── logs.wxml
│       ├── logs.wxss
│       └── logs.json
│
├── utils/                      # 工具函数
│   ├── api.js                 # 🆕 后端API接口调用
│   ├── config.js              # 🆕 全局配置
│   ├── dishes.js              # 菜品数据管理
│   ├── recommend.js           # 推荐算法
│   └── util.js                # 通用工具函数
│
├── docs/                       # 文档目录
│   ├── DATABASE_INTEGRATION.md # 🆕 数据库接入方案
│   ├── DEPLOYMENT_GUIDE.md     # 🆕 部署指南
│   ├── PROJECT_STRUCTURE.md    # 🆕 本文件
│   ├── API_SPEC.md            # API接口规范
│   ├── FEATURE_SUMMARY.md     # 功能总结
│   └── RECIPE_OPTIMIZATION.md # 菜谱优化说明
│
├── app.js                      # 小程序入口文件
├── app.json                    # 小程序全局配置
├── app.wxss                    # 全局样式
├── project.config.json         # 项目配置
├── sitemap.json               # 搜索优化配置
├── README.md                   # 项目说明
└── QUICK_START.md             # 🆕 快速开始指南

🆕 = 新增文件
```

---

## ⚙️ 后端结构（Spring Boot）

```
backend/
├── src/
│   ├── main/
│   │   ├── java/com/eatwhat/          # Java源代码
│   │   │   ├── EatWhatApplication.java    # 启动类
│   │   │   │
│   │   │   ├── controller/                # 控制器层（处理HTTP请求）
│   │   │   │   └── DishController.java    # 菜品接口控制器
│   │   │   │
│   │   │   ├── service/                   # 服务层（业务逻辑）
│   │   │   │   └── DishService.java       # 菜品业务逻辑
│   │   │   │
│   │   │   ├── mapper/                    # 数据访问层（MyBatis）
│   │   │   │   ├── DishMapper.java        # 菜品数据访问
│   │   │   │   ├── UserMapper.java        # 用户数据访问
│   │   │   │   └── RecipeMapper.java      # 菜谱数据访问
│   │   │   │
│   │   │   ├── entity/                    # 实体类（数据模型）
│   │   │   │   ├── Dish.java              # 菜品实体
│   │   │   │   ├── User.java              # 用户实体
│   │   │   │   └── CustomRecipe.java      # 菜谱实体
│   │   │   │
│   │   │   └── config/                    # 配置类
│   │   │       └── CorsConfig.java        # 跨域配置
│   │   │
│   │   └── resources/                     # 资源文件
│   │       └── application.yml            # Spring Boot配置
│   │
│   └── test/                              # 测试代码
│       └── java/com/eatwhat/
│
├── init_database.sql              # 数据库初始化脚本 ⭐
├── pom.xml                        # Maven项目配置
└── README.md                      # 后端说明文档
```

---

## 🗄️ 数据库结构

### 数据库：food

```
food数据库/
├── food表                  # 菜品表（主表，您已有）
│   ├── ID (主键)
│   ├── NAME               # 菜品名称
│   ├── METERIAL          # 食材
│   ├── CALORIE           # 卡路里
│   ├── STEP              # 步骤
│   ├── TYPE 🆕           # 类型（meat/veg/soup）
│   ├── PROTEIN 🆕        # 蛋白质
│   ├── TAGS 🆕           # 标签
│   ├── IS_CUSTOM 🆕      # 是否自定义
│   ├── USER_ID 🆕        # 用户ID
│   └── CREATE_TIME 🆕    # 创建时间
│
├── users表 🆕             # 用户表
│   ├── id (主键)
│   ├── open_id           # 微信openId
│   ├── nickname          # 昵称
│   ├── avatar            # 头像
│   └── register_time     # 注册时间
│
└── custom_recipes表 🆕    # 用户菜谱表
    ├── id (主键)
    ├── name              # 菜谱名称
    ├── people            # 适用人数
    ├── user_id           # 用户ID
    ├── dish_ids          # 菜品ID列表（JSON）
    ├── meal_type         # 餐次类型
    └── create_time       # 创建时间
```

---

## 🔄 数据流程

### 1. 获取菜品列表

```
┌─────────────┐
│ 微信小程序   │
│ customize.js│
└──────┬──────┘
       │ 1. 调用 api.getDishes()
       ▼
┌─────────────┐
│ utils/api.js│
│             │
└──────┬──────┘
       │ 2. wx.request() 发送HTTP请求
       │    GET /api/dishes
       ▼
┌─────────────────────┐
│ Spring Boot         │
│ DishController      │
│   ↓                 │
│ DishService         │
│   ↓                 │
│ DishMapper          │
└──────┬──────────────┘
       │ 3. 执行SQL查询
       │    SELECT * FROM food
       ▼
┌─────────────┐
│ MySQL       │
│ food数据库   │
└──────┬──────┘
       │ 4. 返回数据
       │    [{id:1, name:'宫保鸡丁',...}]
       ▼
   (返回路径相反)
       ▼
┌─────────────┐
│ 小程序展示   │
│ 菜品列表     │
└─────────────┘
```

### 2. 创建自定义菜品

```
用户输入菜品名称
    ↓
customize.js → addCustomDish()
    ↓
api.createCustomDish(dish)
    ↓
POST /api/dishes/custom
    ↓
DishController.createCustomDish()
    ↓
DishService.createDish()
    ↓
DishMapper.insert()
    ↓
INSERT INTO food (...)
    ↓
返回新创建的菜品
    ↓
小程序列表更新
```

---

## 🎯 核心文件说明

### 前端核心文件

#### 1. `utils/api.js` 🆕
**作用：** 封装所有后端API调用

**核心方法：**
- `getDishes()` - 获取菜品列表
- `searchDishes()` - 搜索菜品
- `createCustomDish()` - 创建自定义菜品

**使用示例：**
```javascript
const api = require('../../utils/api')
api.getDishes({ type: 'meat' }).then(dishes => {
  console.log(dishes)
})
```

#### 2. `utils/config.js` 🆕
**作用：** 全局配置管理

**核心配置：**
- `USE_BACKEND_API` - 是否使用后端API（true/false）
- `API_BASE_URL` - API地址
- 业务配置（人数范围、菜品数量等）

#### 3. `pages/customize/customize.js`
**作用：** 定制菜谱页面逻辑

**核心功能：**
- 加载菜品（本地/API）
- 搜索菜品
- 添加自定义菜品
- 保存菜谱

#### 4. `utils/recommend.js`
**作用：** 推荐算法

**核心功能：**
- 根据参数生成推荐方案
- 避免重复推荐
- 营养均衡

---

### 后端核心文件

#### 1. `EatWhatApplication.java`
**作用：** 启动类

**功能：**
- 启动Spring Boot应用
- 扫描组件
- 初始化配置

#### 2. `controller/DishController.java`
**作用：** 菜品API接口

**提供接口：**
- `GET /api/dishes` - 获取菜品列表
- `GET /api/dishes/search` - 搜索菜品
- `POST /api/dishes/custom` - 创建自定义菜品
- `GET /api/dishes/{id}` - 获取单个菜品

#### 3. `mapper/DishMapper.java`
**作用：** 数据访问层

**核心方法：**
- `selectDishes()` - 查询菜品
- `insert()` - 插入菜品
- `searchDishes()` - 搜索菜品

#### 4. `entity/Dish.java`
**作用：** 菜品实体类

**字段映射：**
```
数据库字段     Java字段
ID         →  id
NAME       →  name
TYPE       →  type
CALORIE    →  calories
PROTEIN    →  protein
METERIAL   →  material
STEP       →  steps
TAGS       →  tagsString
```

#### 5. `application.yml`
**作用：** Spring Boot配置

**核心配置：**
- 数据库连接信息
- MyBatis配置
- 端口配置

---

## 🔧 配置文件说明

### 1. 小程序配置

#### `app.json` - 全局配置
```json
{
  "pages": [
    "pages/index/index",
    "pages/result/result",
    "pages/customize/customize"
  ],
  "window": {
    "navigationBarTitleText": "吃什么"
  }
}
```

#### `project.config.json` - 项目配置
- appid：小程序ID
- projectname：项目名称

### 2. 后端配置

#### `application.yml` - 应用配置
```yaml
server:
  port: 8080

spring:
  datasource:
    url: jdbc:mysql://127.0.0.1:3306/food
    username: root
    password: Sunny418
```

#### `pom.xml` - Maven依赖
- Spring Boot 2.7.14
- MyBatis 2.3.1
- MySQL驱动 8.0.33

---

## 📊 技术栈总结

### 前端
- 微信小程序框架
- JavaScript ES6
- WXML（类HTML）
- WXSS（类CSS）

### 后端
- Java 8
- Spring Boot 2.7.14
- MyBatis 2.3.1
- Maven

### 数据库
- MySQL 8.0
- InnoDB引擎
- UTF8MB4字符集

---

## 🚀 开发流程

### 1. 添加新的API接口

**步骤：**
1. 在 `Mapper` 中定义SQL方法
2. 在 `Service` 中实现业务逻辑
3. 在 `Controller` 中暴露HTTP接口
4. 在 `utils/api.js` 中添加调用方法
5. 在页面中使用

**示例：** 添加"删除菜品"接口

```java
// 1. DishMapper.java
@Delete("DELETE FROM food WHERE ID = #{id}")
int delete(@Param("id") Long id);

// 2. DishService.java
public void deleteDish(Long id) {
    dishMapper.delete(id);
}

// 3. DishController.java
@DeleteMapping("/{id}")
public ResponseEntity<Void> deleteDish(@PathVariable Long id) {
    dishService.deleteDish(id);
    return ResponseEntity.ok().build();
}
```

```javascript
// 4. utils/api.js
function deleteDish(id) {
  return request(`/dishes/${id}`, 'DELETE')
}

// 5. 页面中使用
api.deleteDish(dishId).then(() => {
  wx.showToast({ title: '删除成功' })
})
```

### 2. 添加新页面

**步骤：**
1. 在 `pages/` 下创建文件夹
2. 创建 `.js`, `.wxml`, `.wxss`, `.json` 文件
3. 在 `app.json` 中注册页面
4. 实现页面逻辑

---

## 📝 代码规范

### 命名规范

**前端：**
- 文件名：小写，连字符（如 `custom-dish.js`）
- 变量：驼峰命名（如 `dishList`）
- 方法：on开头事件（如 `onSelectDish`）

**后端：**
- 类名：大驼峰（如 `DishController`）
- 方法：小驼峰（如 `getDishes`）
- 包名：小写（如 `com.eatwhat.service`）

### 注释规范

**Java：**
```java
/**
 * 获取菜品列表
 * @param type 菜品类型
 * @return 菜品列表
 */
public List<Dish> getDishes(String type) {
    // ...
}
```

**JavaScript：**
```javascript
/**
 * 加载菜品数据
 * @param {String} type - 菜品类型
 */
loadDishes(type) {
  // ...
}
```

---

## 🔍 调试技巧

### 前端调试

1. **微信开发者工具**
   - Console：查看日志
   - Network：查看网络请求
   - AppData：查看页面数据

2. **常用日志**
```javascript
console.log('调试信息', data)
console.error('错误信息', err)
```

### 后端调试

1. **IDEA调试**
   - 设置断点
   - Debug模式运行
   - 查看变量值

2. **日志输出**
```java
System.out.println("调试信息");
log.debug("调试日志", data);
```

3. **SQL日志**
在 `application.yml` 中开启：
```yaml
mybatis:
  configuration:
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl
```

---

## 📚 扩展阅读

- [微信小程序官方文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [Spring Boot官方文档](https://spring.io/projects/spring-boot)
- [MyBatis官方文档](https://mybatis.org/mybatis-3/)
- [MySQL官方文档](https://dev.mysql.com/doc/)

---

**文档版本：** v1.0  
**最后更新：** 2024年

