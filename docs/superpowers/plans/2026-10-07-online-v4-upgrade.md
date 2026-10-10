# V4 线上升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 获得对应阶段授权后，用 `superpowers:executing-plans` 按任务实施。本文只准备方案，不启动开发、模型调用、部署、迁移或重启。复选框表示尚未执行，不能把旧合成库验证标成生产验证。

**Goal:** 本地微信开发者工具保持 V4，通过 `https://chishenme.icu/api` 使用经升级验证的线上 Java/Python 和原有真实数据。

**Architecture:** 小程序只接 HTTPS API；Java 维护权威状态与幂等，Python 只读菜库并返回受约束提案。旧数据经逐列/索引/血缘核对与副本桥接后保留，配置和模型/历史侧库独立于代码发布。

**Tech Stack:** 微信原生、Spring Boot/MyBatis/MySQL、FastAPI、Node/Python/Java 检查、SSH、宝塔现有 Java 管理、现有 Python 服务管理。

**Spec:** [线上升级方案](../../planning/2026-10-07-online-v4-upgrade-design.md)。候选源码 `faf3dd7`、当前 316 测试与 44/45 官方编译仅作本地基线。

## 全局约束

- 保持 V4 开启，不切旧预览；线上后端就绪后再与前端 HTTPS/真实微信登录同批切换。
- 规范源码为 `project/`，保留本地分支与未提交成果；不重置、覆盖旧归档或自动 GitHub/微信发布。
- 线上业务数据库为待核对的 `food`；3294 连接拒绝、8004 超时，生产路径/进程/版本/结构/容量未取得实时清单。
- 本文不授权生产写入。阶段 B 只读已获授权；部署前批准具体目标、SQL、测试对象、维护窗口和恢复点。
- 生产不使用 `local-v4`、合成账号、`local_agent`、本地库或样例数据；不运行旧全量初始化/菜库替换/通配终止脚本。
- 已有 Token/微信/模型/DB 私密配置保留，不进入包、日志、聊天；数据库读账号不扩大权限，缺失授权另报。
- 语音固定“抱歉，该功能暂不可用”；官方参考价缺失为空，实付独立、0 有效，采集不开启。
- 日期 Asia/Shanghai；人数 1–50、默认 2；草稿/计划/实际/购物版本分离，unknown 保留原 key 和原 payload。
- 20 次代理模型请求预算已用 15；失败亦计数，余量最多 5，不重置，不绕过服务端计数。
- 样式改 Token 来源后生成；27 页原生验收和稳定基础库选择保留开放。

## 审查重点

1. 两个环境恰好有相同用户 ID 时，本地缓存/unknown 不得写到线上；切环境和登录回调必须检查身份。
2. 旧库同名表但列/唯一键不同、指纹有但文件哈希未知时，不把“表存在”当成兼容，部分 DDL 不能盲重跑。
3. 上线期间旧客户端继续写入、旧 JAR 不识别软删除时，备份与回滚不能丢新记录或复活历史计划。
4. 生产模型超时/错枚举/外来 ID 不得被算成成功或绕过硬排除，预算耗尽不触发新请求。
5. 老服务器真实菜库很大、会话侧库有历史、容量不足时，不复制本地示例或覆盖会话，不叠加超容量服务。

## 任务 O01：恢复只读通道并形成当前环境契约

**Files:** Create `scripts/collect_online_inventory.py`、`tests/test_online_inventory.py`、私有 `work/v4-online/<run>/inventory.json` 与 `schema.json`；Update 方案中的实时事实。

**Interfaces:**

- `redact_inventory(raw: dict) -> dict`：仅允许主机身份、端口、运行版本/哈希、配置键存在性、DB 元数据与聚合数量，禁止 secret、token、完整用户/用餐内容。
- `validate_online_inventory(value: dict) -> list[str]`：检查受批准目标、实际进程/管理方式、TLS/通道、源版本、DB 血缘和容量信息是否完整；缺项使后续执行停止。
- 产出固定 `inventoryId/sourceJarHash/pythonRevision/schemaHash/tableCounts/configKeysPresent`；这成为 O03、O04 唯一生产输入，历史 SERVER.md 仅作定位参考。

- [ ] 写并运行脱敏/错误目标/缺配置/未知 DB 血缘测试；断言密码等输入不会出现在序列化结果，错误目标不能建立连接。Expected：新增实现缺失失败，再最小实现后通过。
- [ ] 使用用户确认的 SSH 地址/端口/本机密钥恢复连接，严格主机校验。8004 仍超时时，不扫描猜测端口、不放宽防火墙、不绕过认证；可以等用户提供已连接的只读通道。
- [ ] 读取实际 Java/Python/Nginx 管理信息和配置键存在性，不输出值；核对 8080/8000、代理路由、运行用户及当前会话路径。数据库查询用受控只读事务，失败不改密码、权限或表。
- [ ] 对表/列/索引/引擎/迁移指纹和数量导出；覆盖字段缺失、重复业务键、异常枚举/JSON/日期、外键与失效菜 ID、费用键冲突，注明全量或抽样的范围。
- [ ] 校正线上 404/500：在正常微信登录的批准测试账号下读正式接口，并对照对应服务器日志；不伪造 token，不把匿名 401 当成功。
- [ ] 清单自检通过后固化哈希；缺 SSH/结构事实时本任务保持未完成，仍可独立做 O02 的离线代码差异。

**完成标准：** 可核对当前服务和现存库，不依赖旧行数/端口猜测；无生产写入。普通文档/清单不要求全量测试。

## 任务 O02：生产 Agent 入口与受测 V4 契约一致

**Files:** Modify `recommend-service/main.py`、`recommend-service/local_agent.py`、`recommend-service/workspace_agent.py`；必要时 Create `recommend-service/workspace_adapter.py`；Test `tests/test_workspace_production_adapter.py`、`backend/src/test/java/com/eatwhat/service/MealWorkspaceProductionGatewayTest.java`，复用 `test_workspace_agent.py`、`test_workspace_model_transport.py`、`test_workspace_evaluation.py`、`MealWorkspaceHttpTransportTest.java`、`MealWorkspaceFallbackTest.java`；Update 配置示例与依赖锁定文件。

**Interfaces:**

- 共享 `run_workspace_request(workspace: dict, user_id: int, *, model=None, execute=None, recommendation_options=None) -> dict`；Java 入参继续 `{workspace,userId}`，内部 `X-Service-Token` 必须正确。
- 推荐选项来源为既有 `backend/src/main/resources/recommendation-metadata.json` 的 `groups`，Python 发布包带相同受校验副本/指定只读配置路径，不能依赖部署后不存在的源码父目录。
- 正常提案保持 `needsInput/constraintsUnderstood/date/mealType/dishIds/criteria/totalCookMinutes`；执行故障明确 `executionStatus=failed/failureClass`，不包含供应商原文。本地预算包装继续注入，不影响生产普通模型工厂。

- [ ] 写纯本地失败测试：生产/本地提示含相同元数据；无内部令牌 403 且模型 0 调用；错餐次须确认；模型故障不得作为澄清样本通过；外来 ID 拒绝、工具供应商元数据不泄漏。Expected：入口不一致处先失败。
- [ ] 最小共享入口与错误分类，发布包可独立定位元数据，保持旧 assistant/chat 契约；不进行真实模型请求。
- [ ] 锁定受测 Python 依赖，不在生产现场随 `>=` 自动升级。保持 reader 只读、内部端点回环监听、外部写入仅 Java。
- [ ] 运行上述 Python 与新增 Java `MealWorkspaceProductionGatewayTest`、既有 HTTP/降级及任务取消、版本/来源回归；Expected：焦点与必要完整检查通过，仍不得标记线上联通。
- [ ] 记录独立源码提交及与 O01 当前版本差异。真实供应商 smoke 留给 O06 的预算授权和强制计数条件。

**完成标准：** 生产入口复现本地行为，无本地样例依赖、故障不误记成功，旧接口可兼容。

## 任务 O03：现存库桥接、备份与恢复演练

**Files:** Create `backend/db/bridges/20261007-online-v4/manifest.json`、按 O01 生成的增量 SQL/契约、`scripts/run_online_v4_bridge.py`、`tests/test_online_v4_bridge.py`；Modify `scripts/audit_schema_lineage.py`；私有 `work/v4-online/<run>/backup/` 与恢复报告。

**Interfaces:**

- `plan_bridge(schema: dict, expected: dict) -> {steps:list,blockers:list}`：仅生成已知缺口；同名冲突、重复唯一键、未知血缘返回 blockers，不产生覆盖/删除方案。
- `apply_bridge(connection, bridge, *, environment, receipt_store) -> dict`：本任务仅允许明确的副本库；固定文件哈希和分步回执，部分成功重试重新核对结构。生产入口必须在 O05 独立批准后启用。
- 描述指纹保留，文件哈希独立记录；原业务数量与新对象预期分别约定，不能用执行后的实际值当自己的金标准。

- [ ] 写 fresh/V4/legacy/mixed/checksum/同名错误结构/重复唯一键/中途 DDL 失败测试。Expected：危险状态停止，恢复和重发不重复、不删除旧行。
- [ ] 基于 O01 真实结构生成差异，保留 `food/users/recipe_records/favorite_dishes`、购物/实付和 assistant 历史。旧菜单不自动转 actual，未知来源/类别/份量不猜。
- [ ] 生产版不运行带六道兜底 INSERT 的现有 V4 文件，不修改原文件哈希来假装已执行；使用单独受审计桥接版本，不上传本地全量替换菜库 SQL。
- [ ] 将必要结构与受保护/脱敏数据恢复到隔离副本；验证备份哈希、SQLite 一致快照与可恢复性，保留原件；MySQL 备份策略按实际引擎制定。
- [ ] 在副本执行完整桥接、重复执行、中途失败后恢复、旧/新应用读写回归和计数/归属/原 ID 对比。Expected：旧对象无丢失、重复执行无新增、结构和权威契约通过。
- [ ] 形成将要申请的**实际 SQL 差异和影响报告**。未有真实结构时只保留设计，不生成声称可用的生产迁移脚本。

**完成标准：** 已在匹配生产血缘的副本证明迁移与恢复，不能只引用上一轮新建合成库成功。

## 任务 O04：最终候选包与生产批准材料

**Files:** Create `scripts/build_online_release.py`、`tests/test_online_release_manifest.py`、`docs/deployment/2026-10-07-v4-release-approval.md`；产物私有 `work/v4-online/<releaseId>/release-manifest.json` 与 Java/Python/前端/桥接包。

**Interfaces:** `build_release(commit, bridge_manifest, inventory_id, out) -> release_manifest`，固定 O01/O02/O03 同一候选的源码/依赖/配置键/包哈希，未满足 gate 则禁止标记 ready。

- [ ] 验证排除 `.env`、真实 YAML、token/DB、助手会话 SQLite、索引、日志、`venv`、本地合成库和旧归档；缺 bridge/inventory/hash 的包不允许 ready。Expected：危险候选被拒绝。
- [ ] 运行项目完整验证、适用原生编译与副本验收，构建最终完整 JAR/Python 包；不热替换零散 class，不把当前基线 JAR当最终包。
- [ ] 列出服务器实际路径、服务实例、只读账号、内部令牌键、V4 开关、私密状态目录与容量限制。缺权限不擅自建账号或开放端口。
- [ ] 批准材料明确：迁移具体差异、冻结写入/维护窗口、实际备份恢复点、配置键变化、Java/Python 切换与重启、指定测试账号和日期餐次对象、回滚影响与停止条件。
- [ ] 将具体材料交给用户批准。Expected：未获生产批准不得进入 O05；仓库同步、WeChat 发布如需执行，另列授权，不隐含在本计划中。

**完成标准：** 用户可评估确定包与确定数据影响，未决内容已解决，批准是执行前最后一步。

## 任务 O05：经批准的受控线上升级

**Files:** 服务器已确认的 Java/Python 发布目录与外部配置、已批准 bridge；Update 执行回执与 O04 发布记录。此任务以批准材料具体路径为准，不照搬旧 deploy.sh。

- [ ] 核对授权、当前服务/DB 身份与 O01 是否漂移；固定源包哈希。Expected：漂移时重新评估，不沿用旧批准改变目标。
- [ ] 冻结业务写入并证明冻结有效，再完成包含实际私密状态的最终一致备份；Expected：备份能恢复，冻结期间不得继续用户写入。
- [ ] 执行批准的分步迁移，每步核对列/索引/数量/回执。Expected：任何失败停止，不盲重跑、不新增未经批准 SQL。
- [ ] 新 Python 与 Java 使用服务器私密配置；保留会话侧库与真实菜库，内部令牌一致，V4 先关闭。使用核对过的服务管理切换/重启；不通配杀进程。
- [ ] 验证基本健康、真实登录、菜库、旧菜单/收藏/购物、内部端点认证与规则提案，匿名/越权请求拒绝。Expected：旧功能无回归且不产生未批准业务记录。
- [ ] 服务和结构就绪后启用服务端 V4，执行限定账号闭环。Expected：新接口可用、幂等/版本有效，再恢复批准的正常写入。
- [ ] 失败按材料恢复应用/数据，先保留新增合法记录与故障现场。Expected：旧应用不识别的新软删除/版本/actual 不能被其写入破坏。

**完成标准：** 服务器实际结果与回执证明升级；不能由本地编译、上传完成或单一健康码替代。

## 任务 O06：本地线上 V4 与逐页验收

**Files:** Modify `utils/config.js`、`app.js`、必要时 `utils/util.js` 与相关环境作用域调用；Test `tests/online-environment-switch.test.js`、账号/unknown/待处理记录回归；Update `docs/planning/2026-10-06-acceptance-matrix.md`；`project.config.json` 稳定基础库；使用既有导出器生成新调试副本。

**Interfaces:**

- `API_BASE_URL='https://chishenme.icu/api'`；`ENABLE_MEAL_WORKSPACE=true`、`ENABLE_LOGIN=true`，保留真实 `wx.login`，不发送 `code:local-v4`。
- 环境/账号/对象绑定贯穿缓存、请求与 pending；作用域升级保留旧数据，不自动迁移 origin 不明的写请求；任何旧响应不能写进新环境。
- 指定测试账号、允许写入的日期/餐次/对象来自 O04/O05，记录真实 native/system/SDK/sourceSHA/evidence，模型调用强制记录余量。

- [ ] 写 localhost→HTTPS 且用户 ID 相同、A→B、登录晚到、未知写请求重放、旧购物草稿/历史交接测试。Expected：跨环境不发送旧 payload、不清空旧成果、正常线上登录走 wx.login。
- [ ] 实施上线配置与必要作用域调整，生成纯运行副本，沿用用户原本地域名检查选择，不复制其他私密设置。Expected：源码一致与资源闭包可核对。
- [ ] 正常微信登录读真实菜库/本人历史，核验身份和新接口；规则路径独立于模型可用。Expected：不再使用16道本地样例，未验证报价保持空缺。
- [ ] 按矩阵逐页执行27页功能、返回、长列表、大字/键盘/安全区；核心闭环覆盖 iOS/Android、同账号两设备、A/B、弱网、原请求恢复。Expected：每项有真实结果，未执行明确保留。
- [ ] 仅有服务端联调预算计数保护时用剩余最多5请求做真实模型最小 smoke；故障分开，60条不能全跑也不宣称全质量通过。
- [ ] 选择实际验收的稳定基础库替换 `trial`，固定最终候选并完成适用回归。Expected：原生证明覆盖最终版本。
- [ ] 交付结果/问题/恢复与预算记录。发布小程序、推送/合并不是本任务自动后续动作。

**完成标准：** 用户在本机开发者工具实际体验线上 V4 与真实数据，原生/服务器/模型/DB 四层证据分开，保留未完成项。

## 本次方案自检与当前未决项

- O01 清单→O03 bridge→O04 release→O05 具体批准和执行有明确输入，不以旧文档参数执行；O02 可先离线开发，本文尚未启动它。
- O02 元数据在独立 Python 发布包有确定路径；O03 描述指纹/文件哈希分离；O06 正式总览路由使用 `/recipe-records/overview`。
- 审查重点1/2/3/4/5分别在 O06/O03/O05/O02与O06/O01与O04有明确验收，不用编译替代原生。
- 当前缺口：SSH8004仍超时；实际生产结构、容量、版本、私密状态路径、正常微信登录与500根因尚未核实；桥接SQL和最终部署包尚未生成。因此本次只完成方案，不能请求批准一份尚未知的数据迁移。
