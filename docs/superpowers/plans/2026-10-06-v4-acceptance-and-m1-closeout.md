# V4 验收与单餐体验收尾实施计划

> **For agentic workers:** 后续获得具体开发授权后，使用 `superpowers:executing-plans` 逐项实施；本文件不启动开发、派工、模型调用或生产操作。步骤以复选框记录，未知结果和验收缺口不能标为通过。

**Goal:** 补齐首批实际体验缺口，形成可复查的单餐候选版本与原生/模型/恢复验收结论。

**Architecture:** 延用微信原生页面、同一工作区 Store 和 Java 权威服务。历史页只读已有会话，实际快捷入口复用既有 actual 版本/请求契约，购物只调整呈现。评测与证据独立于业务写入。

**Tech Stack:** Node test、Python unittest/FastAPI、Spring Boot/MyBatis/MySQL、微信开发者工具自动化与真机。

**Spec:** [总方案 v2](../../planning/2026-10-06-development-roadmap-v2.md)、[差距复核](../../planning/2026-10-06-plan-gap-assessment.md)、[验收矩阵](../../planning/2026-10-06-acceptance-matrix.md)。

## 全局约束

- 开始时核对 `project/`、实际分支及全部未提交/未跟踪成果；基线 `c152550` 不代表最终实现提交，不清理旧归档。
- 当前本机 V4 已开启，API `http://127.0.0.1:18780/api`。不使用旧生产配置，不自动更改服务端口、安全设置、开放网络或发布。
- 语音固定弹窗“抱歉，该功能暂不可用”，真实 ASR 仍冻结；参考价缺失保持空缺，实付独立且 0 有效。
- 日期 `Asia/Shanghai`；人数 1–50、首次 2、手动菜数不随人数重置。
- 草稿/计划/实际/购物各自对象与版本不混用；unknown 保留原 requestId 和原 payload；任何晚到回调检查账号、对象及生命周期。
- 所有样式修改从 `design/wxss/**`/Token 来源生成，不手改生成产物。
- 当前 26 页；若新增历史页则变为 27 页并扩展矩阵，不能继续用旧“26 页”覆盖新增路由。
- 模型当前使用 12/20 次，本计划不增加或重置预算；无额外预算时先完成离线样本，不擅自跑完整真实评测。

## 审查重点

1. 历史页切账号、分页或导入时旧响应不能写入新的当前餐；历史浏览不覆盖菜单。
2. 费用详情折叠/筛选后，当前清单实付总额与稳定食材键不丢失，已购和实际不联动。
3. 实际快捷入口打开后计划变版、跨午夜、切账号或保存未知，不能保存到错误餐次或生成第二次记录。
4. 大字/键盘/窄屏中，食材勾选与确认动作可见可点，不靠静态声明冒充原生尺寸。
5. 干净候选包、模型不可用和旧服务能力不足时，独立页面保持基本可用，不把兼容降级当业务成功。

## 任务 1 高级/历史入口真正可用

开工前先完成候选基线文件清单与状态快照，核对未跟踪成果和私密配置；同步修正文档事实及根 README 的未验证热量能力宣传，保留真实历史发布记录。文档工作不强制 TDD；以下行为变更按复现与必要回归推进。

**Files:**

- Modify: `utils/meal-workspace-page.js`、`utils/api.js`、`app.json`。
- Create: `pages/assistant-history/assistant-history.js/.json/.wxml`、`design/wxss/pages/assistant-history/assistant-history.tpl`；更新 `design/wxss-manifest.json` 并生成样式。
- Modify: `backend/src/main/java/com/eatwhat/controller/AssistantController.java`、`recommend-service/main.py`、`recommend-service/assistant_store.py`、`utils/legacy-meal-import.js`（只在明确导入交接需要时）。
- Test: `tests/assistant-history.test.js`、`tests/test_assistant_history.py`、`backend/src/test/java/com/eatwhat/controller/AssistantHistoryTest.java`；复用账号隔离及旧草稿导入测试。

**Interfaces:**

- 新增认证后 `GET /api/assistant/sessions?cursor=<opaque>&limit=20`；Java 使用已认证 userId，忽略客户端身份。Python `AssistantStore.list_sessions(user_scope, cursor=None, limit=20)` 返回 `{sessions:[{sessionId,updatedAt}],nextCursor}`，最大 limit 50。
- 单会话继续使用既有 `getAssistantSession(sessionId)`，显示用户可见消息/草稿，不输出内部供应商传输字段。
- 高级按钮导航至拟新增历史路由并携带原 date/mealType；原 `/pages/chat/chat` 深链接仍进入同一 V4 工作区。历史浏览不改工作区；导入指定旧草稿必须重新读取源版本并使用当前 Store 的选择命令。

- [ ] 写失败用例：A 历史响应在 B 登录后到达不显示；其他用户会话不可读；分页稳定；浏览返回不改工作区；旧草稿版本变化拒绝旧导入；高级按钮不再导航自身。
- [ ] 运行上述新增 Node/Python/Java 用例，确认缺失列表/视图或当前导航不能满足预期，而非因无关依赖失败。
- [ ] 实现用户作用域列表和只读历史页；新路由更新验收矩阵，旧会话缺失/接口不可用给明确空态或恢复入口。
- [ ] 仅对必要导入交接定义账号作用域的 `pendingLegacyMealImport={sessionId,date,mealType,planVersion}`；切换目标后重新查询版本/权限，再调用已有选菜命令；不复制业务真相。
- [ ] 回归新增用例、原账号/旧导入回归，按项目要求运行适用完整验证；形成小范围本地可审阅变更。

完成标准：历史可浏览和再次打开，导入是明确动作，返回恢复原上下文；API 可用与 UI 已验收分别记录。

## 任务 2 待买勾选优先与费用层级

**Files:** `pages/shopping-list/shopping-list.js/.wxml`、`design/wxss/pages/shopping-list/shopping-list.tpl`；必要时创建 `utils/shopping-list-presentation.js`。测试 `tests/shopping-view-hierarchy.test.js`，复用 `v4-local-features`、`shopping-edit-intent`、`shopping-drafts`。

**Interfaces:** 保留 `_full` 的完整清单及版本；费用总览基于完整当前清单，待买参考小计只含未勾选项；显示筛选不改变金额、ingredientKey 或 checked。呈现状态 `{detailsExpanded:boolean}` 只保存在界面，不写业务库。

- [ ] 固定失败/负担场景：长清单的逐项费用区先于勾选；同食材重复展示；部分已购/视图筛选后金额与来源仍准确。
- [ ] 为费用/筛选/实付编辑写行为用例：0 有效、多个菜相同食材一次实付、规格分开、改名不改量、unknown 原请求不变；运行确认新增缺口。
- [ ] 将费用压成总览与可展开详情，逐项实付靠近对应食材；来源/批量按需展开。保持全部已有 handlers、加载/错误/冲突、确认与价格空缺文案。
- [ ] 使用 Token 源生成并检查静态/编译；原生大字和长清单检查首屏可勾选，不把 WXML 顺序断言代替屏幕可见性。
- [ ] 运行购物相关回归和完整适用验证，记录对基本清单、价格与实付独立能力的影响。

完成标准：买菜操作无需先滚过重复费用列表；金额、单位和请求契约无回归。

## 任务 3 当前餐快速实际记录

**Files:** `utils/meal-workspace-page.js`、`templates/meal-workspace.wxml`、`pages/meal-cooking/meal-cooking.js`、`pages/calendar-detail/calendar-detail.js`；拟新增 `utils/meal-actual-entry.js` 与 `templates/meal-actual-sheet.wxml`。测试 `tests/meal-actual-entry.test.js`，复用 V4 actual/history 契约及 `MealConsumptionServiceTest`。如需样式则修改 Token 模板。

**Interfaces:**

- `createMealActualEntry({api,onSaved})` 返回绑定当前页的打开/提交/取消 handlers；捕获 `{scope,date,mealType,expectedRevision,expectedPlanRevision}`。
- 请求仍为 `{status,usePlan,dishes,expectedRevision,expectedPlanRevision,requestId}`，调用已有 `saveMealConsumption(date,meal,body)`，不建新表或第二个已吃状态。
- 未知结果保存原请求引用；修正 payload 前先恢复/确认原结果。已有实际冲突保留输入并读最新，不自动覆盖。

- [ ] 新测试断言“按计划吃了/有变化/没按计划做”、外食自由记录、未来日期阻断、计划变版、A→B、延迟响应、超时原键重试和取消无写入。
- [ ] 先运行确认当前餐缺少快入口或具体行为缺口；实现最小共享入口并复用既有服务复核与幂等。
- [ ] 做饭结束只打开明确目标的记录操作；用户提交才保存。日历深链接携带 mealType，落到相应餐次，不默认选另一餐。
- [ ] 核验同餐修改不加次数、撤销更新回顾、改计划不改历史、未知类别不猜；运行对应 Node/Java/隔离 HTTP 用例。
- [ ] 原生键盘/返回/大字验收并记录，保留页面不依赖模型的记录路径。

完成标准：用户能明确记录当前一餐且低负担纠正；做饭、已购不自动记实际。

## 任务 4 固定评测、恢复与原生证据

**Files:** Create `tests/fixtures/workspace-evaluation.jsonl`、`scripts/evaluate_workspace.py`、`tests/test_workspace_evaluation.py`、`docs/testing/model-evaluation.md`；Update `scripts/audit_schema_lineage.py`、相关血缘测试/合成 fixtures、`docs/planning/2026-10-06-acceptance-matrix.md`。运行产物写专用私有目录，仓库只放脱敏摘要。

**Interfaces:**

- `validate_fixture(case:dict)->list[str]`：至少校验 `caseId/context/request/expectedTarget/requiredConstraints/expectedWritePolicy/expectedOutcomeClass`。
- 评测默认 `--dry-run`，真实执行显式 `--execute --manifest <隔离清单> --max-model-requests <上限>`；消费同一持久模型预算，失败亦计数，不自建绕过上限的客户端。
- 报告区分样本已校验与实际已运行，含版本/hash、调用量、时延、目标/来源/限制结果、费用可用性、失败/未执行原因；无真实运行不计算质量通过率。

- [ ] 写危险配置、非法 fixture、dry-run 不发 HTTP、预算耗尽无模型请求、坏 JSON/外来 ID 的失败用例，运行确认缺口。
- [ ] 建十类建议 60 条离线样本，固定预期与数据版本；实现 dry-run 和脱敏报告。真实评测预算不足项保持待执行，不重置 12/20 的记录。
- [ ] 补迁移列/索引/对象计数检查；在安全副本演练重复执行、部分失败、回滚恢复；没有副本先完成合成演练并注明限制。
- [ ] 在隔离环境补并发写、提交后超时、取消晚到结果和双 JVM 重启回执恢复。未知不得换新键重复写。
- [ ] 获取原生环境后逐页执行矩阵；关键 iOS/Android、双设备、字号、弱网和账号切换单列，不因截图成功关闭功能项。
- [ ] 选择实际验收过的稳定基础库再替换 `trial`；固定候选版本，完成最终适用回归和恢复报告，交付未执行项及问题列表。

完成标准：各证据层独立且覆盖候选版本；预算、环境缺口明确。这里只形成发布前候选，不自动部署或宣布整个路线图完成。

## 收尾交付

每项变更可独立验证，接口协调改动同批提交，先核对私密文件和范围。实际实现结束后按适用执行技能完成审阅；不要在仅有计划时派工。下一批 T13/T14 另写具体实施计划，不在此批顺手加入营养、家庭、完整复合 Agent 或语音服务。
