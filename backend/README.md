# 吃什么小程序后端服务

## 项目说明
这是"吃什么"微信小程序的后端API服务，使用Spring Boot + MyBatis + MySQL构建。

## 技术栈
- Java 8
- Spring Boot 2.7.14
- MyBatis 2.3.1
- MySQL 8.0
- Maven

## 数据库配置
```yaml
数据库地址: 127.0.0.1:3306
数据库名: food
用户名: root
密码: Sunny418
```

## 快速开始

### 1. 准备数据库
在MySQL中执行 `../docs/DATABASE_INTEGRATION.md` 中的SQL脚本，创建必要的表结构。

### 2. 安装依赖
```bash
mvn clean install
```

### 3. 启动服务
```bash
mvn spring-boot:run
```

或者使用IDE（IDEA/Eclipse）直接运行 `EatWhatApplication.java`

### 4. 测试接口
启动成功后，访问：
```
http://localhost:8080/api/dishes
```

## API接口文档

### 菜品相关接口

#### 1. 获取所有菜品
```http
GET /api/dishes?type=meat&keyword=鸡
```

**参数说明：**
- `type` (可选): meat/veg/soup
- `keyword` (可选): 搜索关键词
- `userId` (可选): 用户ID

**响应示例：**
```json
[
  {
    "id": 1,
    "name": "宫保鸡丁",
    "type": "meat",
    "calories": 360,
    "protein": 28,
    "tags": ["荤", "川味"],
    "isCustom": 0
  }
]
```

#### 2. 搜索菜品
```http
GET /api/dishes/search?keyword=鸡&type=meat
```

#### 3. 创建自定义菜品
```http
POST /api/dishes/custom
Content-Type: application/json

{
  "name": "我的拿手菜",
  "type": "meat",
  "calories": 250,
  "protein": 20,
  "tags": ["荤", "我的菜"],
  "material": "鸡肉,辣椒",
  "steps": "1.切块 2.翻炒"
}
```

#### 4. 根据ID获取菜品
```http
GET /api/dishes/{id}
```

## 项目结构
```
backend/
├── src/main/java/com/eatwhat/
│   ├── EatWhatApplication.java      # 启动类
│   ├── config/
│   │   └── CorsConfig.java          # 跨域配置
│   ├── controller/
│   │   └── DishController.java      # 菜品控制器
│   ├── service/
│   │   └── DishService.java         # 菜品服务
│   ├── mapper/
│   │   ├── DishMapper.java          # 菜品数据访问
│   │   ├── UserMapper.java          # 用户数据访问
│   │   └── RecipeMapper.java        # 菜谱数据访问
│   └── entity/
│       ├── Dish.java                # 菜品实体
│       ├── User.java                # 用户实体
│       └── CustomRecipe.java        # 菜谱实体
├── src/main/resources/
│   └── application.yml              # 配置文件
├── pom.xml                          # Maven配置
└── README.md
```

## 数据库表映射

### food表 → Dish实体
```
ID         → id
NAME       → name
TYPE       → type
CALORIE    → calories
PROTEIN    → protein
METERIAL   → material
STEP       → steps
TAGS       → tagsString (后端) / tags (前端数组)
IS_CUSTOM  → isCustom
USER_ID    → userId
CREATE_TIME→ createTime
```

## 开发注意事项

1. **字段映射**: MyBatis自动将下划线命名转换为驼峰命名
2. **跨域配置**: 已配置允许所有来源，生产环境需限制
3. **用户认证**: 当前版本未实现，需要集成微信登录
4. **日志级别**: application.yml中配置为debug，生产环境改为info

## 下一步开发
- [ ] 实现用户登录接口
- [ ] 实现菜谱管理接口
- [ ] 实现推荐算法接口
- [ ] 添加接口鉴权
- [ ] 部署到服务器

## 常见问题

### Q: 启动报错 "Access denied for user 'root'"
A: 检查 `application.yml` 中的数据库密码是否正确

### Q: 返回数据为空
A: 检查数据库中是否已执行SQL脚本并导入数据

### Q: 小程序无法调用接口
A: 检查跨域配置，确保服务器端口8080可访问

## 联系方式
如有问题，请查看项目文档或提交Issue。

