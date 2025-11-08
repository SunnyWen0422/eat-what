# 后端API接口规范

本文档定义了"吃什么"小程序的后端API接口，使用Java Spring Boot框架实现。

## 技术栈
- 框架：Spring Boot 2.x
- 数据库：MySQL 8.0
- ORM：MyBatis 或 JPA
- 跨域：Spring Web

## 数据模型

### Dish (菜品)
```java
public class Dish {
    private Long id;
    private String name;           // 菜品名称
    private String type;            // 类型：meat/veg/soup
    private Integer calories;       // 热量
    private Integer protein;        // 蛋白质含量
    private List<String> tags;     // 标签列表
    private Integer isCustom;      // 是否自定义：0-系统，1-用户
    private Long userId;           // 用户ID（自定义菜品）
    private Date createTime;       // 创建时间
}
```

### CustomRecipe (自定义菜谱)
```java
public class CustomRecipe {
    private Long id;
    private String name;           // 菜谱名称
    private Integer people;         // 适用人数
    private List<Long> dishIds;    // 菜品ID列表
    private Long userId;           // 用户ID
    private Date createTime;
}
```

### User (用户)
```java
public class User {
    private Long id;
    private String openId;         // 微信openId
    private String nickname;
    private String avatar;
    private Date registerTime;
}
```

## RESTful API 接口

### 1. 菜品管理接口

#### 1.1 获取所有菜品
**接口地址**: `GET /api/dishes`

**请求参数**:
```java
@RequestParam(required = false) String type  // 筛选类型：meat/veg/soup
@RequestParam(required = false) String keyword  // 搜索关键词
@RequestParam(required = false) Long userId  // 用户ID（获取用户自定义菜品）
```

**返回数据**:
```java
@GetMapping("/dishes")
public ResponseEntity<List<Dish>> getDishes(
    @RequestParam(required = false) String type,
    @RequestParam(required = false) String keyword,
    @RequestParam(required = false) Long userId
) {
    // 实现逻辑
    return ResponseEntity.ok(dishService.getDishes(type, keyword, userId));
}
```

**响应示例**:
```json
[
  {
    "id": 1,
    "name": "番茄炒蛋",
    "type": "meat",
    "calories": 220,
    "protein": 14,
    "tags": ["荤", "家常"],
    "isCustom": 0
  }
]
```

#### 1.2 搜索菜品
**接口地址**: `GET /api/dishes/search`

**请求参数**:
```java
@RequestParam String keyword
@RequestParam(required = false) String type
```

**Controller**:
```java
@GetMapping("/dishes/search")
public ResponseEntity<List<Dish>> searchDishes(
    @RequestParam String keyword,
    @RequestParam(required = false) String type
) {
    List<Dish> dishes = dishService.searchDishes(keyword, type);
    return ResponseEntity.ok(dishes);
}
```

#### 1.3 创建自定义菜品
**接口地址**: `POST /api/dishes/custom`

**请求Body**:
```java
@PostMapping("/dishes/custom")
public ResponseEntity<Dish> createCustomDish(
    @RequestBody Dish dish,
    HttpServletRequest request
) {
    Long userId = getUserIdFromSession(request);
    dish.setUserId(userId);
    dish.setIsCustom(1);
    Dish created = dishService.createDish(dish);
    return ResponseEntity.ok(created);
}
```

**请求示例**:
```json
{
  "name": "我的拿手菜",
  "type": "meat",
  "calories": 250,
  "protein": 20,
  "tags": ["荤", "我的菜"]
}
```

### 2. 菜谱管理接口

#### 2.1 保存自定义菜谱
**接口地址**: `POST /api/recipes`

**请求Body**:
```java
@PostMapping("/recipes")
public ResponseEntity<CustomRecipe> saveRecipe(
    @RequestBody CustomRecipe recipe,
    HttpServletRequest request
) {
    Long userId = getUserIdFromSession(request);
    recipe.setUserId(userId);
    CustomRecipe saved = recipeService.saveRecipe(recipe);
    return ResponseEntity.ok(saved);
}
```

**请求示例**:
```json
{
  "name": "我的菜谱-3人餐",
  "people": 3,
  "dishIds": [1, 2, 3, 4, 5]
}
```

#### 2.2 获取用户所有菜谱
**接口地址**: `GET /api/recipes`

**Controller**:
```java
@GetMapping("/recipes")
public ResponseEntity<List<CustomRecipe>> getMyRecipes(HttpServletRequest request) {
    Long userId = getUserIdFromSession(request);
    List<CustomRecipe> recipes = recipeService.getRecipesByUserId(userId);
    return ResponseEntity.ok(recipes);
}
```

#### 2.3 删除菜谱
**接口地址**: `DELETE /api/recipes/{id}`

**Controller**:
```java
@DeleteMapping("/recipes/{id}")
public ResponseEntity<Void> deleteRecipe(@PathVariable Long id, HttpServletRequest request) {
    Long userId = getUserIdFromSession(request);
    recipeService.deleteRecipe(id, userId);
    return ResponseEntity.ok().build();
}
```

### 3. 推荐服务接口

#### 3.1 生成推荐菜谱
**接口地址**: `POST /api/recommend`

**请求Body**:
```java
@PostMapping("/recommend")
public ResponseEntity<List<RecommendResult>> getRecommendations(
    @RequestBody RecommendRequest request,
    HttpServletRequest httpRequest
) {
    Long userId = getUserIdFromSession(httpRequest);
    List<RecommendResult> recommendations = recommendService.generateRecommendations(
        request, userId
    );
    return ResponseEntity.ok(recommendations);
}
```

**请求示例**:
```json
{
  "people": 3,
  "meat": 2,
  "veg": 2,
  "soup": 1,
  "mealType": "lunch",
  "excludeDishes": [1, 2],
  "preferredRecipes": [5, 6]
}
```

**响应示例**:
```json
[
  {
    "id": 1,
    "dishes": [
      {"id": 3, "name": "宫保鸡丁", "type": "meat"},
      {"id": 7, "name": "清炒豆芽", "type": "veg"},
      {"id": 11, "name": "紫菜蛋花汤", "type": "soup"}
    ],
    "totalCalories": 420,
    "totalProtein": 44
  }
]
```

### 4. 用户接口

#### 4.1 用户登录/注册
**接口地址**: `POST /api/user/login`

**请求Body**:
```java
@PostMapping("/user/login")
public ResponseEntity<User> login(@RequestBody LoginRequest request) {
    User user = userService.getOrCreateUser(request.getOpenId());
    // 设置session
    HttpSession session = httpRequest.getSession();
    session.setAttribute("userId", user.getId());
    return ResponseEntity.ok(user);
}
```

**请求示例**:
```json
{
  "code": "wx_code_from_miniprogram",
  "nickname": "用户昵称",
  "avatar": "头像URL"
}
```

## Service层实现示例

### DishService
```java
@Service
public class DishService {
    
    @Autowired
    private DishMapper dishMapper;
    
    public List<Dish> getDishes(String type, String keyword, Long userId) {
        return dishMapper.selectDishes(type, keyword, userId);
    }
    
    public Dish createDish(Dish dish) {
        dish.setCreateTime(new Date());
        dishMapper.insert(dish);
        return dish;
    }
    
    public List<Dish> searchDishes(String keyword, String type) {
        return dishMapper.searchDishes(keyword, type);
    }
}
```

### RecommendService
```java
@Service
public class RecommendService {
    
    @Autowired
    private DishService dishService;
    
    @Autowired
    private RecipeService recipeService;
    
    public List<RecommendResult> generateRecommendations(
        RecommendRequest request, 
        Long userId
    ) {
        // 1. 获取所有可用菜品（包括用户自定义）
        List<Dish> allDishes = dishService.getDishes(null, null, userId);
        
        // 2. 根据参数筛选
        List<Dish> meats = filterByType(allDishes, "meat", request.getMeat());
        List<Dish> vegs = filterByType(allDishes, "veg", request.getVeg());
        List<Dish> soups = filterByType(allDishes, "soup", request.getSoup());
        
        // 3. 生成3个推荐方案
        List<RecommendResult> results = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            RecommendResult result = RecommendResult.builder()
                .dishes(selectRandomly(meats, vegs, soups, request))
                .build();
            results.add(result);
        }
        
        return results;
    }
}
```

## 数据库设计

### dishes表
```sql
CREATE TABLE dishes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL COMMENT 'meat/veg/soup',
    calories INT DEFAULT 0,
    protein INT DEFAULT 0,
    tags VARCHAR(200) COMMENT '逗号分隔',
    is_custom TINYINT DEFAULT 0 COMMENT '0-系统，1-用户自定义',
    user_id BIGINT,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type (type),
    INDEX idx_user (user_id),
    INDEX idx_name (name)
);
```

### custom_recipes表
```sql
CREATE TABLE custom_recipes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    people INT NOT NULL,
    user_id BIGINT NOT NULL,
    dish_ids TEXT COMMENT '菜品ID列表，JSON格式',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id)
);
```

### users表
```sql
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    open_id VARCHAR(100) UNIQUE NOT NULL,
    nickname VARCHAR(50),
    avatar VARCHAR(200),
    register_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_openid (open_id)
);
```

## 全局配置

### application.yml
```yaml
server:
  port: 8080
  servlet:
    context-path: /api

spring:
  datasource:
    url: jdbc:mysql://localhost:3306/eatwhat?useUnicode=true&characterEncoding=utf8
    username: root
    password: root
    driver-class-name: com.mysql.cj.jdbc.Driver
  
  jackson:
    date-format: yyyy-MM-dd HH:mm:ss
    time-zone: GMT+8

mybatis:
  type-aliases-package: com.eatwhat.entity
  mapper-locations: classpath:mapper/*.xml
```

### CorsConfig.java
```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
            .allowedOrigins("*")
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .allowedHeaders("*")
            .maxAge(3600);
    }
}
```

## 接口调用示例

### 小程序端调用
```javascript
// 获取菜品
wx.request({
  url: 'https://your-api.com/api/dishes?type=meat',
  method: 'GET',
  success: (res) => {
    console.log(res.data)
  }
})

// 创建自定义菜品
wx.request({
  url: 'https://your-api.com/api/dishes/custom',
  method: 'POST',
  data: {
    name: '我的拿手菜',
    type: 'meat',
    calories: 250,
    protein: 20,
    tags: ['荤', '我的菜']
  },
  success: (res) => {
    console.log(res.data)
  }
})
```

