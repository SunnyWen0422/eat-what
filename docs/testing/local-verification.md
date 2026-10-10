# 本机合并版本的开发与验证

当前源码是项目根目录，分支 `codex/v4-meal-workspace-green-20261003`，实际合并基线 `c5bfe61`。本轮只做本地合并、整理、质量与性能检查，不升级线上。最终提交、候选和验收结果见 [交付记录](../release/2026-10-10-local-merged-readiness.md)。旧预览目录、16 道样例库和旧模型预算属于历史记录，不作为当前启动说明。

## 服务环境

| 环境 | 入口和数据 | 边界 |
| --- | --- | --- |
| 源项目目标配置 | `utils/config.js` 指向 `https://chishenme.icu/api`，V4 与微信登录开启 | 使用真实微信登录；前次只读证据显示线上旧服务缺 V4/公开菜库接口，本轮没有新增线上检查或升级 |
| 本机完整数据环境 | `.local-maturity-active`，API `http://127.0.0.1:18780/api`；原专属 MySQL 端口记录为 `7505`，实际以私有运行记录为准 | 仅 `local-v4` Profile 与本机隔离账号；保留数据、凭据、Token 和预算，不接生产数据库 |
| 网页环境 | `web/` 单独构建，个人记录存浏览器 IndexedDB | 不与微信账号云同步；浏览器不直连 MySQL，公开菜库通过同源接口读取 |

API 地址切换会重新登录。用户缓存、待提交操作、回执及公开菜库按服务来源隔离；旧无来源数据保留但不自动用于线上。私有运行记录和配置不能提交或粘贴。

## 启动本机完整数据环境

在项目根目录的普通 PowerShell 中运行并保持窗口打开：

```powershell
./scripts/start_local_maturity.ps1
```

启动器先校验 Java/JAR，再复用 `.local-maturity-active`。已有环境不重新导入数据库；只有首次建立新环境需要显式提供已审计的 `-BackupZip` 和 `-QualityBundle`。不要把首次初始化当日常重启。

Java 使用 `.local-maturity-active/jars/eatwhat-backend-<SHA256>.jar` 固定快照，避免占用构建输出。默认重启沿用保存包，新构建不会自动切换运行版本。选择已验证的新包时传入：

```powershell
./scripts/start_local_maturity.ps1 -JarPath ./backend/target/eatwhat-backend-1.0.0.jar
```

已配置好独立 Python 依赖的终端也可执行：

```powershell
python scripts/local_maturity.py check-jar --jar ./backend/target/eatwhat-backend-1.0.0.jar
python scripts/local_maturity.py restart --jar ./backend/target/eatwhat-backend-1.0.0.jar
python scripts/local_maturity.py status
```

`check-jar` 只校验并准备快照，不停止服务；`restart` 重启本环境核对归属的 Java。无效源包、保存哈希漂移或跨工作区私有目录会在停止旧服务前被拒绝。旧运行记录仍支持迁移到快照；停止使用 `python scripts/local_maturity.py stop`，数据不删除。

停止前还核对私有配置的数据库、端口与 Token 是否匹配运行记录，以及 API 监听是否属于记录的 Java。就绪须确认新进程仍存活、命令和监听归属匹配后再检查健康，另一服务的 HTTP 200 不算成功。Windows 使用只读进程查询和监听核对；无法验证时明确拒绝。隔离执行环境可能看不到普通终端的进程，须保留该限制并在普通终端启动，不能放宽为只检查 HTTP。

### 明确恢复旧运行记录

历史启动器可能在隔离环境看不到普通终端的旧 Java，记录了随后退出的新 PID，却误把另一个健康响应当作成功。若 API 尚由本环境旧进程提供、运行记录与监听不一致，可在能够看到该进程的普通 PowerShell 中明确恢复一次：

```powershell
python scripts/local_maturity.py adopt-running
./scripts/start_local_maturity.ps1 -JarPath ./backend/target/eatwhat-backend-1.0.0.jar
```

第一步只校正运行记录，不停止或启动进程、不改数据库/Token/预算。它要求唯一监听、完整 Java 命令、`local-v4`、同一私有配置，以及记录中准确的固定快照或项目 `backend/target` 的旧 JAR 全部匹配；外部环境一律拒绝。原记录保存为新的私有 `runtime-before-adopt-*.json`，不覆盖旧备份。认出旧 JAR 时清除错误的快照字段并返回真实旧包哈希，不能据此声称当前运行最新代码。

第二步才明确选取已验证的最终包并重启。若最终包在独立构建目录，以交付清单的真实 JAR 路径替换示例；不要选旧 `target` 包。没有监听或无法核对时恢复失败，保留现场，不自动重置或收养别的环境。正常启动不自动执行恢复。

普通启动不自动启动模型适配器或加载供应商凭据。外部模型测试仍延后，历史 20 次联调授权不代表本轮恢复测试。语音按钮提示“抱歉，该功能暂不可用”。

## 微信开发者工具

源项目是唯一代码开发来源。原目录有不可读测试产物导致扫描失败时，可导出到全新的项目外目录：

```powershell
python scripts/export_local_miniprogram.py --out ../work/wechat-local-new-review
```

导出脚本不覆盖已有目录，并保留源 API 地址；不会自动切到本机服务。直接打开当前源项目或原样导出副本会使用 HTTPS 配置。离线体验须使用交付清单明确标记的本机预览副本，核对 API 为 `http://127.0.0.1:18780/api`，不能拿历史预览目录验收新源码。

开发者工具服务端口需已开启；旧日志不能证明当前状态，本轮不自动修改安全设置。导出只保留已有本机域名检查偏好，不把关闭检查写入发布配置。手机的 `127.0.0.1` 不能访问电脑服务。

编译、模拟器交互和真机检查分别记录。覆盖登录重试、搜索与翻页、选菜、菜单、确认计划、采购、实付、实际用餐、回顾、离线失败与重入恢复，以及大字、键盘、安全区和按钮状态；尚未执行的原生或真机检查仍列未验收。

## 网页与隔离验收

在 `web/` 使用 Node.js 24.x，执行 `npm ci` 安装锁定依赖。`npm run dev` 不启用线上代理；`npm run dev:online` 仅代理固定 HTTPS 的公开菜库 GET，校验证书并剥离令牌/Cookie，不代理私人接口或写入。

前次只读证据中公开菜库返回 404，是服务版本差异，不能改密码、放开数据库或伪造 VERIFIED 来修复。本轮浏览器验收使用隔离响应，E2E 启动器强制 `EATWHAT_CATALOG_PROXY=off`：

```powershell
cd web
npm run e2e -- --project=chromium
```

测试只停止自己创建的服务器；端口被其他开发服务占用时应报错，不接管它。静态候选仍需服务器同源 API，开发代理不进入发布包。公开目录默认关闭、白名单为空，最多明确批准 500 道系统菜，私人菜谱不公开。

## 全仓验证

Python 使用独立依赖环境，依赖清单是 `scripts/requirements-verification.txt` 与 `recommend-service/requirements.txt`；CairoSVG 需已验证的 Cairo DLL，需要时配置 `CAIROCFFI_DLL_DIRECTORIES` 与 PATH。网页需先 `npm ci`，Maven 离线缓存需预先备齐。

Windows 隔离执行将临时目录放在任务可写目录，不修改系统目录权限：

```powershell
$verificationTemp = Join-Path (Get-Location) '.test-artifacts/verification-temp'
New-Item -ItemType Directory -Path $verificationTemp -Force | Out-Null
$env:TEMP = $verificationTemp
$env:TMP = $verificationTemp
./scripts/verify.ps1 -MavenRepository ../.m2 -Offline -SkipModelServiceTests
```

旧的普通终端 Java 若仍占用 `backend/target`，使用 `-BackendBuildDirectory ../work/independent-web-fixes-20261010/java-final` 指定独立构建目录；不会停止已有服务或覆盖它正在使用的旧 JAR。此目录中的包才是本轮验证产物，不能拿旧 `target` 包代替。

Python/Maven 不在默认位置时传入 `-PythonExecutable`、`-MavenExecutable`。本机已有独立依赖目录为 `../work/v4-development/verification-deps` 和 `../work/assistant-chain-venv/Lib/site-packages`，通过当前终端 `PYTHONPATH` 配置，不修改系统 Python，也不打包机器专属依赖目录。

根检查包括源 JSON/语法/敏感标记、迁移清单、小程序 Node/Python、网页类型/单元/构建/接口边界及 Java 测试打包。`-SkipModelServiceTests` 保持模型模块延后；`-Offline` 约束 Maven 解析，不等于允许测试接生产。MySQL/HTTP 隔离联调、浏览器、微信原生各自使用明确目标，证据不互相替代。

## 数据与交付

质量记录是补充证据。无核验来源的份量、基础人数和营养保持未知，不伪造可信状态；普通小程序浏览和手动选菜不因没有 VERIFIED 而全部关闭。网页自动配餐仍受自身证据门槛约束。缺价保持空缺，官方报价保留真实日期，实际支出与参考估算分开。

本机匿名化数据库不整库覆盖生产。匹配后端、旧迁移血缘、私密配置、公开范围、恢复演练和发布验收要求见 [统一替换准备](../release/local-maturity-cutover.md)。候选审核不等于上线批准。
