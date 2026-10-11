# V4 助手首批能力打通 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户在独立助手页围绕同一份本餐菜单连续交流，完成调整、查询、保存指定餐次和准备采购，得到可恢复的真实结果。

**Architecture:** Java 持有认证身份、会话／任务状态、可信业务读取、共享草稿和所有写入；Python 提供受内部令牌保护的单轮模型解释接口，由 Java 编排有界工具循环。新会话只引用 V4 工作区，旧助手历史保留为只读／显式导入入口。模型给出完整候选结果后，通过新增的工作区已校验草稿提交方法落地，不再次调用旧 generate 的模型链。日历与采购沿用业务 Service 和 ControlledToolHarness 的预览、版本校验与同事务回执。

**Tech Stack:** 微信原生小程序、现有 Node test runner、Spring Boot 2.7/MyBatis/JDK 8 兼容字节码、MySQL、Python FastAPI、现有 DeepSeekModelClient。首批不引入新的 Agent 框架或向量库。

**Spec:** [能力、上下文与发布报告](../../research/2026-10-11-assistant-integration-report.md)。本文是待实施任务，未勾选项不能称为已交付。

## Global Constraints

- 基线 `f78fb7ff7b1a71afcfe0f44029d45dedb1afa520`；正式源码只有 `project/`。执行时重新核对 HEAD、未提交工作和本地规则，不覆盖其他成果。
- 首批仅包括报告 A 组；B/C 组按末尾任务单另批执行。网页匿名服务与小程序私人助手分离，不新增匿名私有 API。
- 小程序前端生产发布仍暂停。此计划不包含生产升级；迁移、构建和联调先在隔离环境完成。
- 已有 API 保持兼容；新入口必须按后端能力开启，不从旧工具名称推断支持情况。默认部署开关 `ASSISTANT_V4_ENABLED=false`，这是新助手开关，不关闭现有 V4 工作区。
- 历史真实模型预算累计 `20/20`；用户在本轮另行批准最多 20 次真实 HTTP 请求，用于本机合成场景联调。新增预算独立计数，每一次 HTTP 请求与工具轮次都计数；离线测试默认阻断网络。
- 当前餐最多 10 道、人数 1–50；当前支持类别使用服务端规范代码，不使用展示文案替代代码。
- 只读无确认；草稿修改可撤销；每个确认任务最多 1 个持久业务写操作，预览有效期沿用 10 分钟。
- 保存计划不记成已吃；采购不代表吃过；缺价不补 0，未知份数不默认 2 人，未知用量不缩放，模型建议不变成 VERIFIED。
- 有图片使用原菜品图与统一圆角，缺图／失败才显示线稿；语音沿用“抱歉，该功能暂不可用”。复制菜谱仍在编辑保存时创建。
- 页面不显示工具名、内部状态枚举、版本、hash、HTTP 错误或重复的菜数说明；保留用户能采取行动的失败反馈。

## Review Focus

1. 用户从未来日期进入后说“明晚”：以可信 now/timezone 解释相对时间；选中日期独立展示。由 T02/T04/T06 测试。
2. 用户指“第二道”，另一设备刚换过菜单：旧版本不得改新菜单，刷新后重新定位。由 T02/T04/T06 测试。
3. 菜品同名／已下架／私房菜归属变化：不能仅凭名字或旧缓存写入；澄清或重新查询。由 T02/T04/T05 测试。
4. 保存已成功，但采购失败／确认响应丢失：不得回滚已完成计划或重复写入；恢复首次回执。由 T04/T05/T07 测试。
5. 菜谱正文或用户消息包含指令、假回执与假 userId：只能作为不可信内容；服务端权限和真实回执不受影响。由 T01/T03/T07 测试。

## 责任域和依赖

依赖：`T00 → T01 → T02/T03 → T04/T05/T06 → T07`。T02 与 T03 可在 T01 契约冻结后并行；T04、T05 的适配器与 T06 前端可再并行。

- Agent A：T00、T02 的上下文／查菜与 T03 Python step；只改约定 Python、上下文和测试文件。
- Agent B：T01 Java 契约／会话／Registry，T03 Java 编排，T04 日历／草稿。共享 DTO/Registry 由 B 单一负责。
- Agent C：T05 采购和 T06 前端；在 T01 冻结后新增独立 adapter，不自行更改全局合同。
- 集成者：T07，审查三方结果与实际测试；不能仅凭各 agent 的“通过”结束。

每个任务的最终验证结果覆盖该任务最终代码；提交时只暂存明确文件，不使用 `git add .` 把私有运行数据带入。用户未要求推送时不推送。

## 文件与合同索引

所有路径相对仓库根。下列标“新增”的文件是本计划设计，不代表已有实现。

| 文件／区域 | 责任 |
|---|---|
| 新增 `contracts/assistant-v4.json` | 输入／输出示例、工具参数、状态、版本和拒绝规则；Java/Python 契约测试共享夹具 |
| 新增 `backend/.../dto/AssistantV4Contract.java` | `TurnRequest/TurnView/StepInput/StepOutput/ModelContext/ToolRead/ActionProposal/Card` 嵌套 DTO |
| 新增 `backend/.../service/AssistantV4TurnService.java`、`AssistantV4Store.java`、`AssistantCapabilityService.java` | 任务状态、幂等、会话读取、能力与编排 |
| 新增 `backend/.../mapper/AssistantV4Mapper.java`、`db/migrations/V8__assistant_v4_conversations.sql` | 有归属的会话／消息／任务持久化，增量迁移；不复制业务菜单表 |
| 新增 `backend/.../controller/AssistantV4Controller.java` | 登录用户的新 API；不接受客户端 userId 或模型上下文 |
| 新增 `backend/.../service/AssistantV4ModelGateway.java` | 调 Python 内部 step，内部令牌与有界超时，不持有 DB 事务等待网络 |
| 新增 `backend/.../service/AssistantV4ContextService.java`、`AssistantReadToolService.java` | 当前餐白名单上下文和授权只读工具；复用现有业务服务 |
| 新增 `recommend-service/assistant_v4_step.py`、`assistant_v4_schema.py` | 单轮模型调用与严格输出校验；不连接业务数据库 |
| 新增 `WorkspaceAssistantToolAdapter.java`、`CalendarAssistantToolAdapter.java`、`ShoppingAssistantToolAdapter.java` | 语义意图映射到既有域服务，生成预览，绑定确认快照 |
| 修改 `ControlledToolRegistry.java`、`ControlledToolHarnessService.java` | 保留原 3 工具，新增有边界的预览适配；读请求不强制进入确认任务 |
| 新增 `utils/assistant-conversation.js`、`components/assistant-card/*` | 对话状态与真实业务卡片；与现有工作区 store 同源同账号 |
| 修改 `pages/chat/*`、`utils/api.js`、`utils/meal-workspace-page.js` | 明显助手入口、专用对话页、返回同一餐、现有页面共享草稿 |

`backend/...` 精确展开为 `backend/src/main/java/com/eatwhat`，测试展开为 `backend/src/test/java/com/eatwhat`。SQL 位于 `backend/db/migrations/`。若执行时 V8 名称已被合法新提交占用，先核对 manifest 并采用下一个连续版本，不能覆盖已有迁移。

## T00：修复已复现的工具契约与测试夹具

**Files:** 修改 `recommend-service/agent_tools.py`、`workspace_agent.py`、`agent_schemas.py`（仅必要的嵌套校验）、`tests/test_workspace_model_transport.py`；新增 `tests/test_assistant_v4_tool_contract.py`。保留 `authorized_catalog.py` 既有归属检查。

**Interfaces:** 新增 `agent_tools.v4_model_catalog()`，仅 V4 调用它。V4 的 `search_by_ingredients({ingredients, filters?, top_k?})` 与 search_dishes 共用明确 filters Schema；只允许 type/cuisine_codes/include_tag_codes/exclude_tag_codes/excluded_ingredients/max_cook_minutes。type 从现有服务端枚举提供；未知字段拒绝。原 `model_catalog()` 保持旧 Runtime 合同，不把 V4 的 type/excluded_ingredients 直接发送给使用 types/exclude_ingredients 的旧 RAG；旧食材工具不增加它不会执行的 filters。

- [x] 增加 `test_ingredient_filters_survive_real_route`：授权 catalog 中有鸡蛋与非鸡蛋，组合食材+排除条件仅返回允许 ID；未知 filter、bool 数量、越权 ID 均拒绝。
- [x] 原样运行并保存当前失败；修正旧 model_transport 测试的合法 agentContext，保留 `missing_context_is_rejected`，模拟 HTTP 不发外网。
- [x] 实施版本化 schema 和必要的类型校验，验证未知嵌套字段没有被悄悄忽略；增加 `legacy_catalog_and_exclusions_unchanged` 回归，旧 Runtime 仍使用原参数命名，不修改本餐业务限制。
- [x] 运行：`python -m unittest discover -s tests -p 'test_assistant_v4_tool_contract.py' -v` 及原 `test_workspace_model_transport.py`、`test_authorized_catalog.py`，预期全部通过且外网次数 0。
- [x] 审阅最小差异并提交，说明“工具契约修复”，不宣称新对话功能完成。

## T01：冻结合同、能力与持久任务基础

**Files:** 上表新增合同、DTO、Mapper、Store、CapabilityService、Controller、SQL；修改 `backend/db/migration-manifest.json`；新增 `AssistantV4ContractTest.java`、`AssistantV4StoreTest.java`。

**Interfaces:**

- 公共：`GET /api/assistant/v4/capabilities` → `{schemaVersion:"assistant.v4.1",enabled,reads,draftCommands,previewActions}`。
- 公共：`POST /api/assistant/v4/sessions` `{workspaceId,requestId}`；`GET /sessions/{id}` 分页返回消息、卡片引用和工作区引用；旧 `/api/assistant/sessions` 不改语义。
- 公共：`POST /sessions/{id}/turns` `{requestId,message,workspaceId,expectedWorkspaceRevision,expectedPlanVersion,entryScene}` → HTTP 202 `{turnId,status}`；同 requestId 同内容返回原 turn；不同内容 409。
- 公共：`GET /turns/{id}` → `TurnView`；`POST /turns/{id}/cancel` 只取消尚未完成的对话任务，不撤销已保存的业务动作。`DELETE /sessions/{id}` 取消该会话未完成任务并清理会话资料，不能删除业务菜单或域回执。
- `TurnView={turnId,status,reply,cards,workspaceRef,pendingAction?,continuation?,retryable}`；status 为 queued/running/needs_input/awaiting_confirmation/completed/partially_completed/failed/cancelled。客户端 status 不得直接显示给用户。
- `ToolRead={callId,name,arguments}`；`ActionProposal={steps:ActionIntent[]}`，最多 3 步。`ActionIntent={kind,arguments}`，首批 kind 仅 draft_update/calendar_save/shopping_preview。
- `StepOutput` 三选一：need_input（问题）、read_calls（1–4 个 ToolRead 与内部 ProviderContinuation）、final（短回复+可选 ActionProposal）。不能用 final 字符串标记业务写入成功。
- `ProviderContinuation={assistantMessage,messages}` 原样承接供应商本轮 tool_calls、全部 callId 和必要的 reasoning_content；messages 是当前 turn 完整的瞬时 assistant/tool 帧，以最新 assistantMessage 结束。下一轮按 callId 原顺序追加本轮工具结果，再请求模型，不能丢掉较早帧。两字段仅服务间瞬时传递，不发客户端、不落日志或任务库；兼容只含 assistantMessage 的单轮夹具。
- `WorkflowContinuation={id,steps,cursor}`：服务器把已验证意图规范化为稳定 stepId、requestId、kind、arguments、dependsOn、status、taskId/receiptRef 并持久保存。steps 最多 3，step.status 为 pending/awaiting_confirmation/completed/failed/cancelled；每步 requestId 使用固定命名空间与 turnId/stepId 生成合法 UUID，重复恢复不重建。确认成功后自动准备下一步预览，但绝不代替用户确认第二个写入。
- `AssistantV4Store.claimTurn(user,session,request) -> TurnView`；`findTurn(user,id)`；`completeTurn(user,id,expectedStatus,result)`。账号 ID 只由认证注入。

持久化：新增 sessions、messages、turns 三表，外键/查询均带 owner；turn 有唯一 `(user_id,session_id,request_id)` 和 request_hash，状态条件更新。session 只存 workspaceId，message 卡片只存业务引用与展示快照，业务餐单仍以 V4 为准。任务租约／modelDeadlineAt／providerCallsUsed／已验证 continuation 入库；每次 HTTP 发出前原子预留调用次数，超时和响应丢失也计数，重启不清零。重启丢失 ProviderContinuation 时不重建供应商思考内容：先恢复已经完成的业务步骤；未完成解释标记可重试，由用户新请求继续并重新计数。服务日志不保存完整 prompt、凭据或供应商 reasoning。

解释期的 30 秒 `modelDeadlineAt` 与人工确认期的 10 分钟 `preview.expiresAt` 独立。进入 awaiting_confirmation 后停止模型计时，用户在第 60 秒仍可确认有效预览；超过预览期限重新核对生成新预览。已验证 continuation 续办不重启或重置模型预算。取消 turn／删除会话使其未执行步骤与关联预览失效；确认事务重查 parentTurnId/stepId 仍有效，不能让旧卡片继续写入。已完成动作只保留回执，不自动撤销。

新会话生命周期：文本按 createdAt 最多 30 天，单会话保留最近 200 条；终态任务输入／临时数据 7 天后清理，只保留必要状态、请求 hash、业务引用至多 90 天。闲置 30 天会话级联删除消息和助手任务；用户显式删除立即执行同样清理。业务域菜单、清单和幂等回执按原域策略独立保留，不因会话清理删除；活动任务先条件取消，防止清理后迟到回写。不能把新策略套用到旧会话，需新增相应测试。

- [x] 写合同夹具，测试 `same_key_same_turn`、`same_key_different_body_409`、`foreign_session_404`、`client_user_id_rejected`、`restart_recovers_without_new_command`、`provider_reservation_survives_timeout_and_restart`、`retention_removes_text_not_business_receipts`。
- [x] 先运行新测试观察缺实现失败；在隔离数据库实施增量 SQL，验证重复执行策略、索引与旧表数据不变。
- [x] 实现 DTO 严格字段白名单、认证及持久状态；能力目录仅返回已实现且开关启用的项，缺接口时不显示新前端入口。
- [x] 运行：`mvn -f backend/pom.xml -Dtest=AssistantV4ContractTest,AssistantV4StoreTest test`。用该项目的隔离测试配置，确认没有生产数据源；迁移测试另用新建专属库，记录建库和应用结果。
- [x] 冻结合同提交；交给其他 agent 的是该提交和合同文件，不能只用口头字段名。

## T02：Context V2 和授权只读工具

**Files:** 新增 `AssistantV4ContextService.java`、`AssistantReadToolService.java`、`AssistantV4ContextTest.java`、`AssistantReadToolTest.java`；复用 `WorkspaceAgentContextService`、菜品/偏好/菜单/计划/实吃/采购服务；必要时提取公共授权候选函数，保留 V4 原调用契约。

**Interfaces:** `build(Long user, TurnRequest request, SessionState session) -> ModelContext`；`read(Long user, ToolRead call, TurnScope scope) -> ReadResult`。`SessionState/TurnScope/ReadResult` 作为 T01 DTO 的新增嵌套类型由 B 统一合入；ReadResult 为 `{items,nextCursor,truncated,sourceVersion,unknownFields}`。

首批读目录：四个现有查菜工具，加 read_current_meal/read_calendar/read_shopping/read_actual_diet_review。详情最多 30 IDs；列表每页最多 30；日历／回顾调用日期跨度最多 367 天、每次结果按最多 7 天分页；购物默认待买。Scope 限定认证用户、可见数据、相关工作区，模型参数不包含身份或 URL。

- [x] 写测试断言：`context.activeMeal.currentDishes[1].id` 等于当前第二道；存在 planVersion/workspaceRevision；未来 selectedTarget 不改变 now；owner/token 等字段不进入模型视图。
- [x] 写 `plan_is_not_eaten`、`foreign_private_recipe_rejected`、`reference_outside_first_200_is_authorized_on_demand`、`category_coverage`、`unknown_quantity_stays_null`、`budget_trim_keeps_constraints`。
- [x] 实现显式白名单与按任务加载。旧临时 current catalog 可复用；进一步详情／搜索由 Java 认证读取，不退回公共 RAG。当前、锁定、点名项优先；分类型召回，仍先执行硬筛选。
- [x] 业务上下文目标 6000 字符、工具事实累计 12000 字符，结构化裁剪且标记分页；最近最多 6 轮文本，7 天已发生实吃摘要。长做法单独查；剔除两份重复 options/requirements。
- [x] 运行：`mvn -f backend/pom.xml -Dtest=AssistantV4ContextTest,AssistantReadToolTest,WorkspaceAgentContextRequestTest,WorkspaceQualityReadScopeTest test`；日志只保留字段名、长度、来源版本和计数。
- [x] 审阅并提交上下文合同与实现；不在普通测试夹具复制真实用户资料。

## T03：有界模型工具循环和恢复

**Files:** 新增 `AssistantV4TurnService.java`、`AssistantV4ModelGateway.java`、`assistant_v4_step.py`、`assistant_v4_schema.py`；修改 `recommend-service/main.py`；新增 `tests/test_assistant_v4_step.py`、`AssistantV4TurnServiceTest.java`。仅在必要时给 model_client 增加向后兼容的“最终结果轮”参数。

**Interfaces:** Python `run_step(value: dict, model=None) -> dict`；内部 `POST /internal/v4/assistant/step` 接受 `StepInput`，要求非空匹配服务令牌。Java `startTurn(user,sessionId,TurnRequest)` 入队，`runTurn(turnId)` 在事务外调用模型，`cancelTurn(user,turnId)` 条件更新状态。

`StepInput` 必须包含 schemaVersion、白名单 ModelContext、当前请求文本、受控 conversationFrames、readResults、ProviderContinuation、finalRound。模型续接帧只来自本 turn 已校验的供应商响应与工具结果，不能接收客户端伪造的 tool 消息。服务内部身份用于归属校验但从最终 model messages 剔除。Python 不连接业务数据库，不执行写操作；工具目录来自合同与启用能力交集。

- [x] 用真实 FastAPI 内存请求及模拟 provider 写四类结果测试：read_calls/final/need_input/invalid；断言未知工具、伪造执行结果、owner/token 字段、菜谱注入指令均不触发业务写入。
- [x] 实现 Java 编排：每 turn 最多 4 次供应商 HTTP、总时限 30 秒、单次最多 10 秒且不超过剩余时间；无自动网络重试。最多前三轮读取，最后一轮只请求最终结果／澄清；客户端须支持最终 JSON 请求不再广告工具，并单独验证兼容。
- [x] 每批 1–4 个读请求，整 turn 最多 8 个工具调用；并行 tool_calls 全部校验后按界限执行，不能像现客户端一样静默只消费第一条。工具结果按对应 callId 返回，瞬时 ProviderContinuation 完整续接；新增独立 v4 解析函数或兼容可选字段，不破坏旧调用方。超限返回澄清，不能漏执行后宣称完成。
- [x] 模型不得把未查询 ID 用作动作对象；Java 只接受本轮事实或最新 activeMeal 中已授权 ID。短回复与卡片分开，业务完成状态来自域回执。
- [x] 写 `cancel_before_late_result`、`timeout_keeps_input_and_draft`、`restart_does_not_replay_applied_command`、`two_provider_tools_not_silently_dropped`、`reasoning_metadata_only_transient`；确保取消／租约失效后不更新草稿，HTTP 请求计数含所有模型轮次。
- [x] 运行 Python `test_assistant_v4_step.py` 与 Maven `AssistantV4TurnServiceTest`，全程模拟 HTTP、真实模型次数 0；供应商联调留到 T07 取得新的预算后。
- [x] 审阅并提交。旧 `/internal/v4/meal-task` 保持可用，新链路按独立能力开关启用。

## T04：草稿调整与跨目标日历保存

**Files:** 新增 `WorkspaceAssistantToolAdapter.java`、`CalendarAssistantToolAdapter.java`；修改 MealWorkspaceService、`dto/PlanDraft.java`、ControlledToolRegistry/ControlledToolHarnessService；新增 `AssistantWorkspaceActionTest.java`、`AssistantCalendarActionTest.java`；复用 MealWorkspaceRules/Planner 和 WorkspaceRequest 的版本与回执校验。

**Interfaces:** `applyDraft(Long user, DraftIntent intent, TurnBinding binding) -> WorkspaceView`；`MealWorkspaceService.applyAssistantDraft(user, workspaceId, expectedRevision, expectedPlanVersion, ValidatedAssistantDraft draft, requestId, turnId) -> WorkspaceView`；`prepareCalendar(Long user, CalendarSaveIntent intent, String requestId) -> ControlledToolTask`。这些嵌套类型均归入 T01 合同。

`DraftIntent={operation,contextPatch?,targetDishId?,targetConstraints?,replacementDishId?,selectedDishIds?,keepDishIds?,releaseDishIds?}`，operation 为 generate/regenerate/adjust/undo。contextPatch 仅可改 people/counts/compositionMode/criteria/totalCookMinutes/requirements/ownedIngredients，不可改长期偏好。targetConstraints 仅用于指定菜替换，不扩大到整餐或未来餐；例如 maxCookMinutes=10 只约束第二道新菜。keep/release 的对象必须属于当前工作区。

生成／重生成由这次有界模型循环读取真实候选并给出 selectedDishIds，Java 验证后提交完整草稿；**不得再调用旧 generate/regenerate 触发第二条模型链**。applyAssistantDraft 在短事务内校验 turn 仍有效、工作区版本、硬限制、保留项、菜数与内容版本，更新历史／草稿及幂等回执；复用已有规则，避免复制不一致的校验。普通今天页的旧生成流程保持原状。

整餐 contextPatch 与单菜替换分开：整餐条件变化需按现有“待重新生成”规则处理，只有完整新菜单验证通过才恢复可保存状态；不得先 PATCH 后沿用已失效草稿执行旧 replace。仅“这道十分钟”则在当前硬限制上增加目标候选条件，验证替换后整餐，其他菜及全局条件不变。同句“汤保留并换第二道”规范成一次 DraftIntent，保留与替换原子提交。

上下文与菜单一起撤销：给 PlanDraft 历史项增加可选 `contextSnapshot:MealContext`，新助手修改前保存完整旧 context+draft checkpoint，最多 10 个。undo 同事务恢复内容与条件，重新校验当前可访问性／硬排除并重算指纹，再递增当前版本，不能回退版本号。旧历史没有 contextSnapshot 时沿用既有兼容逻辑，不猜旧条件；今天页和助手页都使用同一 undo 域实现。

CalendarSaveIntent 仅 sourceWorkspaceId/targetDate/targetMealType，所有版本和 hash 由服务端快照生成；生成的 `ValidatedAssistantDraft` 是 Java 内部类型，模型不能直接提供可信标记。

新增工具名 `save_meal_to_target`，保持旧 confirm_current_meal 不变。绑定 sourceWorkspaceId/workspaceRevision/planVersion/dishContentVersions/targetDate/targetMealType/targetPlanRevision 及 parentTurnId/continuationStepId。确认 API 继续只收不透明 previewToken，不重新接收可变 payload；事务内重查会话、turn 与 step 未取消／删除，旧工具无 parent 绑定的行为保持兼容。

- [x] 写 `replace_second_keeps_other_dishes_and_locks`、`undo_only_latest_draft_change`、`context_patch_then_generate_then_undo_restores_context_and_fingerprint`、`stale_revision_cannot_modify_new_menu`；操作使用确定 requestId 与现有命令回执。
- [x] 写 `tomorrow_uses_now_not_selected_target`、`occupied_target_shows_diff`、`source_or_target_changed_requires_preview`、`same_confirm_returns_same_receipt`、`plan_save_never_marks_eaten`、`cancelled_turn_preview_cannot_confirm`、`deleted_session_preview_cannot_confirm`、`confirm_after_60_seconds_before_10_minutes_is_valid`。
- [x] 草稿结果提交共享域状态与历史；“它／第二道”解析到有版本 ID，歧义先澄清。增加 `target_limit_does_not_change_whole_meal`、`context_patch_requires_valid_regeneration`、`assistant_generation_never_calls_legacy_agent`，确认一次 turn 不递归产生模型请求。
- [x] 保存生成服务器预览；来源、目标和菜品内容再校验；回执和写入同事务。若 continuation 已有 shopping_preview，保存成功后自动准备采购卡，新的采购写入仍等待单独确认；无续办意图才仅显示采购入口。
- [x] 运行：`mvn -f backend/pom.xml -Dtest=AssistantWorkspaceActionTest,AssistantCalendarActionTest,WorkspaceTargetSaveTest,ControlledToolHarnessServiceTest test`。
- [x] 审阅并提交；用日期／菜名／人数生成用户卡片，不用“版本 7”等内部信息。

## T05：采购预览快照与加入清单

**Files:** 新增 `ShoppingAssistantToolAdapter.java`、`service/ShoppingProcurementScopeService.java`、`mapper/ShoppingScopeAliasMapper.java`、`AssistantShoppingPreviewTest.java`、`backend/db/migrations/V8_10__assistant_shopping_scope_aliases.sql`；Java 路径均按上表 com/eatwhat 展开。扩展 Registry/Harness 的适配注册与 migration-manifest；复用 ShoppingPreviewService、ShoppingListService，避免修改原手工页面契约。

**Interfaces:** `prepareShopping(Long user, ShoppingIntent intent, String requestId) -> ControlledToolTask`；`ShoppingIntent={sourceRef,selectedSourceKeys?,excludedOwnedIngredients?}`。sourceRef 是严格二选一：`{kind:"draft",workspaceId}` 或 `{kind:"plan",date,mealType}`，服务器解析版本。用户可从未保存菜单直接准备食材，不强制先写日历；组合续办时 plan 引用必须来自上一保存步骤真实回执。新增工具名 `add_meal_shopping`；预览选中行变化必须重建绑定并换 token。

绑定：草稿来源绑定 workspaceRevision/planVersion，计划来源绑定 planRevision；两者都绑定日期餐次、菜品 occurrence/contentVersion、可信食材来源行、用户选中行、人数、数量证据状态、expectedListVersion、hash、parentTurnId/continuationStepId。模型不能提交任意 quantity/sourceUserId。预览保存在 ControlledToolTask 的服务器 binding；草稿状态不冒充日历记录，来源类型单独留作事实字段。

采购身份不直接按 draft/plan 分裂：首次预览建立服务器 `purchaseScopeId`，selectionKey 从 purchaseScopeId+菜品 occurrence+食材来源行稳定生成；别名表以 `(user_id,alias_key)` 唯一绑定到 scope。未改内容的同一草稿保存到**同一日期餐次**时，将目标计划别名关联原 scope，再次采购复用原来源，不能双加数量。保存到另一个真实餐次则生成另一 scope，预览明确显示新增餐次；同一道菜两餐采购仍是两份。来源或内容发生变化走新预览／已有行保护，不能借别名覆盖已购或手工数量。别名属于采购域生命周期，不随助手会话删除；清单已清空后允许新 requestId 重新添加，不重放旧加入回执。

Scope 服务接口：`resolveScope(Long user, ShoppingSourceRef source) -> String`、`linkSavedPlan(Long user, ShoppingSourceRef draft, SavedPlanReceipt receipt) -> String`；读取、创建和绑定使用唯一约束及事务，返回的 scope 不接受模型指定。T04 保存回执成功后调用 linkSavedPlan；调用失败不撤销已保存日历，采购预览暂停并可按同一步恢复。

- [x] 写 `unknown_servings_do_not_default_to_two`、`no_price_stays_empty`、`same_dish_two_meals_keeps_two_sources`、`user_quantity_and_purchased_rows_preserved`。
- [x] 写 `recipe_changed_after_preview`、`selection_changed_invalidates_token`、`list_changed_before_confirm`、`draft_shopping_does_not_create_calendar`、`draft_change_invalidates_shopping_preview`、`draft_then_same_meal_plan_does_not_double_quantities`、`different_meals_keep_distinct_procurement`；变化后重新预览，不悄悄换内容。
- [x] 确认走带 requestId 的 batchAdd；重复返回首次 added/merged 回执。餐次保存成功后采购失败，结果明确保留保存成功，不自动重复第一步。
- [x] 写 `calendar_done_shopping_failed_resume_only_shopping`、`confirmation_auto_prepares_pending_shopping_but_does_not_add`、`lost_response_returns_original_receipt`、`same_key_different_body_conflict`；服务重启从持久 continuation 与真实回执继续。
- [x] 运行：`mvn -f backend/pom.xml -Dtest=AssistantShoppingPreviewTest,ShoppingAddReceiptTest,ShoppingListReliabilityTest,V4ShoppingContractTest test`。
- [x] 审阅并提交；采购卡显示可信数量或按需，不能展示默认“2 人份推算”冒充事实。

## T06：可见助手入口、连续会话和业务卡片

**Files:** 修改 `pages/chat/chat.js/.wxml/.wxss/.json`、`utils/meal-workspace-page.js`、`templates/meal-workspace.wxml`、`utils/api.js`；新增 `utils/assistant-conversation.js`、`components/assistant-card/index.js/.json/.wxml/.wxss`；新增 `tests/assistant-conversation.test.js`、`tests/assistant-cards.test.js`。

**Interfaces:** `createAssistantConversation({api,workspaceStore,identity,source})` 返回 `load(workspaceRef)/send(text)/confirm(cardId)/cancelTurn()/recover(turnId)`；卡片取 T01 TurnView，不解析自然语言判断成功；保存通过已有 taskId+previewToken 确认。

入口：今天页标题区一个标明“助手”的次入口；日历入口带明确餐次；“本餐要求”仍是轻量条件编辑。新功能不可用时保留现有工作区体验，不出现点后才发现没接通的入口。

- [x] 写 `home_and_chat_share_workspace`、`cross_account_late_response_ignored`、`capability_absent_hides_new_entry`、`restore_input_after_failed_turn`。
- [x] 写 `read_has_no_confirmation`、`draft_has_undo`、`write_card_confirms_once`、`unknown_confirmation_recovers_same_request`，每个卡片直接链接真实对象。
- [x] 实施温暖餐桌风格：字号／按钮／间距复用现有 tokens；菜图优先、圆角、无图线稿；顶部仅当前餐必要信息；不展示工具状态和重复菜数文本。
- [x] 首批卡片类型：menu/recipe/calendar_save/shopping_preview/receipt/clarification；clarification 一次问一个必要问题。成功保存后给“查看日历”，采购给“查看清单”。
- [x] 运行：`node --test tests/assistant-conversation.test.js tests/assistant-cards.test.js tests/workspace-navigation.test.js tests/workspace-page.test.js tests/controlled-harness.test.js`。
- [ ] 用隔离 API 逐页检查 390×844、320 宽、大字号、长菜名、键盘、安全区、失败重试、返回首页。浏览器预览通过后仍需微信原生与真机证据；审阅后提交。

## T07：整体验收与可部署候选

**Files:** 新增 `tests/fixtures/assistant-v4-evaluation.jsonl`、`tests/test_assistant_v4_http_flow.py`；新增 `docs/testing/assistant-v4-acceptance.md`；更新 DEVELOPER 与相关部署说明，不覆盖历史证据。

**Interfaces:** 验收程序输入显式 isolatedApiBase、测试库标识和两测试账号；仅允许回环或已批准专属测试环境，拒绝线上域名／真实 food 库。模型默认 mock；live 参数还必须检查新批准的预算账本。

- [x] 建 40 条固定中文场景集：生成 8、指代／调整 8、日期／保存 8、采购 6、只读查询 4、歧义／拒绝／恢复 6。每例包含初态、输入、期望域操作、禁止操作和终态断言。
- [x] 在隔离数据库运行真实 Java→Python→模拟供应商→Java 业务 HTTP 链路；覆盖报告发布门槛全部 10 行，特别是并发／断网／跨账号／重复确认／部分完成。
- [x] 修复本轮引入的问题，再运行 `scripts/verify.ps1 -Offline -SkipModelServiceTests`（按本机验证文档配置 Maven 缓存与独立构建目录）。新助手离线测试不得被 SkipModelServiceTests 一并跳过；该开关仅阻止真实外部模型请求。
- [x] 新预算授权到位后才跑供应商场景。统计真实 HTTP 次数／token／最终业务成功／澄清／失败、P50/P95 和失败原因；预算不足的场景标未验收，不用 mock 补写“真实通过”。
- [ ] 微信工具和真机验收 T06 全流程、最终构建来源与接口版本；同时跑旧端兼容和网页既有边界测试。生产前端仍暂停时只产本地候选。
- [x] 生成候选清单：Git SHA、Java JAR SHA256、Python 文件清单、合同版本、增量 SQL 及恢复说明、服务开关、前端来源与每项验收证据。不得只交一个新 JAR 宣称齐备。
- [ ] 开启新助手的门槛：硬忌口违规／越权写入／未确认持久写入／重复写入／虚假成功均为 0；核心 40 例离线业务断言全部通过；真实供应商和微信关键闭环另有通过证据。没有完成则保留原 V4，隐藏新增能力。

## 首批之后的独立任务单

以下不混入首批交付。每批先补合同与隔离验收，再进入真实模型测试。

| 后续任务 | 明确实施入口 | 必须先补的合同与验收 |
|---|---|---|
| D1 清单轻维护、收藏、常用菜单 | 新增 ShoppingMutationToolAdapter/FavoriteToolAdapter/MenuToolAdapter；复用 ShoppingMutationService、FavoriteDishService、PersonalMenuService | 修改用 requestId/listVersion；同名来源先选择；setFavorite(true/false) 重复同态成功；菜单 resolve 后应用同一草稿 |
| D2 计划修改删除、实际记录 | 新增 PlanMutationToolAdapter/ConsumptionToolAdapter | 计划 revision 与实际 revision 独立；未来不可记已吃；删除计划不删实际；保留合法历史快照引用 |
| D3 长期偏好与个人菜谱 | UserPreferenceService/Mapper 新增增量 PATCH/CAS/receipt；PersonalRecipeToolAdapter 复用 copy-edited | “这餐／以后”分开；不丢其他偏好；公共菜不能直接编辑；复制取消不创建，保存只创建一次 |
| D4 价格与当前实付 | ShanghaiPriceService/ShoppingMutationService.expense adapter | 真实报价日期／来源／缺失覆盖度；未知量不算；用户明确金额才能记实付，独立于参考价 |
| D5 最多 7 天多餐计划 | 新增 PeriodPlanTask DTO 与逐餐 preview/binding/receipt，沿用受控域服务 | 明确每餐旧安排、成功／保留／冲突范围；单餐修改不影响其他餐；部分完成可续跑，不声称全成功 |

## 计划自检结果

- A 组用户能力均映射到 T02–T06；B/C 组单列 D1–D5，没有隐含在首批里。
- 报告上下文矩阵映射 T02，实际复现的 schema/夹具问题映射 T00。
- 查询、草稿、持久写入、组合任务四类行为分别有任务与断言；5 条 Review Focus 均指定责任任务。
- 合同先冻结；Python 只做单步解释，Java 掌握身份与业务工具循环，避免双草稿和网络期间持有写事务。
- T00–T05 与 T06 代码／审阅／自动化验证已完成；T07 的 40 条真实隔离业务 HTTP、供应商预算与证据整理完成。T06/T07 原生运行及真机验收尚未完成，新助手仍默认关闭。未进行生产变更、前端发布或 GitHub 推送。
- 真实供应商预算已用满 20/20，最终四条核心业务成功；日期澄清经独立零调用持久回读核验，LIVE03 独立只读真实模型场景未验。完整证据见 docs/release/assistant-v4-local-candidate.md。
