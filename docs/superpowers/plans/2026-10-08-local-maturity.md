# 吃什么本地完整成熟化实施计划

> **For agentic workers:** 使用 `superpowers:executing-plans` 逐任务实施。用户已授权方案完成后直接开始本地开发；普通可逆步骤不重复确认。只有具体生产替换、原件覆盖或真实缺失的外部资料需要另行决定。本计划不要求并行子 Agent。

**Goal:** 在本地完成数据质量提升、前后端衔接及全页面验收，交付一个可复现、可回滚、准备统一替换线上业务的版本。

**Architecture:** Python 版本化治理公开菜谱，Java 是授权事实和写入来源，微信前端展示可信状态并贯通单餐旅程。用新建隔离 MySQL 演练旧库桥接，保留 ID、历史快照和用户关联；候选包的代码/数据/迁移/配置版本必须一致。

**Tech Stack:** 微信原生、Node 测试、Spring Boot 2.7/MyBatis/Java 8 目标、Python 3.12、MySQL 8.0、现有本机 CLI。无需新增模型供应商或架构重写。

**Spec:** `docs/superpowers/specs/2026-10-08-local-maturity-design.md`。

## 实施状态（2026-10-08）

实际进度和每项证据以 `docs/testing/2026-10-08-local-maturity-results.md` 为准。代码、全量数据、本地导入/恢复演练及主流程已实现；来源人工核验、原生逐页与真机、外部模型和线上替换仍有独立门禁。下方复合验收清单未全部打勾表示其完整条件仍未满足，不表示完全未实施。

## Global Constraints

- 源码从固定 `bdc88ce` 开始；不覆盖两份既有未提交文档及 `.local-v4`。
- 原 Excel/SQL ZIP/CSV 不变；数据清洗生成新版本；菜谱 ID、私人菜、历史计划和实际快照保留。
- 缺价格、无依据克数/份数/热量保持未知；参考价与本次每食材实付独立。
- V4 开启、语音提示 `抱歉，该功能暂不可用`；真实模型调用和供应商测试暂停。
- 所有写入测试只能对回环地址的新建本机库；线上本轮只读，不迁移或替换业务。
- 全部页面沿用当前视觉与行为合同；不删确认、等待、失败、恢复、权限和来源反馈。
- 人工来源核验与真机结果不能由自动化代签；未完成项必须留在发布门禁。

## Review Focus

1. 账号切换或日期变化时的迟到响应，不能写入另一账号/另一餐；L08/L09 行为测试覆盖。
2. 字符串为合法正数但没有配方来源，不能进入份量/价格计算；L02/L05 覆盖。
3. 旧库同号异名迁移、同名列不同类型和历史快照差异，不能跳过或覆盖；L06 真实 MySQL 演练覆盖。
4. 弱网写入成功但回执丢失，重进仍使用原请求，不假成功；L09 原请求恢复测试覆盖。
5. 私菜、下架公菜、未知元数据与早餐无候选时，浏览/规则/模型均遵守授权和诚实失败；L04/L11 覆盖。

## 执行和进度规则

按 L01→L14 实施，每项写实测结果和未完成门槛到 `docs/testing/2026-10-08-local-maturity-results.md`。文档/样式不机械套 TDD；行为和数据规则先写针对原始症状的失败测试。任务完成才勾选。不得为让列表全绿编造可信菜或绕过验收。每轮开发产出可用结果，尚未完成的阶段保持明确状态。

### L01：对齐源码和固定输入基线

**Files:** 新增本计划/设计/验收记录；保留既有未提交文件。

**接口:** 输入固定 Git 提交、ZIP/Excel/CSV；输出 `source-baseline.json`（SHA、规模、列口径），位于忽略的 `.test-artifacts/maturity/`。

- [ ] 核对工作区无产品未提交修改，从当前分支建立 `codex/local-maturity-20261008`，合入已下载的 `bdc88ce`，出现冲突逐项比较，禁止 reset/丢弃。
- [ ] 校验源码/原件哈希，记录非模型基线；沿用专用 Python/Maven 依赖，不装系统依赖。
- [ ] 执行 Node、非模型 Python及 Java 适用基线检查；既有故障记录归因。

### L02：全量质量治理管线

**Files:** Create `scripts/catalog_quality.py`, `scripts/build_catalog_quality.py`, `scripts/catalog-quality-rules.json`, `tests/test_catalog_quality.py`。

**接口:** `profile_catalog(rows) -> dict`；`normalize_recipe(row, rules, review=None) -> dict`；`build_bundle(source_csv, out_dir, review_file=None) -> manifest`。输出 `recipes.csv`, `quality.jsonl`, `issues.csv`, `changes.jsonl`, `review-candidates.csv`, `manifest.json`, `audit.md`，全部新目录。

- [ ] 测试固定糖55克/常规补全/统一份量不被标 VERIFIED，数值为空但原值保留；快手/干锅退出有效材料且有修订；同义项只警示；0热量为空；私人行不进入公开包；ID重复/损坏材料中止。
- [ ] 实现全量缺失、重复、材料/单位/范围/类别分布和步骤一致性剖析，规则版本与输入哈希写 manifest。
- [ ] 生成 6,665 行新数据版本，逐 ID 验证无新增/删除、原件哈希不变；为每项自动修订保存原值、原因和新值。
- [ ] 候选50–100按类别/常用场景分层，明确状态 UNREVIEWED；统计不得冒充可信覆盖率。

### L03：可审阅的可信菜谱核验流程

**Files:** Create `docs/data/catalog-review-standard.md`, `scripts/validate_catalog_reviews.py`, `tests/test_catalog_reviews.py`。

**接口:** 审阅 JSONL 包含 `dishId/sourceHash/sourceRef/reviewer/reviewedAt/basePeople/ingredientEvidence/stepStatus/imageRights/cookedAt`；`validate_reviews` 拒绝无证据 VERIFIED、错版本、非法数量、缺原份数。

- [ ] 定义字段状态、人工核验、实做和图片许可各自的标准。
- [ ] 写校验器与测试：未知值合法；无来源假核验、过期内容哈希、跨菜证据及反向范围拒绝。
- [ ] 产出首批复核包；能从现有真实原始资料恢复事实则记录定位，资料缺失留待人工核验，禁止用模型/常规配比补精确量。

### L04：质量数据库与统一授权读取

**Files:** Create `backend/db/migrations/V7__catalog_quality.sql`；Modify manifest、`entity/Dish.java`、`service/DishQueryService.java`；Create `mapper/DishQualityMapper.java`, `service/DishQualityService.java` 及 Java 合同测试。

**接口:** `DishQualityService.enrich(Dish)` / `enrich(List<Dish>)`，返回 `quality` 与 `ingredientFacts`；`dish_quality_profile` 和 `dish_quality_revision` 按设计保存原文/独立状态。

- [ ] 迁移新增表，不修改历史 SQL/checksum；验证空库、真实 MySQL和重复执行。
- [ ] 授权读取后再按菜谱ID附加质量，批量查询避免 N+1；无资料显示未知；仅本人私菜可读，私菜录入不能提升成系统 VERIFIED。
- [ ] 测试隐藏公菜、他人私菜、历史快照、未知质量和数据版本变动；内容版本包括用户可见有效事实。

### L05：采购、详情、价格使用可信事实

**Files:** Modify `ShoppingPreviewService.java`, `DishContentVersion.java`, `pages/dish-detail/*`, `pages/shopping-preview/*`, `utils/shopping-prices.js`；Create 对应质量/采购 Java 与 Node 测试。

**接口:** 原有 DTO 保持兼容；新质量记录优先，数量未知时 `NEEDS_ADJUSTMENT`、`quantityValue=null`、警示明确；只有材料/数量/份数/单位同时可信才 `CALCULATED`。

- [ ] 原始固定量不展示成确认用量；详情显示“用量待核实”，来源按需展开，未知热量不展示0。
- [ ] 自动计算阻断未知质量，保留用户显式手动改量；参考估价仅计算可信合计，缺价留空，实付保持独立。
- [ ] 测试52条描述词没有采购伪材料、未知基准、不同规格、用户覆盖、0实付、多人缩放和已有材料勾选。

### L06：旧库桥接器与可恢复迁移演练

**Files:** Create `scripts/legacy_dump.py`, `scripts/bridge_legacy_local.py`, `tests/test_legacy_bridge.py`, `docs/database/legacy-to-v4-local-bridge.md`。

**接口:** `parse_dump(zip_path)` 仅解析允许的 CREATE/INSERT；`plan_bridge(schema, manifest)->operations`；执行器只接受本机新建前缀库和显式演练配置，输出 `bridge-report.json`（血缘、对象数量、差异、恢复点）。

- [ ] 复用已审计解析思想，加入唯一键列名大小写、转义/可执行注释和字段数回归；不把DROP/USE直接执行。
- [ ] 新库导入匿名化账户和旧对象；保留计划快照/收藏/清单/回执；生产身份不落仓库。
- [ ] 根据真实 schema 生成新增步骤，验证旧 source_date 格式，再变更为 DATE；处理列类型兼容并保留旧版本记录，当前迁移另按对象事实记账。
- [ ] 修正50项缺基准却CALCULATED的历史展示状态，保留原量/修订证据；不把旧计划造为实际。
- [ ] 真 MySQL演练重入/断点/非法日期/未知血缘停止；85账户关联、14计划、10收藏、24菜81项承接统计一致；回滚用隔离备份恢复证明。

### L07：完整本地环境和数据导入

**Files:** Create `scripts/start_local_maturity.ps1`, `scripts/local_maturity.py`；Modify 本地说明和纯净微信导出脚本适用规则。

**接口:** `start/status/stop` 保持自有进程检查；新环境 `.local-maturity-active/`，API18780（若被占用先确认拥有者），MySQL随机回环端口；外部模型禁用。

- [ ] 启动新隔离环境，导入桥接演练数据与质量包，保留旧 `.local-v4`；本机登录为合成身份。
- [ ] 验证健康、全量分页/搜索、V4手动/规则生成和旧历史读取，重启保持本地记录。
- [ ] 导出只含运行资源的微信项目，版本与本地API对应；不要把脚本、备份和无权限临时目录带进工具。

### L08：登录和日期目标生命周期

**Files:** Modify `app.js`, `pages/profile/profile.js`, `utils/meal-workspace.js`, `utils/meal-workspace-page.js`；Create `tests/login-readiness.test.js`, `tests/workspace-day-boundary.test.js`。

**接口:** `doLogin()->Promise<{success:boolean,reason:string}>`；`resolveActiveTarget(mode, params, stored, now)` 区分今天、显式历史和待确认选餐。

- [ ] 测试等待、超时/拒绝/失败、并发登录共享Promise、迟到旧身份不写新账号。
- [ ] 今天页跨自然日恢复当天；显式历史编辑和待确认餐保持日期；增加回今天动作；工作区草稿按账号和餐保留。
- [ ] 测试23:59→00:01、历史餐跳转、标签页返回、长时间后台和账号切换。

### L09：选菜接回本餐与可靠恢复

**Files:** Modify `pages/dish-detail/*`, `pages/favorite-dishes/*`, `pages/meal-cooking/*`, `pages/calendar-detail/*`, `utils/meal-actual-entry.js`, `utils/meal-workspace-page.js`。

**接口:** 复用 `pendingWorkspaceSelection` 与共享实际写入入口；新行为不绕过服务器校验。

- [ ] 详情/收藏加入本餐，已选去重、锁定项不丢、目标日期显著；含他人私菜/下架/超10道时不提交。
- [ ] 做饭冲突的动作返回当前工作区，重新核对后进入最新快照；进度和实吃分离。
- [ ] 日历详情复用持久实际请求日志；未知请求重新进入仍恢复原payload/requestId，不重复记实吃。
- [ ] 冲突按钮写“读取最新安排”，直到真正实现差异对照；每条错误有恢复入口。

### L10：菜单、回顾、空态和入口层级

**Files:** Modify `pages/customize/*`, `pages/profile/*`, `pages/calendar/calendar.js`, `pages/statistics/*`, `pages/assistant-history/*`, `pages/shopping-list/*`, `templates/meal-workspace.wxml` 及相关设计模板。

**接口:** 使用现有个人菜单/六块回顾/受控流程合同，不删已实现恢复机制。

- [ ] 菜单列表先于编辑表单，“我的”增加菜单入口，编辑和使用场景清楚。
- [ ] 确认计划为唯一主要动作，保存并回顾移低频入口，仍能恢复部分完成任务。
- [ ] 所有回顾入口传日期周期；首屏真实摘要，技术信息折叠；空/错误/完成分态。
- [ ] 统一单菜/整餐时长名称、当前要求保存状态、私房菜/菜单名称；买齐、历史空、回顾空各有下一步。
- [ ] Node行为测试覆盖原症状及路由，离线布局检查320/390px与大字，保留当前品牌样式。

### L11：授权菜库、偏好与智能适配器统一

**Files:** Modify `MealWorkspaceTaskRunner.java`, `MealWorkspacePlanner.java`, `recommend-service/workspace_agent.py`, `main.py`, `local_agent.py`；Create `service/WorkspaceAgentContextService.java` 和纯数据合同测试。

**接口:** `agentContext` 含授权候选、本人菜单摘要、偏好、收藏与近期明确实吃，含数据版本；候选来自Java同一约束排序，Python工具只能搜索/读取该集合。

- [ ] 只用认证用户、显式目标与有限候选；本人私菜支持读取，他人私菜不出现在请求或检索索引。
- [ ] 正式/本地注入同一推荐目录和失败结构；锁定私菜可从同一候选读出。
- [ ] 无模型时保留手动/规则路径；本轮只验证数据合同、授权与代码编译，不启动真实模型/供应商测试。
- [ ] 后续模型统一验收清单涵盖否定改口/他人身份/私菜/无候选/超时/跨日期/部分失败，不提前标通过。

### L12：27 页、全功能连续验收

**Files:** Create `docs/testing/local-maturity-page-matrix.md`, `scripts/check_local_maturity.py`；更新验收记录。

- [ ] 从 app.json 自动枚举全部27页，逐页记录入口、登录/权限、加载/空/失败/完成、返回与适用写入，不把“模板存在”记作交互通过。
- [ ] 真实本地HTTP完成：规则选餐→锁换→确认→采购→做饭快照→按计划/变化实吃→周回顾→菜单复用；补弱网未知、跨日、账号隔离与冲突。
- [ ] 官方微信编译和模拟器逐页操作，覆盖320px、大字、键盘、Sheet、底部安全区；用户继续可用微信开发者工具体验。
- [ ] iOS/Android真机、来源人工核验/实做、外部模型统一评测保持独立门禁；缺条件写明原因和具体剩余任务。

### L13：统一版本候选发布包

**Files:** Create `scripts/package_maturity_release.py`, `docs/release/local-maturity-cutover.md`，配套打包测试。

**接口:** 输入Git提交、质量manifest、迁移manifest、实测证据；输出新目录 `release-manifest.json`、前端纯净资源、JAR、Python源、公开数据、桥接/导入脚本、配置模板和回滚说明；状态只有 DRAFT/READY_FOR_REVIEW，不自动部署。

- [ ] 检查所有版本/哈希，拒绝用户备份、凭据、模型密钥、本机SQLite/MySQL文件和运行日志进入包。
- [ ] 发布前新备份及增量、停写窗口、服务顺序、旧客户端兼容、健康与核心任务复核写具体操作；未知服务版本先只读核验。
- [ ] 回滚保持旧快照和新增表兼容，清晰区分代码回退与数据恢复；不得将本地演练库覆盖整个生产库。
- [ ] 必须门禁未通过时只交付DRAFT及阻断清单；全部有证据后再请求具体生产替换审批。

### L14：远期能力独立推进条件

**Files:** 本计划后续任务区及产品研究对应清单。

- [ ] 多餐：在可信候选、约束一致、部分失败恢复可用后，另写多目标预览确认合同。
- [ ] 轻库存/照片：只提出待核对食材，不自动认定准确余量或过期时间；先验证输入负担与收益。
- [ ] 营养：取得可授权的可靠营养数据、可换算材料和实吃份量后再实现，不从全零字段算健康分。
- [ ] 家庭协作/提醒：明确成员权限、历史归属、微信实际类目/模板与用户选择后单独实施。

## 完成定义

本地实现完成：L01–L11及L12可执行的本地检查通过、原件保全、完整数据和使用流程可体验、未验证项明确。发布候选完成：L13产物可复现且无凭据。线上替换完成：独立批准并执行发布/迁移、真实核心任务复核与回滚检查通过。三个完成状态不可混用。
