# 部署指南

本文档介绍如何将"吃什么"小程序接入MySQL数据库并部署后端服务。

## 📋 目录
1. [准备工作](#准备工作)
2. [数据库配置](#数据库配置)
3. [后端服务部署](#后端服务部署)
4. [小程序配置](#小程序配置)
5. [测试验证](#测试验证)
6. [常见问题](#常见问题)

---

## 准备工作

### 所需软件
- ✅ MySQL Workbench (已有)
- ✅ Java JDK 8+
- ✅ Maven 3.6+
- ✅ 微信开发者工具

### 数据库信息确认
```yaml
主机: 127.0.0.1
端口: 3306
数据库: food
用户: root
密码: Sunny418
表名: food
```

---

## 数据库配置

### 步骤1: 执行初始化脚本

在MySQL Workbench中执行以下操作：

1. **打开SQL脚本**
   - 找到项目文件 `backend/init_database.sql`
   - 在MySQL Workbench中打开

2. **执行脚本**
   ```sql
   -- 点击"⚡执行"按钮或按 Ctrl+Shift+Enter
   ```

3. **验证结果**
   - 检查输出窗口是否显示"✅ 数据库初始化成功！"
   - 查看各类菜品数量统计

### 步骤2: 验证表结构

执行以下查询验证：

```sql
-- 查看food表结构
DESCRIBE food;

-- 应包含以下字段：
-- ID, NAME, METERIAL, CALORIE, STEP, TYPE, PROTEIN, TAGS, IS_CUSTOM, USER_ID, CREATE_TIME
```

```sql
-- 查看菜品分类统计
SELECT TYPE, COUNT(*) as 数量 FROM food GROUP BY TYPE;

-- 预期结果：
-- meat: XX道
-- veg:  XX道
-- soup: XX道
```

### 步骤3: 查看示例数据

```sql
-- 查看部分数据
SELECT ID, NAME, TYPE, CALORIE, PROTEIN, TAGS FROM food LIMIT 10;
```

---

## 后端服务部署

### 方式一：使用IDE（推荐）

#### IDEA部署步骤：

1. **导入项目**
   - 打开IDEA
   - File → Open → 选择 `backend` 文件夹
   - 等待Maven自动导入依赖

2. **配置数据库连接**
   - 打开 `src/main/resources/application.yml`
   - 确认数据库配置正确：
   ```yaml
   spring:
     datasource:
       url: jdbc:mysql://127.0.0.1:3306/food
       username: root
       password: Sunny418
   ```

3. **运行项目**
   - 找到 `EatWhatApplication.java`
   - 右键 → Run 'EatWhatApplication'
   - 等待启动完成

4. **验证启动**
   - 控制台显示：
   ```
   ✅ 吃什么小程序后端服务启动成功！
   📡 API地址: http://localhost:8080/api
   ```

### 方式二：使用命令行

1. **进入backend目录**
   ```bash
   cd backend
   ```

2. **安装依赖**
   ```bash
   mvn clean install
   ```

3. **启动服务**
   ```bash
   mvn spring-boot:run
   ```

### 测试后端接口

启动成功后，在浏览器访问：

```
http://localhost:8080/api/dishes
```

应该返回菜品列表的JSON数据。

---

## 小程序配置

### 步骤1: 开启后端API

1. **修改配置文件**
   - 打开 `utils/config.js`
   - 将 `USE_BACKEND_API` 改为 `true`：
   ```javascript
   const USE_BACKEND_API = true  // 启用后端API
   ```

2. **确认API地址**
   - 开发阶段使用：`http://localhost:8080/api`
   - 生产环境需改为HTTPS域名

### 步骤2: 配置开发工具

1. **打开微信开发者工具**
   - 打开项目

2. **开启本地调试**
   - 右上角"详情" → 本地设置
   - ✅ 勾选"不校验合法域名"
   - ✅ 勾选"不校验TLS版本"

3. **设置调试基础库**
   - 建议使用 2.27.0 或更高版本

### 步骤3: 修改菜品加载逻辑

修改 `pages/customize/customize.js`：

```javascript
// 原代码
loadDefaultDishes() {
  const { getDefaultDishes } = require('../../utils/dishes')
  const dishes = getDefaultDishes()
  // ...
}

// 改为
loadDefaultDishes() {
  const config = require('../../utils/config')
  
  if (config.USE_BACKEND_API) {
    // 使用后端API
    const api = require('../../utils/api')
    api.getDishes().then(dishes => {
      this.setData({
        meatDishes: dishes.filter(d => d.type === 'meat'),
        vegDishes: dishes.filter(d => d.type === 'veg'),
        soupDishes: dishes.filter(d => d.type === 'soup')
      })
    }).catch(err => {
      console.error('加载菜品失败', err)
      // 降级到本地数据
      this.loadLocalDishes()
    })
  } else {
    // 使用本地数据
    this.loadLocalDishes()
  }
}

loadLocalDishes() {
  const { getDefaultDishes } = require('../../utils/dishes')
  const dishes = getDefaultDishes()
  this.setData({
    meatDishes: dishes.filter(d => d.type === 'meat'),
    vegDishes: dishes.filter(d => d.type === 'veg'),
    soupDishes: dishes.filter(d => d.type === 'soup')
  })
}
```

---

## 测试验证

### 1. 测试菜品列表

1. 打开小程序
2. 点击"定制菜谱"
3. 选择"荤菜"、"素菜"或"汤品"
4. 应该能看到从数据库加载的菜品

### 2. 测试搜索功能

1. 在搜索框输入关键词（如"鸡"）
2. 应该显示相关菜品
3. 检查网络请求是否正常

### 3. 测试自定义菜品

1. 点击"添加自定义菜品"
2. 输入菜品名称
3. 保存后检查：
   - 小程序中是否显示
   - 数据库中是否保存（查询food表）

```sql
-- 查看自定义菜品
SELECT * FROM food WHERE IS_CUSTOM = 1;
```

### 4. 检查网络请求

在微信开发者工具中：
- 打开"调试器" → "Network"
- 操作小程序
- 查看API请求是否成功（状态码200）

---

## 常见问题

### Q1: 启动后端时报错 "Access denied for user 'root'"

**解决方法：**
1. 检查 `application.yml` 中的密码是否正确
2. 在MySQL中重置密码：
```sql
ALTER USER 'root'@'localhost' IDENTIFIED BY 'Sunny418';
FLUSH PRIVILEGES;
```

### Q2: 小程序无法连接后端

**解决方法：**
1. 确认后端服务已启动（访问 http://localhost:8080/api/dishes）
2. 确认微信开发者工具已关闭域名校验
3. 检查防火墙是否拦截8080端口

### Q3: 菜品数据为空

**解决方法：**
1. 检查数据库是否有数据：
```sql
SELECT COUNT(*) FROM food;
```
2. 如果为空，重新执行 `init_database.sql`

### Q4: 自定义菜品保存失败

**解决方法：**
1. 检查后端日志
2. 确认 `IS_CUSTOM`、`USER_ID` 字段是否存在
3. 检查API请求体格式是否正确

### Q5: 字段映射错误

**问题：** 返回的数据字段名不对（如返回CALORIE而非calories）

**解决方法：**
已在Mapper中配置了别名映射：
```java
@Select("SELECT ID as id, NAME as name, CALORIE as calories ...")
```

如果仍有问题，检查 `application.yml`：
```yaml
mybatis:
  configuration:
    map-underscore-to-camel-case: true
```

---

## 部署到生产环境

### 1. 服务器部署

#### 打包项目
```bash
cd backend
mvn clean package
```

#### 上传到服务器
```bash
# 生成的jar文件在 target/eatwhat-backend-1.0.0.jar
scp target/eatwhat-backend-1.0.0.jar user@server:/path/to/app/
```

#### 运行服务
```bash
# 在服务器上
java -jar eatwhat-backend-1.0.0.jar
```

### 2. 配置HTTPS

微信小程序要求正式环境必须使用HTTPS：

1. 申请SSL证书
2. 配置Nginx反向代理
3. 修改 `utils/config.js` 中的 `PROD_API_BASE_URL`

### 3. 配置域名白名单

在微信公众平台：
1. 登录小程序管理后台
2. 开发 → 开发管理 → 服务器域名
3. 添加你的API域名（必须是HTTPS）

---

## 下一步

- [ ] 实现用户登录功能
- [ ] 实现菜谱管理接口
- [ ] 实现推荐算法接口
- [ ] 部署到云服务器
- [ ] 配置HTTPS

## 技术支持

如遇到问题，请检查：
1. 后端日志（控制台输出）
2. 数据库连接状态
3. 微信开发者工具网络请求

---

**祝部署顺利！🎉**

