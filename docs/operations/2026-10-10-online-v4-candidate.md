# 本地两端连接线上 V4：部署候选与批准范围

状态：网页已经合入 `codex/v4-meal-workspace-green-20261003`；完整生产后端尚未替换。本文对应本机候选 `work/online-integration-20261010/candidate-89af2b8-r2/`，不执行迁移、重启或模型联调。

## 已完成的连接与存储工作

本地小程序使用 `https://chishenme.icu/api`、真实微信登录，保留 V4。网页在 `web/` 执行 `npm run dev:online` 后，通过本地服务器访问同一域名的公开目录。两端都不直连 MySQL。

2026-10-10 服务器 MySQL 可访问，现有 Java 健康接口 200，但工作区及公开目录接口 404。运行 JAR 的 SHA256 为 `795afe790140a161ed71eb2ee274d2be4f63c35b93c22dfde097d5da48f6c156`。问题是未部署对应版本及结构，不能以改密码、放开数据库或复制数据代替升级。

按用户单独授权，已创建 `dish_quality_profile`、`dish_quality_revision` 并分别存入 6,665 条记录。全部仍为 UNREVIEWED，未知人数和用量保持未知；原业务表没有写入，旧迁移账本仍 5 条，业务表数量一致。

质量操作前的服务器私有备份：`/var/backups/eatwhat/quality-20261010-f88725b73961/food-before-quality.sql.gz`，SHA256 `583df0694592a054ccb660d66cce361cdeead7a6f7bb203fce647ea18389fd18`。完整 gzip CRC 和导出完成标记已校验；这不等于最新整版部署前的备份或生产恢复演练，整版替换前还须重新备份。

## 具体候选

| 产物 | 内容 / SHA256 |
| --- | --- |
| `eatwhat-backend-1.0.0.jar` | 32,518,164 字节；Java 8 字节码；`6629ce2c273816fa3727fa7bb071205423e7ea1cad6b1a5c4aea98ff8064b933` |
| `recommend-service.tar.gz` | 跟踪的 Python 源码及模板，无密钥、会话、索引或 venv；`a960cc0265a53b438806f25397f2dd5867ca4636503becb0d7d1d7168a9d9aa2` |
| `legacy-to-v4.sql` | 针对实际旧库的增量，避开六道演示菜和旧迁移版本混用；`fe9699f0fed25f1b8da1cafa19507b21fb27efcc92f770605cf66bb6d336945c` |
| `steps.json` | 分步 SQL、变更对象及采购状态影响数量 |
| `proposed-public-dish-ids.json` | 五类各 100 道已存在系统菜，共 500 道；须批准后绑定发布范围 |
| `config-change.example.yml` | 新键的合并说明，不包含真实凭据；默认空白名单不是最终启用配置 |
| `candidate-manifest.json` | 固定源码树、文件大小、哈希及范围 |
| `rehearsal-result.json` | 新建本机隔离库和真实候选 JVM 的验收结果 |

候选来自合并提交 `89af2b8` 的后端/Python源码。后续缓存补修仅改小程序工具、测试与记录，后端候选保持同一版本和哈希。执行前必须重新确认远端及本机后端/Python没有漂移；包内不能出现私密运行文件。

## 迁移影响

新增 15 张表：`meal_consumption`、`meal_mutation_log`、`shopping_mutation_log`、`user_avatar`、`meal_workspace`、`workspace_task`、`workspace_request_log`、`behavior_event`、`shopping_expense`、`ingredient_price_batch`、`ingredient_price`、`ingredient_price_mapping`、`ingredient_price_collection`、`custom_recipes`、`controlled_tool_task`。

补齐 6 个字段：`recipe_records.revision/record_origin/target_people/is_deleted`、`shopping_request_log.request_hash`、`user_preference.default_people`。旧 `users.last_login_time` 已存在，不重复添加。采购来源日期仍为可读字符串，不进行不必要的类型转换。

另有 50 条 `shopping_item` 缺基础人数却标为 CALCULATED：仅把 `calculation_status` 改为 NEEDS_ADJUSTMENT，同时显式保留 `updated_at`。数量、原文、购买勾选、人工覆盖及金额不改。执行时重新确认符合条件行数仍为 50；发生变化必须重新评估，不能按旧数字强行修正。

原菜谱、账号、收藏、历史菜单、购物数量和 ID 保留；没有替换菜库、插入演示菜、填补热量或报价、把历史计划变为实际吃过。新增历史计划人数默认值是兼容用的计划设置，不构成已核验份量，未知用量仍不缩放。旧 `schema_migrations` 不改名、不重写；升级使用独立私有文件回执记录每条 DDL 和文件哈希。

## 已验证与限制

在新建隔离库执行精确候选 SQL后，对原字段逐表摘要核对一致（仅排除获准修正的 calculation_status）；时间戳和旧账本保留。实际候选 JAR 已连接该库：公开菜库 500 条、私人接口匿名 401、测试账户用户信息读取和 V4 晚餐两道菜规则草稿通过。计划和实际仍为空，模型请求 0。临时 JVM 已停止，副本保留。

Python源码全部编译通过；其供应商模型测试仍延后，未把 Java/SQL 演练声明为 Python 联调。生产已安装 FastAPI 0.136.3、uvicorn 0.49.0、pydantic 2.13.4、pymysql 1.2.0、langgraph 1.2.4。本次沿用原 venv，不自动执行浮动版本依赖升级；部署前补齐所有包版本与导入检查，如不兼容先保留现场。

源菜库中早餐合格标签为 0；早餐自动搭配不能宣称可用，也不插入演示菜掩盖缺口。网页全部数据仍未人工核验，自动配餐继续受既有门槛约束，菜库浏览、手动计划和采购可用。网页版个人记录是浏览器本地记录，尚无微信账户同步。本轮没有微信正常账户的生产写验收、真机或跨浏览器发布验收。

## 执行顺序与恢复

1. 重新确认 ECS `i-2ze47ibc4gesc73lt4q7`、域名、运行 PID/cwd/JAR 哈希、MySQL `food`、旧血缘、列/索引/唯一键和容量。云助手当前可用，SSH 私钥未获接受；不因此修改安全组、重置凭据或增加 SSH 公钥。
2. 将已固定的候选文件放到服务器新的 root 私有发布目录，逐件核对哈希；这一步不覆盖运行文件。原 Java 由宝塔管理，Python 服务为 `eatwhat-recommend.service`；不要启动第二套常驻 JVM。原 Java 脚本没有 start/stop 子命令，不能猜测脚本调用方式。按宝塔实际管理机制复核受控停止与恢复，再进入切换。
3. 进入批准的短维护窗口，暂停业务写入口。最新全量备份包括 `food`（含已补质量表）、旧 JAR、Java 私密配置、Python源码、原 `.env`、服务管理/反代配置及助手 SQLite 一致快照。备份权限私有，保存哈希与可恢复证明；不能把运行 SQLite 当普通索引丢弃。
4. 依据分步回执执行 15 表、6 字段与 50 条状态修正；遇到同名不同结构、唯一键冲突或源数量漂移立即停止。MySQL DDL不可整体事务回滚，重试先核对结构和已完成回执，不能整份盲目重跑。
5. 替换匹配的 Java/Python源码，合并新增配置键；数据库、微信与 Token 凭据沿用经核对的原文件。服务器生成一枚非空内部服务令牌并只写私密配置，Java/Python必须一致。生产使用正常入口，不使用 `local-v4` 或 `local_agent`。先关闭服务端 V4 验证旧路由，再启用 V4；公开目录绑定获准的 500 道编号。语音和价格采集保持关闭。
6. 受控重启原 Java/Python，检查仅一个 Java 监听 8080、Python在回环 8000，健康、真实 HTTPS 目录、原认证契约和数据库数量。模型测试不执行；代理和规则路径检查不能扩张为模型质量验收。微信正常登录后的业务写测试限定本人账号和指定餐次，授权前不替他人写入。
7. 若应用失败，先保持新增写入口关闭，再恢复原文件和私密配置；保留新增表和已提交业务记录。出现新增软删除/实际记录后，旧后端不一定安全解释它们，不能盲目重新开放写入。数据库恢复只在核对恢复点和合法新增数据之后执行，不能用整库回滚静默丢失用户的新记录。

当前完整升级未获执行批准。用户此前的线上授权只涵盖两张质量表及相应数据；本次还会影响业务结构、现有服务/配置及公开访问范围，需要单独确认这些具体影响。
