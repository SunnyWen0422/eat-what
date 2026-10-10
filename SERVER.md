# 服务器运维手册

## 连接方式

### 2026-10-10 核对说明

**最新结果（09:04–09:06）：云助手已可用，成功用服务器应用配置只读查询 MySQL 8.0.36 的 `food`，6,665 道系统菜、86 个用户。没有修改线上服务或数据库。SSH 22 已能握手，但本机私钥认证被拒绝；后续使用云助手通道。公网与 Java 回环地址的新版公开菜谱接口均为 404，现有部署 JAR 没有相应控制器，数据库缺少 V4 工作区和菜谱质量表。**以下失败状态为较早记录，详细证据和后续步骤见 [访问说明](docs/operations/2026-10-10-online-access-recovery.md)。

以下旧连接示例不是当前可用性证明。2026-10-08 曾通过阿里云云助手在服务器内部成功只读查询 `food`：MySQL 8.0.36、6,665 道系统菜；当时 `sshd -T` 的有效端口为 **22**，旧 3294 记录已经过时。数据库凭据从服务器应用配置读取，没有写入源码。

2026-10-10 凌晨重新核对：实例为 Running，但云助手 `CloudAssistantStatus=false`，最后心跳为北京时间 2026-10-09 21:11:06；本次数据库检查在执行 SQL 前返回 `ClientNotRunning`。本机 SSH 22 和 MySQL 3306 未完成协议握手，HTTPS 请求超时；这不能证明 MySQL 进程停止或密码失效。控制台截图为 Ubuntu 登录界面，没有完成操作系统内登录。当前访问恢复步骤及边界见 [恢复说明](docs/operations/2026-10-10-online-access-recovery.md)。

同日 08:33 再次读取云状态仍为 false，最新心跳更新至北京时间 03:17:39；访问未恢复，以上凌晨网络结果仅代表原检查时间。

### SSH
```bash
# 22 是实测有效端口；2026-10-10 可握手，但本机现有私钥未通过认证。
ssh -i <私钥路径> -p 22 root@60.205.194.136
```

### 域名
```
https://chishenme.icu        — 前端 / API 入口
宝塔面板 — 使用已核对的私有连接资料；本节旧 8888 记录不再作为连接依据
```

---

## 服务器规格

| 项目 | 值 |
|------|-----|
| OS | Ubuntu (阿里云 ECS) |
| CPU | 1 核 |
| 内存 | 1.6 GB |
| 磁盘 | 40 GB 基础云盘 |
| Swap | 1 GB |

---

## 服务架构

```
Nginx (BT Panel 管理)
  ├── :80   → 301 → :443
  ├── :443  → proxy_pass http://127.0.0.1:8080
  └── 日志: /www/wwwlogs/eatwhat-backend-1.error.log

Java 后端 (BT Panel Java 项目管理)
  ├── :8080 → context-path: /api
  ├── JAR: /www/wwwroot/backend/eatwhat-backend-1.0.0.jar
  ├── 用户: www (BT Panel 自动管理重启)
  ├── 配置: /www/wwwroot/backend/application-prod.yml
  └── ⚠️ 禁止使用 systemd 管理（已删除 /etc/systemd/system/eatwhat.service）

Python 推荐服务 (systemd)
  ├── :8000 (127.0.0.1 only)
  ├── 代码: /www/wwwroot/recommend-service/
  ├── venv: /www/wwwroot/recommend-service/venv/
  ├── systemd: eatwhat-recommend.service
  └── 重启: systemctl restart eatwhat-recommend

MySQL
  ├── :3306
  ├── 数据库: food (utf8mb4)
  ├── 应用用户: 通过服务器环境变量配置
  ├── root密码: 不在仓库中保存
  └── 表: food(2026-10-08只读核对为6665行), users, recipe_records, favorite_dishes 等；当前数量未再次确认
```

---

## 常用运维命令

### 健康检查
```bash
# 所有服务状态
systemctl is-active mysql nginx eatwhat-recommend
ss -tlnp | grep -E "8080|8000|3306"

# Java 后端
curl -s http://localhost:8080/api/dishes/count
# 正常返回: {"success":false,"message":"未提供token"}

# Python 推荐
curl -s http://127.0.0.1:8000/health
# 正常返回: {"status":"ok"}

# 公网 API
curl -s https://chishenme.icu/api/dishes/count
```

### 查看日志
```bash
# Nginx 错误日志
tail -50 /www/wwwlogs/eatwhat-backend-1.error.log

# Nginx 访问日志
tail -50 /www/wwwlogs/eatwhat-backend-1.log

# BT Panel Java 进程
ps aux | grep java | grep -v grep

# 系统日志（最近错误）
journalctl --no-pager --since "1 hour ago" | grep -i error
```

### 重启服务
```bash
# Python 服务
systemctl restart eatwhat-recommend

# Java 服务（BT Panel 管理，手动重启）
kill <PID>   # BT Panel 会30秒内自动重启
# 或通过宝塔面板 → Java 项目管理 → 重启
```

### 数据库快速查询
```bash
mysql -u "$DB_USER" -p "$DB_NAME" -e "SELECT type, COUNT(*) FROM food GROUP BY type;"
```

---

## 已知问题与注意事项

1. **Java 后端由 BT Panel 管理**，不是 systemd。不要创建 systemd 服务（会导致双进程争端口 → CPU 80% → IO 卡死）
2. **系统内存偏紧**（Java `-Xmx1024M`，总内存 1.6G），避免同时运行大型 SQL
3. **基础云盘 IOPS 低**，大量 UPDATE/DELETE 分批执行，不要一次性更新上万行
4. **Token 存储在 JVM 内存**，服务器重启后所有用户需重新登录
5. **账户表 `eatwhat` 不存在**，应用实际使用 `food` 用户连接 MySQL

## Production migration policy

Production schema changes are versioned under `backend/db/migrations/` and described by
`backend/db/migration-manifest.json`. Run the checker before review:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check_database_migrations.ps1
```

The migration invoker must select the target database (`mysql ... food < migration.sql`).
Production migration files must not contain a fixed `USE food`, `DROP TABLE`, or
`TRUNCATE TABLE`. Take a backup first, apply one version at a time, verify
`schema_migrations`, and roll back by restoring the backup rather than dropping columns.

---

## 项目目录结构

```
/www/wwwroot/
├── backend/                         # Java Spring Boot 项目
│   ├── eatwhat-backend-1.0.0.jar    # 运行中的 JAR
│   ├── eatwhat-backend-1.0.0.jar.bak* # 历史备份
│   ├── application.yml              # 基础配置
│   ├── application-prod.yml         # 生产配置 (⚠️ LF格式)
│   └── fix_20260517/                # 性能修复补丁源码
│       ├── sourcecode/              # 编译源码
│       └── redeploy_all.sh          # 重新部署脚本
├── recommend-service/               # Python FastAPI 推荐服务
│   ├── main.py
│   ├── db.py / config.py
│   ├── graph/ (nodes.py, graph.py, state.py)
│   ├── prompts/
│   ├── venv/
│   └── .env
└── java_node_ssl/                   # SSL 证书验证目录
```

---

## 本地项目路径

```
C:\Users\Administrator\Documents\Codex\2026-07-18\d-eatwhat\project\
├── app.js / app.json / app.wxss     # 微信小程序入口
├── pages/                           # 页面代码
│   ├── index/                       # 首页（选菜配置）
│   ├── result/                      # 推荐结果
│   ├── calendar/ + calendar-detail/ # 日历
│   ├── profile/                     # 我的
│   ├── statistics/                  # 饮食统计
│   └── customize/                   # 定制菜谱
├── utils/
│   ├── api.js                       # 后端API客户端
│   ├── recommend.js                 # 前端推荐引擎
│   ├── config.js                    # 全局配置
│   └── util.js                      # 通用工具
├── backend/                         # Java 后端源码
└── recommend-service/               # Python 推荐服务源码
```

---

## 生产环境必需配置

Java 外部配置或进程环境至少需要提供：

```bash
TOKEN_SECRET='<至少32位随机字符串>'
DB_PASSWORD='<数据库密码>'
WECHAT_APPID='<小程序 AppID>'
WECHAT_SECRET='<小程序 AppSecret>'
ADMIN_USER_IDS='7,12'                    # 允许进入管理功能的用户ID，逗号分隔
RECOMMEND_SERVICE_BASE_URL='http://127.0.0.1:8000'
CORS_ALLOWED_ORIGINS='https://chishenme.icu,https://www.chishenme.icu'
```

`TOKEN_SECRET`、`DB_PASSWORD`、`WECHAT_APPID` 和 `WECHAT_SECRET` 没有仓库内默认值；
缺失时应用应在启动阶段失败，避免带着弱配置运行。

Python 推荐服务应使用只读 MySQL 账户；菜品新增、修改和删除统一由 Java 后端执行。首次部署无状态令牌后，旧的内存令牌会触发一次自动重新登录。

---

## 部署后端代码流程

```bash
# 1. 修改本地源码
# 2. 上传到服务器
scp -i <key> -P 3294 <file>.java root@60.205.194.136:/www/wwwroot/backend/fix_20260517/sourcecode/.../

# 3. 服务器上编译（需要先提取 JAR）
cd /tmp/eatwhat_fix && mkdir -p extract build_output
cd extract && jar xf /www/wwwroot/backend/eatwhat-backend-1.0.0.jar && cd ..
CP="extract/BOOT-INF/classes"
for jar in extract/BOOT-INF/lib/*.jar; do CP="${CP}:${jar}"; done
javac -encoding UTF-8 -parameters -cp "$CP" -d build_output <files...>

# 4. 替换 class 文件
cp build_output/.../Xxx.class extract/BOOT-INF/classes/.../

# 5. 重新打包（store模式，不压缩）
cd extract && jar c0mf META-INF/MANIFEST.MF <jar> BOOT-INF META-INF org

# 6. 重启（BT Panel 自动管理，杀掉进程即可）
kill $(pgrep -f eatwhat-backend)
```

---

## 推荐筛选离线迁移与回滚（尚未部署）

本节只记录后续上线步骤。本次开发未连接生产 MySQL，也未上传服务器文件。

### 上线前备份

```bash
mysqldump -u root -p --single-transaction food > /www/backup/eatwhat-before-recommendation-$(date +%Y%m%d-%H%M%S).sql
cp /www/wwwroot/backend/eatwhat-backend-1.0.0.jar /www/wwwroot/backend/eatwhat-backend-1.0.0.jar.before-recommendation
cp /www/wwwroot/backend/application-prod.yml /www/wwwroot/backend/application-prod.yml.before-recommendation
```

旧库还没有 `user_preference` 时，先只备份现有表，再执行迁移后做一次完整备份。

### 建议迁移顺序

1. 在本地运行 `scripts/verify.ps1`，确认配置、脚本、JSON、JavaScript 和 Python 静态检查通过；生产迁移前另行执行隔离数据库验证。
2. 备份生产数据库、JAR 与配置，并记录当前 `food` 行数及各 `type` 数量。
3. 执行 `backend/ensure_food_import_schema.sql`；若需要替换系统菜，随后执行生成的 `replace_system_dishes.sql`。替换脚本只删除 `user_id IS NULL` 的系统菜，保留用户自定义菜。
4. 执行 `backend/recommendation_preferences_schema.sql`，再执行 `backend/recommendation_metadata_backfill.sql`，顺序与 `scripts/apply_dish_replacement.ps1` 保持一致。
5. 先以 `RECOMMENDATION_PREFERENCES_ENABLED=false` 启动新 JAR，验证登录、旧版数量推荐、菜品详情和自定义菜所有权。
6. 将开关改为 `true` 后重启 Java，验证 `/api/recommend/options`、偏好读写、组合筛选和推荐结果警告。
7. 最后上传小程序版本。旧客户端的数量请求保持兼容。

### 回滚

- 快速功能回滚：设置 `RECOMMENDATION_PREFERENCES_ENABLED=false` 并重启 Java。后端继续接受旧请求，前端会隐藏偏好和筛选控件。
- 代码回滚：恢复备份 JAR 与配置。新增列和 `user_preference` 表保留，不会影响旧代码，也不丢用户偏好。
- 数据回滚：仅在确认数据错误且已停止写入后恢复备份 SQL；不要通过删除新增列作为常规回滚手段。
- 上线验证失败时，不执行新的系统菜替换 SQL；先保留数据库现场和日志定位原因。

生产配置示例：

```bash
RECOMMENDATION_PREFERENCES_ENABLED=true
```
