# V4 验收基础与单餐体验实施计划

> **For agentic workers:** 后续获得具体开发授权后，使用 `superpowers:executing-plans` 逐项实施；只有用户选择分工或适用指令明确要求时采用 `superpowers:subagent-driven-development`。本文件是计划，不启动实施、派工或发布。任务使用复选框记录执行状态。

**Goal:** 在保持 V4 业务契约和旧成果可恢复的前提下，建立可复现验证环境，完成当前餐到做饭、采购与实际记录的首批体验改进。

**Architecture:** 沿用微信原生页面、共享工作区 Store、Java/MySQL 权威业务状态及 Python 只读模型适配。优先补验证和迁移血缘，再通过纯视图模型与既有领域接口完善体验；新增做饭进度仅作为本机辅助状态。

**Tech Stack:** 微信原生小程序/glass-easel、Node test、Python unittest、Spring Boot 2.7.14/MyBatis、Java 8 交付目标、MySQL 8、PowerShell。现有环境版本见对齐报告，不能把开发 JDK 版本等同于交付字节码目标。

**Spec:** [后续开发总方案](../../planning/2026-10-06-development-roadmap.md)、[验收矩阵](../../planning/2026-10-06-acceptance-matrix.md)。

## 全局约束

- 固定起点 `c1525506035ca79f500d2665be0fbd01ea3d1ccd`，实际开工先核对 HEAD 和本地差异。
- 25 条既有路由、4 Tab 和 15 个公共组件保持兼容；新增做饭页之后验收矩阵扩展为 26 页。
- 前端 `ENABLE_MEAL_WORKSPACE=false`、Java `MEAL_WORKSPACE_ENABLED=false` 保持生产默认；测试只使用明确隔离配置。
- 业务日期为 `Asia/Shanghai`；人数 1–50，首次默认 2；手动菜数不随人数重置。
- Java 负责归属、版本、幂等、快照和事务；模型理解不代替服务端验证。
- UI 保留原 key/原 payload 的未知结果恢复、输入保留、确认与同步反馈。
- Token 来源为 `design/tokens.json`、`design/theme.wxss.tpl` 和 `design/wxss/**`；不手改生成样式。
- 旧原始数据和生产配置不进入测试包；本文不授权生产访问、迁移、推送或发布。
- 不删除失败测试，不把 `-DskipTests` 打包当成业务验证。普通文档任务不套用无意义 TDD。

## 审查重点

| 易漏条件 | 必须保证 | 所属任务 |
|---|---|---|
| 曝光失败与真正保存失败同时出现 | 埋点不污染业务反馈，保存错误仍可见 | 任务 3 |
| 已有实际记录但计划后来修改 | CTA 指向真实当前对象，不修改历史 actual | 任务 4、7 |
| Sheet 打开后切账号/目标或页面卸载 | 旧输入与回调不能写入新工作区 | 任务 5 |
| 计划或配方版本变化但本机已有步骤进度 | 不把旧步骤与新配方拼接；提示核对 | 任务 6 |
| 购物仅改名称、超时且用户再次打开编辑 | 原数量警告保留，未知请求不被新 payload 替换 | 任务 7 |

## 执行次序

B1：任务 1、3。B2：任务 2。B3：任务 8 的基线部分，可与不依赖设备的工作交错。B4：任务 4、5。B5：任务 6、7，然后任务 8 最终验收。

代码任务分别形成可审阅变更；需要同步接口变更时前后端同批交付。首批不实现跨模块写 Agent、营养、家庭或价格/语音移植，后者按总方案 T13–T18 单独展开详细计划。

## 任务 1 建立可复现的隔离验证入口

对应 T01，优先级 P0。当前基线检查和环境问题证据见[对齐报告](../../planning/2026-10-06-local-alignment.md)。

**Files**

- Modify: `scripts/verify.ps1`、`recommend-service/requirements.txt`（仅在确认缺失运行依赖时）、`DEVELOPER.md`。
- Create: `scripts/requirements-verification.txt`、`docs/testing/local-verification.md`、`scripts/check_test_environment.py`。
- Test: `tests/test_verification_environment.py`，使用临时目录与合成配置。

**Interfaces**

- 验证脚本拟增加参数 `PythonExecutable`、`MavenExecutable`、`MavenRepository`、`Offline`；默认尊重已显式指定的环境。
- `check_test_environment.py --manifest <path>` 只验证测试配置，不启动服务；输出 `{safe, blockers, toolVersions}`，非隔离目标退出非零。
- 测试 manifest 记录源提交、环境标识、API 主机、数据库绑定地址和数据目录、测试资产路径；不记录密码。
- 普通 Mock 回归与真实 MySQL/HTTP 入口分开；后者必须显式提供隔离清单。

- [ ] 记录本机工具、依赖、原生编译器和配置来源；不输出 `.env` 值。
- [ ] 为测试环境校验写用例：生产域名拒绝、非回环 DB 拒绝、数据目录越界拒绝、缺失配置拒绝、正确隔离 manifest 通过。
- [ ] 运行 `python -m unittest discover -s tests -p test_verification_environment.py -v`，确认新增危险配置在实现前被测试发现。
- [ ] 实现参数化和前置依赖检查，声明 CairoSVG 及其 Windows Cairo 运行时要求；只在测试依赖中固定经过验证的版本，不修改全局 Python。
- [ ] `verify.ps1` 每阶段独立记录命令、退出码、通过/失败/跳过数；子进程失败必须阻止“全部通过”。Java 核查本次生成的测试 XML。
- [ ] 在无运行配置、无旧 target 的导出副本运行完整验证；检查 Java class major version 与 Java 8 交付目标相符。
- [ ] 输出可复现文档和脱敏验证摘要，注明 MySQL/HTTP/模型/原生是否实际执行。

完成标准：干净源码按文档能稳定运行普通回归；缺依赖是明确前置失败，不依赖旧机器目录或旧测试报告。不得为此连接生产。

## 任务 2 迁移血缘与旧行为承接设计

对应 A01/A02/T00，优先级 P0。该任务先交付设计与离线检查，真实库操作另按授权范围执行。

**Files**

- Read: `backend/db/migration-manifest.json`、`backend/db/migrations/`、旧归档中的迁移与助手/价格/语音测试。
- Create: `docs/database/v4-lineage-bridge-design.md`、`scripts/audit_schema_lineage.py`、`tests/fixtures/schema-lineages/`、`tests/test_schema_lineage.py`。
- 后续桥接 SQL 文件名在血缘核对后分配，不能覆盖现有 V3/V4。

**Interfaces**

- `audit_schema_lineage.py --schema-json <export> --manifest <file> --out <new-report>`：输入结构/迁移记录的脱敏导出，输出 lineage、版本/checksum/列/索引冲突及阻断项；无数据库连接能力。
- 血缘枚举：`fresh`、`v4_workspace`、`legacy_local`、`mixed_or_unknown`。
- 旧行为映射表每条含 `oldEvidence`、`v4Owner`、`equivalent|missing|changed`、`regressionCase`、`decision`。

- [ ] 建立全新、V4、旧本地、混合、checksum 不符五组合成结构样本。
- [ ] 验证未知/混合/同名不同 checksum 必须阻断，不能因编号最大就认为升级成功。
- [ ] 逐表梳理计划版本、实际历史、购物来源、回执、草稿身份和价格数据；明确保留/转换/隔离策略。
- [ ] 从旧助手六个独有提交提取快照、任务预算与重试案例；先写适用于 V4 的契约测试，再决定是否需要产品修复。
- [ ] 为纯 V4 新库、旧血缘桥接、重复执行、部分执行失败和恢复定义独立演练步骤与预期对象数量。
- [ ] 输出新旧客户端/API 兼容矩阵，重点覆盖购物新版本字段和工作区 404；冻结不能原样合并的文件列表。

完成标准：能解释每条旧迁移和关键数据的去向，未知血缘安全停止；不宣称当前生产 schema 已核实。生产检查和迁移需后续具体授权。

## 任务 3 遥测反馈与版本说明

对应 T04，优先级 P1，可先于新体验推进。

**Files**

- Modify: `utils/meal-workspace-page.js`、`templates/meal-workspace.wxml`、`pages/profile/profile.js`、`pages/profile/profile.wxml`、`README.md`、`DEVELOPER.md`。
- Create: `utils/product-release.js`、`tests/workspace-feedback.test.js`。

**Interfaces**

- `product-release.js` 导出 `{version, capabilityStage}`；版本值由当前发布策略确定为开发版，不将本地规划描述成线上新版本。
- 复用现有 `expose(w)`；去重 key 为账号/API/workspace/planVersion，诊断仅记录错误码和对象标识。
- 不改变 API、数据库或 `canConfirm` 的业务计算。

- [ ] 新增回归：expose 拒绝时 `errorMessage`、`syncStatus` 和主 CTA 不变；真正保存失败仍显示并保留 pending 请求。
- [ ] 新增账号切换后旧 exposure 失败不更新新页面，成功 planVersion 不重复发送的断言。
- [ ] 运行 `node --test tests/workspace-feedback.test.js` 确认先失败。
- [ ] 删除业务提示区对纯曝光失败的依赖。重试最多追加 2 次，延迟 2 秒/10 秒，离开页面或账号变化取消；下一次主动进入可重新尝试未成功曝光，requestId 保持确定性。
- [ ] 更新实际能力说明和版本展示，清除无依据“精确热量”表述；旧服务器示例移到明确历史说明，不能成为现行部署命令。
- [ ] 运行专项和完整前端回归；检查文案变更没有删除保存、权限、冲突和未知状态提示。

完成标准：非业务错误不妨碍一餐操作，产品文案和版本状态一致。文档修正只做链接和事实校验，不新增镜像实现的测试。

## 任务 4 当前餐状态和主 CTA

对应 T05，依赖任务 1 和原生基线。

**Files**

- Create: `utils/meal-workspace-presentation.js`、`tests/workspace-presentation.test.js`。
- Modify: `utils/meal-workspace-page.js`、`templates/meal-workspace.wxml`、`design/wxss/styles/workspace.tpl`。
- 通过 `scripts/build_ui_assets.py` 更新对应生成样式。

**Interfaces**

- `deriveWorkspacePresentation({workspace, linkedPlan, actual, syncStatus, busy, localProgress})` 返回 `{primaryAction, primaryLabel, disabled, showRequirements, conditionSummary, secondaryActions}`。
- 该函数只派生 UI，不写业务状态、不生成新 revision、不请求 API。
- `primaryAction` 仅映射既有 handler 和后续做饭 handler；禁止模型直接指定按钮执行地址。

- [ ] 用总方案状态表建立表驱动测试，覆盖空、生成、草稿、待重生成、待澄清、已计划、实际已记录、未知、冲突和离线。
- [ ] 额外覆盖 actual 存在但 plan 被改、状态 planned 但 linkedPlan 为空、stale planVersion、跨午夜目标不变。
- [ ] 运行 `node --test tests/workspace-presentation.test.js`，确认新派生规则尚未实现。
- [ ] 实现状态优先级和唯一高强调动作；有菜单时折叠输入，条件摘要区分已验证/待确认。
- [ ] 保留换一道、保留、解除、撤销、自己选菜、采购和历史入口；确认按钮显示具体餐次。
- [ ] 重建资产后检查只改变预期产物；运行 `node --test tests/workspace-presentation.test.js tests/workspace-page.test.js tests/ui-self-check.test.js`。
- [ ] 原生验证字体放大、长菜名、320 逻辑 px、底栏、安全区和禁用/加载状态。

完成标准：每个状态有清楚下一步；视觉改变没有改变后端写入条件。原生未执行时只交付代码状态，不标体验验收通过。

## 任务 5 同餐需求面板

对应 T06，依赖任务 4。

**Files**

- Modify: `templates/meal-workspace.wxml`、`utils/meal-workspace-page.js`、`pages/chat/chat.js`、对应 `design/wxss/` 模板。
- Test: `tests/workspace-requirements-sheet.test.js`，复用 `tests/workspace-page.test.js` 的页面测试方式。

**Interfaces**

- 新 handler `onOpenRequirements`、`onRequirementsDraftInput`、`onCancelRequirements`、`onApplyRequirements`。
- Sheet 编辑 `requirementsDraft`，打开时捕获账号、workspaceId、日期餐次及 revision；应用走现有 context 修改接口。
- 取消只丢弃 Sheet 尚未应用编辑，保留打开前输入；不改变长期偏好和现有菜单。

- [ ] 测试取消、成功应用、保存失败保留、账号切换、切目标、页面隐藏/卸载、服务端 revision 变化。
- [ ] 运行 `node --test tests/workspace-requirements-sheet.test.js`，确认新行为红灯。
- [ ] 使用已有 `ui-sheet` 实现，默认当前餐内表达；高级历史对话继续进入 chat 路由。
- [ ] 应用成功后旧菜单标为待重新安排；未解析新文字不显示已满足。
- [ ] 原生验证键盘、中文输入法组合、长文本、返回、关闭手势和按钮可见性；系统关闭不误提交。

完成标准：首页和 chat 操作同一工作区，取消不误存，失败输入不丢，旧多餐导入仍可用。

## 任务 6 整餐做饭模式

对应 T07，依赖任务 4，并使用真实计划快照契约。

**Files**

- Create: `pages/meal-cooking/meal-cooking.{js,json,wxml}`、`utils/cooking-progress.js`、`design/wxss/pages/meal-cooking/meal-cooking.tpl`。
- Modify: `app.json`、`design/wxss-manifest.json`、`utils/meal-workspace-page.js`，必要时复用详情适配函数。
- Test: `tests/meal-cooking.test.js`、`tests/cooking-progress.test.js`；更新路由数量相关检查。

**Interfaces**

- 页面参数为 `date`、`mealType`、`planRevision`；从认证后计划对象读取菜品，不信任 URL 中的完整配方。
- `loadProgress({scope,date,mealType,planRevision})`、`saveProgress(key,{dishId,stepIndex,completedSteps})`、`clearProgress(key)`；存储显式标记 `scope=local`。
- recipe snapshot 缺少步骤时核对当前菜品版本；不一致则返回 `needsReview`，不混合展示。

- [ ] 测试三道菜可切换、各自步骤恢复、账号隔离、菜被删除/不可访问、计划变更、损坏本机缓存。
- [ ] 断言完成做饭不调用 `meal-consumptions`，进度切换不改变 planRevision。
- [ ] 运行 `node --test tests/meal-cooking.test.js tests/cooking-progress.test.js`，确认新模块未实现时失败。
- [ ] 实现首版全部菜列表与步骤切换，使用既有 Token；入口不再固定跳第一道菜。
- [ ] 更新 26 路由验收清单及图标/资源构建清单；保留原单菜详情深链接。
- [ ] 原生验证长步骤、大字体、退出恢复、手机锁屏后恢复；不加入默认常亮和后台计时承诺。

完成标准：整餐各菜可连续查看，进度诚实可恢复，配方版本和实际记录边界明确。

## 任务 7 采购任务层级和快速实际记录

对应 T08/T09。实施时建议分两个可独立验收的变更，避免样式与统计口径互相遮蔽。

**Files**

- Modify: `pages/shopping-list/`、`pages/shopping-preview/`、`pages/calendar-detail/`、`pages/statistics/`、对应 `design/wxss/` 模板。
- 必要时 Modify: `utils/shopping-list.js`、`utils/shopping-ingredients.js`、`MealConsumptionService.java`、`DietReviewCalculator.java`，只为明确缺口改后端。
- Test: 复用 `tests/shopping-drafts.test.js`、`tests/shopping-edit-intent.test.js`、`tests/v4-business-contracts.test.js`、Java actual/history/shopping 契约测试；为新入口增加最小行为回归。

**Interfaces**

- 清单继续使用当前云端 `version` 与 `expectedListVersion`；展示筛选不修改云端勾选。
- actual 继续使用 `{status,usePlan,dishes,expectedRevision,expectedPlanRevision,requestId}`。
- 快速入口与日历详情复用同一保存方法；不新增另一套“已吃”标志。

- [ ] 先记录原始失败/负担场景，区分展示排序、聚合算法和领域写入。
- [ ] 断言部分已购、混合单位、改名不改量、明确输入同量、离线与未知结果、跨设备 conflict。
- [ ] 实现待买优先和来源渐进展开；清空已买/全部各有范围说明和确认。
- [ ] 实现按计划吃了/有变化/没做的低负担入口，外食自由文本保持未知分类。
- [ ] 断言重复请求、同餐编辑/撤销、删除计划后 actual 保留、未来禁止吃过、回顾证据跳转。
- [ ] 运行对应 Node 回归；若 Java 改动则运行完整 Java test package，并补适用的隔离 DB/HTTP 测试。
- [ ] 原生确认购物勾选和实际记录是两个独立动作，错误/冲突可恢复。

完成标准：采购首屏能直接买菜，实际记录可快速纠正；无数量、历史或统计回归。

## 任务 8 原生 模型和发布验收

对应 T02/T03 和 M0/M1 出口。此任务分基线阶段和最终阶段，环境未变的有效证据可复用。

**Files**

- Create: `tests/fixtures/workspace-evaluation.jsonl`、`scripts/evaluate_workspace.py`、`docs/testing/model-evaluation.md`。
- Update: [验收矩阵](../../planning/2026-10-06-acceptance-matrix.md)及版本化运行记录。
- 执行日志、录像和失败输入存私有产物目录；仓库只保留脱敏摘要与引用。

**Interfaces**

- 评测输入至少含 `caseId`、`context`、`request`、`expectedTarget`、`requiredConstraints`、`expectedWritePolicy`、`expectedOutcomeClass`。
- 输出含 `caseId`、模型/提示词/数据版本、实际对象与约束断言、调用数、耗时、费用统计与失败原因。
- 真实评测入口必须显式选择测试环境和最大调用/费用预算；无预算时只校验 fixtures/schema，不偷偷调用模型。

- [ ] 固定十类任务族和失败判据，正常任务与拒绝任务分开计成功率。
- [ ] 安排 iOS/Android、窄屏、系统大字、键盘、权限拒绝、弱网及双设备原生测试；无环境项标为未执行。
- [ ] 在授权隔离环境执行三餐 HTTP、MySQL 事务和双 JVM 恢复，保存本次证据；已有历史记录单列。
- [ ] 对真实模型统计 P50/P95、成功率、约束违规、超时/澄清、调用量和费用，不调高预算掩盖循环问题。
- [ ] 通过审阅的稳定基础库替换 `trial`，再次执行适用原生验证。
- [ ] 复核迁移、兼容版本、开关、监控、数据保留和恢复步骤，形成具体发布包清单。
- [ ] 将发布包、证据、剩余风险和回滚方案交给用户决定生产发布；本计划本身不触发发布。

完成标准：自动、数据库、模型、原生、数据质量各有独立结论，P0 问题关闭后才能申请发布。M0/M1 完成不代表 T13–T18 已实现。

## 每项任务的交付格式

写明用户问题、基准/最终 SHA、文件范围、行为变化、验证命令与结果、未执行项、数据/费用影响和回滚办法。代码变更提交前检查差异范围和私密文件；是否推送/开 PR 按当次授权执行，不自动合并。

下一步首先执行任务 1 与任务 3。后续跨模块 Agent 应以总方案的领域动作、步骤回执和三个复合任务为依据单独展开实现计划；营养与家庭功能使用各自的数据/权限设计，不在本批插入实现。

## 本次执行范围调整与状态

用户已授权在当前本地项目开启 V4、承接价格/实付，并明确语音暂不落地：按钮显示“抱歉，该功能暂不可用”。这些最新请求覆盖本计划原先的默认关闭和价格/语音排除范围。首批代码、隔离入口和初步血缘设计已实施；完整本地普通回归及干净源码构建通过。任务8的26页原生交互仍因微信服务端口关闭而未完成，旧库桥接也未执行。逐项证据和审阅修复见 [实施记录](../../planning/2026-10-06-local-v4-implementation.md)，不能据此认为全部后续路线图已完成。
