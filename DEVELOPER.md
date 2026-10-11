# 吃什么：开发者手册

2026-10-11：已按用户要求刷新线上 Java/Python 后端，健康和访问边界检查通过。后端运行源码与已验证部署一致，本轮未替换运行包、配置或数据库；前端继续暂停上线。图片旧域名的证书不匹配也已从服务器复现。见 [后端刷新与图片证书核对](docs/operations/2026-10-11-backend-refresh.md)。

2026-10-10 最新边界：用户已暂停前端继续上线。微信开发版本已上传但未提审/发布；网页普通数据库推荐已在暂停前切换；当前本地另有原生布局修复尚未上传。见 [前端暂停记录](docs/operations/2026-10-10-frontend-update-paused.md) 与 [图 2 原生对齐](docs/testing/2026-10-10-native-layout-repair.md)。下文生产升级记录保留各次部署的历史范围。

当前分支 `codex/v4-meal-workspace-green-20261003` 已实际合并独立网页，合并基线 `c5bfe61`。用户随后明确授权统一上线，运行源码 `eabcc05` 已于 2026-10-10 完成 Java/Python/网页与数据库增量部署；实际结果、备份及未验收范围见 [生产升级记录](docs/operations/2026-10-10-production-release.md)。接手入口：[前轮本地交付](docs/release/2026-10-10-local-merged-readiness.md)、[启动与验证](docs/testing/local-verification.md)、[前后端设计](docs/eat-what-agent-fullstack-detailed-design.md)。历史计划不自动授权新的生产操作。

后续已整合环境/npm 修复 `4ab3d1f` 与小程序体验 `7fd7243`，冲突处理、额外修复和当前验证范围见 [优化分支合并验收](docs/testing/2026-10-10-optimization-branches-merge.md)。前轮 `7b70efe` 的冻结交付包不包含这次改动。

2026-10-10 根据用户确认的新视觉稿继续对齐首页、菜谱、日历、采购与个人菜谱，实施及验收范围见 [设计对齐记录](docs/testing/2026-10-10-experience-design-alignment.md)。组件样式使用独立的 `styles/component-theme.wxss`，不能重新导入含标签、ID 或属性选择器的页面主题。模板仍是生成样式的唯一来源。

## 工程结构

小程序围绕当前餐完成选菜、安排、计划确认、采购和实际用餐记录。一级导航为“今天｜菜谱｜日历｜我的”，`app.json` 注册 27 页。网页版共享仓库和公开菜库，独立构建；个人计划、收藏、采购和备份在浏览器 IndexedDB，目前不与微信账号云同步。

| 部分 | 技术与入口 | 责任 |
| --- | --- | --- |
| 微信小程序 | 原生、glass-easel；`app.js`、`pages/`、`components/`、`utils/` | 页面交互、认证请求、持久恢复 |
| 网页 | React、TypeScript、Vite；`web/`，Node.js 24.x | 独立前端、公开菜库、本机个人记录 |
| Java | Spring Boot 2.7.14、MyBatis；`backend/` | 认证、业务版本、来源校验与数据库写入 |
| Python | FastAPI；`recommend-service/main.py` | 检索、规则与受约束助手建议 |
| 数据 | MySQL 8；服务端连接 | 业务记录与证据保存，前端不携带数据库凭据 |
| 检查工具 | `scripts/`、`tests/`、`web/scripts/` | 隔离测试、构建、候选与验收证据 |

构建 JDK 与交付字节码目标分别核对。小程序打包明确排除 `web/`、后端、测试和私有运行目录，网页源码/依赖不会替换小程序页面、导航、图片或事件。

## 环境与启动

`utils/config.js` 是小程序 API 唯一来源，当前 `https://chishenme.icu/api`，V4 与微信登录开启。2026-10-10 部署后 V4 私人接口匿名访问返回 401，公开菜库 500 道可读；旧版 404 记录已不是当前状态。启动本机服务不会自动改变源配置。

当前本机完整数据环境是 `.local-maturity-active`，API `http://127.0.0.1:18780/api`，原专属 MySQL 端口记录 `7505`，实际以私有运行记录为准。`./scripts/start_local_maturity.ps1` 复用已有库和凭据，只使用 `local-v4` 与隔离账号，不能接到生产库。原 `.local-v4` 是历史样例环境。

Java 使用私有目录的 SHA256 固定快照，避免占用构建输出。默认重启沿用保存包；新包选择使用 `-JarPath` 或 Python `--jar`。`check-jar` 校验/准备快照而不停止服务。包无效、归属不符、哈希漂移时停止前拒绝执行，数据库、Token 与预算保留。

启动还校验私有配置与运行记录的数据源/端口/Token，并阻止父终端的 Spring/JVM 选项绕过此配置。API 监听必须属于记录的 Java；就绪检查结合活进程、完整命令归属和健康状态，不能接受其他环境的 HTTP 200。无法读取归属时拒绝执行，不扩大管理员或进程访问权限。

旧错误记录可用显式 `python scripts/local_maturity.py adopt-running` 在普通终端恢复：核对当前唯一监听及完整命令，仅接受当前私有保存快照或项目旧构建路径；先保存新的原记录备份，只修正 Java 字段，不动进程或业务数据。识别旧 JAR 不代表最新代码，随后仍须用最终候选路径明确 `-JarPath` 重启。默认启动不自动恢复，外部/未知进程不能收养。

源项目是唯一开发来源。`scripts/export_local_miniprogram.py` 向全新项目外目录导出，不覆盖已有目录，并保留源 API。离线体验使用交付清单明确标记并核对回环地址的副本，不用历史预览目录验收新代码。具体说明见 [本机验证](docs/testing/local-verification.md)。

## 接口与业务契约

- 微信登录通过 `POST /api/users/login` 获取令牌；私人资料、菜谱、收藏、偏好、菜单和记录使用服务端认证身份，不能信任客户端传入用户编号。
- `/api/dishes` 是筛选/搜索/分页入口，`/api/dishes/lite` 用于有限预加载。公共缓存绑定 API 来源，用户缓存和待确认操作还需账户隔离；迟到响应不得污染另一环境。
- `/api/meal-workspaces/**` 共享当前餐的版本化状态。保存计划与记录实吃分开；重复、冲突和未知结果恢复原请求，不静默创建替代写入。
- 收藏、手动选菜、个人菜谱、日历、采购、实付与回顾保留确认和失败反馈。历史计划不推断为已经吃过，个人菜单与菜谱质量证据分别保存。
- 网页只读 `/api/public/catalog/dishes`。源码配置默认关闭、允许编号为空；本次生产部署明确启用 500 道已发布系统菜白名单。私人历史、菜谱和令牌不向匿名页面公开。
- Python 提供建议，Java 执行认证、来源、版本和确认校验后的业务写入。内部服务使用匹配非空令牌；生产不能使用本机 Profile、测试入口或测试令牌。
- 模型服务测试暂缓，生产模型功能保持启用，本次上线未发送真实供应商测试请求。普通本机启动不自动启动适配器或加载供应商凭据。语音提示“抱歉，该功能暂不可用”。规则验证不能称为供应商模型验证。

详细字段以 Controller、DTO、接口契约测试和详细设计为准；旧部署清单不是当前完整 API 定义。

## 网页开发

在 `web/` 使用 Node.js 24.x，`npm ci` 安装锁定依赖。`npm run dev` 不启用线上代理；`npm run dev:online` 仅代理固定 HTTPS 公开菜库 GET，校验证书，剥离令牌/Cookie，不代理私人 API、数据库或写入。静态包需要同源后端，开发代理不进入包。

本地自动回归使用隔离响应；上线后另外完成公网只读页面与资源验收，范围见各次生产升级记录。个人记录属于当前浏览器和站点来源，清空站点数据、更换浏览器或来源不会自动迁移，应先备份/导出。网页现允许内容可用的公共菜谱参与普通推荐，仍排除明确拒绝/仅浏览记录；硬忌口、素食、数量换算分别保留事实门槛，不把 UNREVIEWED 伪升 VERIFIED。

```powershell
cd web
npm run typecheck
npm test -- --run
npm run build
npm run boundaries
npm run online:check
npm run e2e -- --project=chromium
```

候选工具检查文件、依赖、许可、哈希和接口边界，输出仍为待验收候选。Chrome、其他浏览器、微信原生、真机和真实链路分别验收，不互相替代。

## 数据质量与价格

治理证据保存来源、版本、内容哈希和审核状态。缺少证据的基础人数、用量和营养保持未知，推算不能写成已核验事实。质量表是补充信息，普通小程序浏览与手动选菜不因缺少 VERIFIED 而全部停用。

缺价保持空缺，禁止猜测或填零。官方参考价保留真实日期，参考估算和实际支出单独记录；实际支出不反写为官方价格，未知用量不自动换算/缩放/估价。

重要原始 Excel、数据库备份、审计报告和运行数据保留，清洗输出新目录并交付规则与审计。本机匿名化数据库不整库替换生产，不盲目重跑含覆盖语义或演示菜的旧 SQL。

## 验证与交付

根入口 `scripts/verify.ps1 -Offline -SkipModelServiceTests` 保留小程序、Python、迁移、网页与 Java 检查。网页锁定依赖、Maven 缓存提前准备；Windows TEMP/TMP 使用任务可写目录，Python/Cairo 使用独立环境。具体命令见 [验证说明](docs/testing/local-verification.md)。

依赖、数据库、JAR、日志、密钥、本机配置和测试输出不提交。提交前核对差异、业务契约、源码/构建物一致性，并记录实际结果与未覆盖范围；不能承诺没有任何潜在问题。

## 生产更新与后续部署

本次统一部署已在用户明确授权下完成，当前状态以 [生产升级记录](docs/operations/2026-10-10-production-release.md) 为准；小程序前端未上传或发布。历史 [线上设计](docs/planning/2026-10-07-online-v4-upgrade-design.md)、[实施计划](docs/superpowers/plans/2026-10-07-online-v4-upgrade.md) 和 [旧候选](docs/operations/2026-10-10-online-v4-candidate.md) 仅供比对，不代表新的生产操作授权。

未来需要匹配 Java/Python/前端/配置、核对实际端口与服务管理，保留数据库/微信/Token 配置，内部令牌仅服务端私密保存。按真实旧迁移血缘生成桥接增量，禁止盲目套新版 V1–V7 或插入演示数据。公开白名单单独确认，备份含业务库、运行文件、私密配置和助手会话库，先做隔离恢复演练。

切换与恢复要求见 [统一替换准备](docs/release/local-maturity-cutover.md)。原 Java 由宝塔管理、Python 由独立服务管理，部署前重新核对；不猜 SSH/面板端口，不叠加常驻 JVM，不以手工热补单个 class 替代匹配整版构建。
