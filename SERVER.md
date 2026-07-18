# 服务器运维手册

## 连接方式

### SSH
```bash
ssh -i <私钥路径> -p 3294 root@60.205.194.136
```

### 域名
```
https://chishenme.icu        — 前端 / API 入口
http://60.205.194.136:8888   — 宝塔面板
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
  └── 表: food(39577行), users, recipe_records, favorite_dishes
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
D:\吃什么\
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
