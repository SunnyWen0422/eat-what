# 🚀 快速开始 - MySQL数据库接入指南

本指南帮助您快速将小程序接入已有的MySQL数据库。

---

## 📦 您已提供的信息

```yaml
数据库主机: 127.0.0.1
端口: 3306
数据库名: food
用户名: root
密码: Sunny418
表名: food
```

现有表结构：
```sql
CREATE TABLE `food` (
  `ID` int NOT NULL,
  `NAME` varchar(255),
  `METERIAL` varchar(255),
  `CALORIE` int,
  `STEP` varchar(255),
  PRIMARY KEY (`ID`)
)
```

---

## ⚡ 三步快速接入

### 第一步：初始化数据库 (5分钟)

1. **打开MySQL Workbench**
2. **连接到您的数据库** (127.0.0.1:3306, 用户root)
3. **执行SQL脚本**
   - 打开文件：`backend/init_database.sql`
   - 点击执行按钮 ⚡
   - 等待执行完成（约10-20秒）

4. **验证结果**
   ```sql
   -- 检查菜品分类
   SELECT TYPE, COUNT(*) FROM food GROUP BY TYPE;
   
   -- 查看示例数据
   SELECT ID, NAME, TYPE, CALORIE, PROTEIN, TAGS FROM food LIMIT 10;
   ```

**预期结果：**
- ✅ food表新增了6个字段（TYPE, PROTEIN, TAGS, IS_CUSTOM, USER_ID, CREATE_TIME）
- ✅ 现有数据已自动分类（meat/veg/soup）
- ✅ 已导入20道默认菜品
- ✅ 创建了users和custom_recipes表

---

### 第二步：启动后端服务 (5分钟)

#### 方式A：使用IntelliJ IDEA（推荐）

1. **打开IDEA**
2. **导入项目**
   - File → Open
   - 选择 `backend` 文件夹
   - 等待Maven下载依赖（首次约3-5分钟）

3. **运行项目**
   - 找到 `src/main/java/com/eatwhat/EatWhatApplication.java`
   - 右键 → Run 'EatWhatApplication'

4. **确认启动成功**
   - 控制台显示：
   ```
   ✅ 吃什么小程序后端服务启动成功！
   📡 API地址: http://localhost:8080/api
   ```

#### 方式B：使用命令行

```bash
# 进入backend目录
cd backend

# 安装依赖（首次）
mvn clean install

# 启动服务
mvn spring-boot:run
```

#### 验证后端

在浏览器访问：
```
http://localhost:8080/api/dishes
```

应该返回菜品列表的JSON数据（类似下方）：
```json
[
  {
    "id": 1,
    "name": "宫保鸡丁",
    "type": "meat",
    "calories": 360,
    "protein": 28,
    "tags": ["荤", "川味"]
  }
]
```

---

### 第三步：配置小程序 (2分钟)

1. **开启API模式**
   - 打开 `utils/config.js`
   - 修改：
   ```javascript
   const USE_BACKEND_API = true  // 改为true
   ```

2. **配置微信开发者工具**
   - 打开小程序项目
   - 右上角"详情" → 本地设置
   - ✅ 勾选"不校验合法域名"
   - ✅ 勾选"不校验TLS版本"

3. **重新编译小程序**
   - 点击"编译"按钮
   - 打开"定制菜谱"页面
   - 应该能看到从数据库加载的菜品

---

## ✅ 验证功能

### 1. 查看菜品列表

- 打开小程序
- 点击"定制菜谱"
- 查看荤菜、素菜、汤品列表
- ✅ 应显示数据库中的菜品

### 2. 测试搜索

- 在搜索框输入"鸡"
- ✅ 应显示包含"鸡"的菜品

### 3. 测试自定义菜品

- 点击"添加自定义菜品"
- 输入名称保存
- ✅ 小程序显示新菜品
- ✅ 数据库中已保存（执行SQL查询验证）

```sql
-- 查看自定义菜品
SELECT * FROM food WHERE IS_CUSTOM = 1;
```

### 4. 测试推荐功能

- 返回主页
- 设置参数（人数、荤素）
- 点击"今天吃什么"
- ✅ 应显示推荐方案（包含数据库菜品）

---

## 📁 项目结构说明

```
吃什么/
├── backend/                        # 后端服务（新增）
│   ├── src/main/java/              # Java源代码
│   │   └── com/eatwhat/
│   │       ├── EatWhatApplication.java  # 启动类
│   │       ├── controller/         # 控制器（API接口）
│   │       ├── service/            # 业务逻辑
│   │       ├── mapper/             # 数据访问层
│   │       └── entity/             # 实体类
│   ├── src/main/resources/
│   │   └── application.yml         # 配置文件（数据库连接）
│   ├── init_database.sql           # 数据库初始化脚本 ⭐
│   ├── pom.xml                     # Maven配置
│   └── README.md                   # 后端说明文档
│
├── utils/                          # 工具函数
│   ├── api.js                      # API接口调用（新增）⭐
│   ├── config.js                   # 全局配置（新增）⭐
│   ├── dishes.js                   # 菜品管理
│   ├── recommend.js                # 推荐算法
│   └── util.js                     # 通用工具
│
├── docs/                           # 文档
│   ├── DATABASE_INTEGRATION.md     # 数据库接入方案 ⭐
│   ├── DEPLOYMENT_GUIDE.md         # 部署指南 ⭐
│   ├── API_SPEC.md                 # API规范
│   └── FEATURE_SUMMARY.md          # 功能总结
│
├── pages/                          # 小程序页面
│   ├── index/                      # 主页
│   ├── result/                     # 结果页
│   └── customize/                  # 定制页
│
├── QUICK_START.md                  # 本文件 ⭐
└── README.md                       # 项目说明
```

**标记⭐的是新增或修改的重要文件**

---

## 🔧 常见问题快速解决

### ❌ 后端启动失败

**错误信息：** `Access denied for user 'root'`

**解决：**
1. 打开 `backend/src/main/resources/application.yml`
2. 检查密码是否为 `Sunny418`
3. 或在MySQL中重置密码：
```sql
ALTER USER 'root'@'localhost' IDENTIFIED BY 'Sunny418';
```

---

### ❌ 小程序无法连接后端

**症状：** 菜品列表为空，控制台报网络错误

**解决：**
1. ✅ 确认后端已启动（浏览器访问 http://localhost:8080/api/dishes）
2. ✅ 微信开发者工具已关闭域名校验
3. ✅ 检查 `utils/config.js` 中 `USE_BACKEND_API = true`

---

### ❌ 数据库表结构不完整

**症状：** 执行SQL时报错 "Unknown column 'TYPE'"

**解决：**
重新执行 `backend/init_database.sql` 脚本，它会自动添加缺失字段。

---

### ❌ Maven下载依赖很慢

**解决：**
配置国内镜像源，编辑 `~/.m2/settings.xml`：
```xml
<mirror>
  <id>aliyun</id>
  <mirrorOf>central</mirrorOf>
  <url>https://maven.aliyun.com/repository/public</url>
</mirror>
```

---

## 📊 数据流程图

```
┌─────────────┐      HTTP请求      ┌──────────────┐
│  微信小程序  │ ───────────────→  │ Spring Boot  │
│  (前端)     │                    │   (后端)     │
└─────────────┘                    └──────────────┘
                                          │
                                          │ SQL查询
                                          ▼
                                    ┌──────────┐
                                    │  MySQL   │
                                    │ (food库)  │
                                    └──────────┘
```

**数据流程：**
1. 用户打开小程序 → 调用 `api.getDishes()`
2. 发送HTTP请求 → `http://localhost:8080/api/dishes`
3. Spring Boot处理 → 调用 `DishMapper.selectDishes()`
4. 执行SQL查询 → `SELECT * FROM food`
5. 返回JSON数据 → 小程序展示

---

## 🎯 下一步建议

完成基础接入后，可以继续：

### 1. 实现用户登录
- [ ] 接入微信登录
- [ ] 实现用户表管理
- [ ] 每个用户独立的自定义菜品

### 2. 实现菜谱管理
- [ ] 保存菜谱到数据库
- [ ] 从数据库读取菜谱
- [ ] 支持编辑和删除

### 3. 优化推荐算法
- [ ] 基于用户历史推荐
- [ ] 营养均衡计算
- [ ] 季节性菜品推荐

### 4. 部署到生产环境
- [ ] 购买云服务器
- [ ] 配置HTTPS
- [ ] 配置域名白名单

---

## 📚 相关文档

- [数据库接入方案](docs/DATABASE_INTEGRATION.md) - 详细的数据库配置说明
- [部署指南](docs/DEPLOYMENT_GUIDE.md) - 完整的部署步骤
- [API接口规范](docs/API_SPEC.md) - 所有API接口文档
- [后端README](backend/README.md) - 后端项目说明

---

## 💬 需要帮助？

检查清单：
- [ ] 数据库是否执行了 `init_database.sql`
- [ ] 后端服务是否启动成功（访问 http://localhost:8080/api/dishes 有数据）
- [ ] 小程序是否开启了 `USE_BACKEND_API = true`
- [ ] 微信开发者工具是否关闭域名校验

如果仍有问题，请检查：
1. 后端控制台日志
2. 微信开发者工具 → 调试器 → Network → 查看请求是否成功
3. 数据库中是否有数据

---

**祝您使用愉快！🎉**

如有问题，请参考详细文档或查看项目Issue。

