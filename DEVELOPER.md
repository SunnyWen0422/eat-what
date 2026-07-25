# 吃什么小程序 — 开发者手册

## 项目概述

"吃什么"是一款微信小程序，通过 AI 推荐算法（前端规则 + 后端检索 + DeepSeek 大模型）帮助用户决定每天吃什么。支持自定义菜品、日历记录、饮食统计、智能对话推荐。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | 微信原生小程序（glass-easel 组件框架） |
| 后端 | Java Spring Boot 2.7.14 + MyBatis + JDK 8 |
| 推荐/AI | Python FastAPI + DeepSeek Chat API + jieba 分词 |
| 数据库 | MySQL 8.0 |
| 部署 | 阿里云 ECS（宝塔面板 + Nginx + systemd） |

## 项目结构

```
吃什么/
├── app.js / app.json / app.wxss    # 小程序入口、全局配置、全局样式
├── pages/                          # 18个已注册页面
│   ├── index/          # 选菜首页（选参数 → 点击"今天吃什么"）
│   ├── result/         # 推荐结果（3套方案卡片，图片+热量+难度）
│   ├── recommend-filter/# 推荐筛选（菜系/标签/排除项/时长）
│   ├── chat/           # AI助手对话页（DeepSeek智能推荐）
│   ├── customize/      # 定制菜谱（分类浏览+搜索+自定义菜品）
│   ├── calendar/       # 日历视图（查看每日记录）
│   ├── calendar-detail/# 某一天的早中晚餐详情
│   ├── dish-detail/    # 菜品详情（食材+步骤+图片）
│   ├── profile/        # 我的页面（用户卡片+功能菜单+登录弹窗）
│   ├── profile-edit/   # 个人信息编辑（微信头像+昵称）
│   ├── statistics/     # 饮食统计
│   ├── favorite-dishes/# 收藏菜品列表
│   ├── custom-dishes/  # 自定义菜品列表
│   └── admin/          # 后台管理（5击版本号进入）
├── utils/
│   ├── api.js          # 后端API客户端（401重登+重试+ETag缓存+去重）
│   ├── recommend.js    # 前端推荐引擎（类型映射+加权随机+偏好排序）
│   ├── config.js       # 全局配置（API地址+功能开关）
│   └── util.js         # 通用工具（用户隔离存储）
├── backend/            # Java Spring Boot 后端源码
│   └── src/main/java/com/eatwhat/
│       ├── controller/     # 7个Controller
│       ├── service/        # 业务逻辑层
│       ├── mapper/         # MyBatis数据访问（@Select注解SQL）
│       ├── entity/         # 数据实体（User, Dish, RecipeRecord等）
│       ├── dto/            # 请求/响应DTO
│       ├── config/         # WebMvcConfig, CorsConfig, TokenInitializer
│       ├── interceptor/    # AuthInterceptor（HMAC令牌认证拦截器）
│       ├── exception/      # GlobalExceptionHandler
│       └── util/           # TokenUtil(JWT), WeChatUtil, DateUtil
├── recommend-service/  # Python 推荐/AI服务
│   ├── main.py             # FastAPI入口（/chat, /chat/sync, /health）
│   ├── rag.py              # 菜品与食材索引（jieba检索，按部署数据重建）
│   ├── chat_handler.py     # 对话引擎（意图识别+RAG+DeepSeek+结构化命令）
│   ├── db.py               # MySQL只读查询（pymysql）
│   ├── config.py           # 配置（DeepSeek Key, DB连接）
│   ├── graph/              # LangGraph推荐工作流
│   └── requirements.txt    # Python依赖
└── SERVER.md           # 服务器运维手册（SSH/数据库/部署流程）
```

## API 接口清单

### 用户
- `POST /api/users/login` — 微信登录（code → token）
- `GET  /api/users/info` — 获取用户信息
- `PUT  /api/users/info` — 更新用户信息

### 菜品
- `GET  /api/dishes?type=X&page=1&pageSize=50` — 分页获取系统菜及当前用户自定义菜
- `GET  /api/dishes?...&cuisineCodes=SICHUAN&tagCodes=SPICY&methodCodes=STEAM&maxCookMinutes=30` — 按规范化元数据筛选
- `GET  /api/dishes/lite?type=X&limit=N` — 轻量列表（用于预加载）
- `GET  /api/dishes/{id}` — 菜品详情
- `GET  /api/dishes/custom` — 当前用户的自定义菜品
- `POST /api/dishes/custom` — 创建自定义菜品
- `GET  /api/dishes/search?keyword=X` — 搜索菜品

### 推荐
- `POST /api/recommend` — 生成推荐方案（数量、临时筛选及是否采用长期偏好）
- `GET  /api/recommend/options` — 获取菜系/标签目录、数据量、元数据版本和功能开关
- `GET  /api/recommend/single?type=X&exclude=1,2,3` — 随机推荐一道菜

### 推荐偏好
- `GET  /api/users/preferences` — 获取当前登录用户长期偏好
- `PUT  /api/users/preferences` — 保存当前登录用户长期偏好及永久排除项

### 菜谱记录
- `POST /api/recipe-records` — 保存菜谱记录到日历
- `GET  /api/recipe-records/date/:date` — 按日期查询
- `DELETE /api/recipe-records/date/:date/meal/:type` — 删除
- `GET  /api/recipe-records/statistics` — 统计

### 收藏
- `POST /api/favorite-dishes` — 收藏
- `DELETE /api/favorite-dishes/{id}` — 取消收藏
- `POST /api/favorite-dishes/batch-check` — 批量检查
- `GET  /api/favorite-dishes` — 获取收藏列表

### AI 对话
- `POST /api/chat/sync` — 非流式对话（返回JSON）
- `POST /api/chat` — SSE流式对话

### 后台管理
- `GET  /api/admin/users?keyword=&page=1&pageSize=20` — 按用户 ID、昵称或手机号搜索并分页；返回 `success/list/data/total/page/pageSize/keyword`
- `GET  /api/admin/users/{id}` — 用户详情+菜谱
- `POST /api/admin/users/{id}/dishes` — 为用户添加菜谱
- `DELETE /api/admin/users/{uid}/dishes/{did}` — 删除用户菜谱

后台入口仅对 `ADMIN_USER_IDS` 中的用户显示：在个人中心连续点击版本号 5 次进入。新增菜品必须填写菜名、类型、食材和步骤；删除操作会物理删除对应用户拥有的自定义菜品，不会把它转成系统菜品。

后台列表和用户详情采用“最后一次请求生效”：搜索或刷新可以覆盖未完成的旧请求，旧响应不得写入数据、错误或加载状态。已有内容刷新时继续显示原内容并给出更新反馈；后端会把超出范围的页码规范到最后一个有效页。

## 数据库

### 连接信息
```
主机:   127.0.0.1:3306 (通过SSH隧道)
数据库: food
应用用户: 通过 `DB_USER` / `DB_PASSWORD` 环境变量配置
root用户: 不在仓库中保存凭据
```

### 表结构

```sql
-- food 表（离线基准数据为6665条系统菜，生产行数以迁移时审计为准）
id INT PRIMARY KEY AUTO_INCREMENT
name VARCHAR(255)        -- 菜名
type VARCHAR(50)         -- meat/veg/soup/dessert/staple
cl TEXT                  -- 材料（#分隔）
step TEXT                -- 步骤（#分隔，旧版）
steps TEXT               -- 详细步骤（###分隔）
tags VARCHAR(500)        -- 标签（逗号分隔）
image VARCHAR(500)       -- 图片URL（douguo.net）
difficulty VARCHAR(20)   -- 简单/普通/困难
cook_time VARCHAR(50)    -- 烹饪时间
kcal INT                 -- 热量(千卡)
methods VARCHAR(200)     -- 烹饪方法
user_id BIGINT           -- 自定义菜品所属用户ID
cuisine_code VARCHAR(32) -- 规范化菜系代码，可为空
tag_codes VARCHAR(500)   -- 规范化标签代码，逗号分隔
cook_minutes INT         -- 可筛选的烹饪分钟数
metadata_version INT     -- 元数据映射版本

-- users 表（注册用户，63行）
id BIGINT PK AUTO_INCREMENT
open_id VARCHAR(128) UNIQUE  -- 微信OpenID
session_key VARCHAR(128)
nickname VARCHAR(64)
avatar VARCHAR(255)
phone VARCHAR(20)
register_time DATETIME
```

## 服务器配置

### 连接
```
SSH:  root@60.205.194.136:3294 (需私钥)
域名: https://chishenme.icu
面板: http://60.205.194.136:8888 (宝塔)
```

### 服务端口
```
Nginx:   80/443 → 127.0.0.1:8080
Java:    8080 (context-path: /api)
Python:  8000 (127.0.0.1)
MySQL:   3306
```

### 重要路径
```
Java JAR:  /www/wwwroot/backend/eatwhat-backend-1.0.0.jar
Java配置:  /www/wwwroot/backend/application-prod.yml
Java源码:  /www/wwwroot/backend/fix_20260517/sourcecode/
Python:    /www/wwwroot/recommend-service/
Nginx配置: /www/server/panel/vhost/nginx/java_eatwhat-backend-1.conf
日志:      /www/wwwlogs/eatwhat-backend-1.error.log
```

### 服务管理
```
Java:   宝塔面板 → Java项目管理 → 自动重启
        禁止用 systemd（会导致双进程争端口8080）
Python: systemctl restart eatwhat-recommend
Nginx:  systemctl reload nginx
MySQL:  systemctl restart mysql
```

## 开发工作流

### 前端开发
1. 微信开发者工具打开 `C:\Users\Administrator\Documents\Codex\2026-07-18\d-eatwhat\project`
2. 修改代码 → 自动热重载 → 调试
3. 点击"上传"提交到微信审核

### Java 后端修改部署
```bash
# 方案A：完整Maven构建（需要本地有Maven）
cd backend && mvn package -DskipTests
scp target/eatwhat-backend-1.0.0.jar root@server:/www/wwwroot/backend/

# 方案B：服务器上热修复单个文件
scp YourFile.java root@server:/www/wwwroot/backend/fix_20260517/sourcecode/.../
ssh root@server "cd /tmp && jar xf $JAR && javac ... && jar c0f ... $JAR"
# 然后 kill Java进程 → 宝塔自动重启
```

### Python 修改部署
```bash
scp *.py root@server:/www/wwwroot/recommend-service/
ssh root@server "systemctl restart eatwhat-recommend"
```

### 查看日志
```bash
ssh root@server "journalctl -u eatwhat --no-pager -n 50"     # Java
ssh root@server "journalctl -u eatwhat-recommend -n 30"      # Python
ssh root@server "tail -50 /www/wwwlogs/eatwhat-backend-1.error.log"  # Nginx
```

## 关键设计决策

1. **Token认证**: 无状态HMAC-SHA256签名令牌，多实例使用同一 `TOKEN_SECRET` 即可验证
2. **推荐算法**: 前端有本地规则引擎（utils/recommend.js），后端有Java规则引擎（RecommendationService），AI有DeepSeek对话推荐
3. **前后端推荐降级链**: Java后端优先（2.5秒超时）→ 本地缓存/规则引擎；结果展示后不再被静默替换
   - 结果页首次生成使用 800ms/2.5s 分阶段反馈和 8 秒页面级硬超时；重新生成保留旧方案并使用非阻塞提示。
   - 每次生成携带递增版本，成功、失败、空结果、收藏状态和收尾写入都必须校验当前版本；页面卸载时使版本失效并清理计时器。
4. **图片**: douguo.net CDN，HTTP必须转HTTPS才能在微信显示
5. **分类**: 数据库存英文（meat/veg/soup/dessert/staple），前端同时支持中英文映射
6. **自定义菜品**: food表 user_id列区分，游客存本地storage，登录用户存数据库
7. **AI助手**: DeepSeek chat模型 + jieba分词知识库 + 食材倒排索引 + 10轮对话记忆持久化
8. **数据写入边界**: Python服务只读菜品数据；AI产生结构化命令，由Java使用认证用户身份执行数据库写入
9. **管理权限**: 管理接口和隐藏入口仅对 `ADMIN_USER_IDS` 中的用户开放
10. **CSS**: 不使用CSS自定义属性（微信不支持），全站主色 #2BA471，圆角14rpx

## 推荐筛选与偏好开发约定（v3.2）

- 菜系和标签唯一来源是 `backend/src/main/resources/recommendation-metadata.json`；前后端、导入脚本和测试都使用稳定大写代码，不用中文文案作为业务键。
- 首页快捷筛选固定为 `HOME_STYLE`、`SICHUAN`、`CANTONESE` 三项；完整筛选放在 `pages/recommend-filter/`。
- 临时筛选存入用户隔离的临时 storage，长期偏好存入 `user_preference`；关闭“使用我的偏好”只关闭正向加权，永久排除仍生效。
- 正向标签采用任一命中，排除标签/食材采用任一命中即淘汰；时长使用更严格的上限。
- `GET /api/dishes` 是筛选、搜索和分页的统一入口，并强制只返回系统菜与当前用户自定义菜。
- 数据重建入口是 `scripts/replace_dish_data.py`，元数据回填入口是 `scripts/backfill_recommendation_metadata.py`，审计文件不得手工维护。
- 完整本地验证运行 `scripts/test-all.ps1` 和 `scripts/verify.ps1`；推荐过滤性能报告输出到 `outputs/test-report/recommendation-performance.json`。

## 日常注意事项

- 服务器仅 1核1.6GB，避免大SQL一次性更新（分批执行）
- sentence-transformers/faiss因内存不足已移除，改用jieba轻量分词
- Java由宝塔管理不能有systemd冲突（eatwhat.service已删除）
- dish_meta.json(46MB)和ingredient_map.json不在版本控制中，上线后build_index.py动态生成
- DeepSeek API Key不在代码中，通过环境变量/.env注入
