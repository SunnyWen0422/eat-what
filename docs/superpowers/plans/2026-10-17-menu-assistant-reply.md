# 菜单助手自然回答与定餐效率 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本计划按主 agent 顺序实施，避免并行修改共享协议；最终仅对本批变化做一次独立范围复审。

**Goal:** 让用户通过简短自然对话和真实菜品卡片，更快完成个性化定餐、调整、保存和采购，而不是生成更多无用内容。

**Architecture:** Java 保留认证、事实读取、业务执行和卡片，Python 保留模型调用；新增协商后的自然回答合同。模型基于有界事实提出解释与内容引用，Java 核验后写入现有 reply/cards，确定操作状态继续由真实回执生成。同步补齐受控比较、临时条件澄清和本轮查询复用。

**Tech Stack:** 微信原生 JS/WXML/WXSS、Java 8 / Spring Boot 2.7、Python / FastAPI、既有模型接口；不新增运行依赖。

**Spec:** [用户目标、交互及合同](../specs/2026-10-17-menu-assistant-reply-design.md)。执行前读该文件、根 AGENTS.md、DEVELOPER.md 及本计划。基线 `57917354e8dcbd4cccd04bceee83178ec9f4f47d`；执行时核对当前变化，不重置用户成果。

## Global Constraints

- 保留温暖餐桌 A、助手/菜品轻透浮层 F、图片优先和圆角；不重设计其他页面。
- 模型请求每 turn 最多四次、读取最多八次、每批最多四项、动作最多三步，保留现有总期限、租约和取消边界；不靠增加预算解决效率问题。
- 不新增运行依赖或数据库迁移，不修改生产配置，不推送、部署或访问生产数据。网页没有同等私有助手时不顺便增加账号/助手功能。
- 不重跑全量测试或全量负载；只做改动范围的行为检查、必要打包和开发工具验收，不发送真机二维码。
- 临时要求仅作用当前餐；长期偏好需要原页面明确操作。不能仅把自由文本写进 requirements 后声称已经应用。
- 所有事实、写入与历史恢复边界按 Spec 原样保留；不得通过削弱校验来提高自然回答展示率。
- 本次只编写方案。以下检查和提交都是执行阶段的待办，不代表已经运行。真实模型预算旧账已满，执行到该阶段才申请新增明确预算。

## Review Focus

1. 卡片操作后菜单已变：旧自然理由不得描述新菜单——Task 4 状态变更检查。
2. 数字引用真实但结论虚构：有引用不等于句义正确——Task 3 对抗样本与 Task 7 人工评阅。
3. 模糊要求变成假承诺或长期偏好——Task 5 结构化应用及偏好不变断言。
4. 旧 Java/Python/前端混用：未知字段不应拖垮既有助手——Task 2 兼容矩阵。
5. 去重查询跨版本、分页或账号误复用——Task 6 版本/cursor/作用域断言。

## 文件职责与依赖顺序

顺序固定为 T1 → T2 → T3 → T4 → T5 → T6 → T7。先冻结可执行合同，后做界面和自然效果验收。

- `recommend-service/assistant_v4_schema.py`：仅定义/校验协议；`assistant_v4_step.py`：请求组装；新增 `assistant_reply.py`：自然表达规则与回答结构校验。
- `backend/.../dto/AssistantV4Contract.java`：内部 DTO；新增 `AssistantAnswerBasisService.java`、`AssistantAnswerPolicy.java`：分别构建事实与核验回答，不继续膨胀 TurnService。
- `AssistantV4TurnService.java`：编排、最终状态和现有动作衔接；`AssistantFactReplyFormatter.java`：保留兜底。
- 新增 `AssistantRequirementResolver.java`：临时条件的可执行解析；`AssistantGuidanceService.java`：澄清卡片及选择核验。
- `utils/assistant-cards.js`、`components/assistant-card/*`：保留已有真实卡片；`utils/assistant-page.js`、`pages/chat/*`：短回复与卡片呈现。
- 新增评估夹具与定向测试，验证程序行为和用户目标，不用源代码字符串匹配代替回归。

以下 Java 文件路径均相对 `backend/src/main/java/com/eatwhat/`，测试相对 `backend/src/test/java/com/eatwhat/`；其余路径相对仓库根。

### Task 1：冻结场景、完成事实和基线

**Files:** Create `tests/fixtures/assistant-menu-reply-evaluation.jsonl`、`docs/testing/assistant-menu-reply-acceptance.md`；Read `tests/fixtures/assistant-v4-evaluation.jsonl`、当前审查记录。

**Interfaces:** 每条夹具固定 `id,category,initialState,messages,availableFacts,expectedActions,forbiddenClaims,expectedCards,maxProviderCalls`；期望是约束，不固定自然回复字面。

- [ ] 写 24 正常 + 12 异常场景，至少各含三组有图/缺图、已知/未知用时、明确/含糊指代；为每条指定任务是否需要确认、是否应该修改草稿。
- [ ] 建立四条流程：食材定餐→保留换菜；二菜比较→选入；临时排除→检查长期偏好；调整→保存→采购。记录起点、最终菜单与各步真实回执。
- [ ] 核对本地当前版本、旧 fixture 与报告，记录当前回复被 Python/Java 替换的基线；只运行四个代表离线样本，不重跑旧整套矩阵。
- [ ] 验收文档区分离线、开发工具、真实模型、生产四栏；未执行栏默认未验收。
- [ ] 只提交夹具和说明：`test: define menu assistant experience cases`。

### Task 2：内部协议与兼容开关

**Files:** Modify `dto/AssistantV4Contract.java`、`service/AssistantV4ModelGateway.java`、`recommend-service/main.py`、`recommend-service/assistant_v4_schema.py`、`backend/src/main/resources/application.yml.example`；Create `AssistantMealReplyContractTest.java`、`tests/test_assistant_reply_contract.py`。

**Interfaces:** StepInput 可选 `replyContract="meal_reply.v1"`、`answerBasis: AnswerBasis`；StepOutput 可选 `answer: AnswerDraft`。字段类型、数量和长度按 Spec。不扩展公开 TurnView。

- [ ] 先写失败测试：`legacy_contract_is_unchanged`、`reply_contract_rejects_unknown_fields_and_limits`、`old_python_404_keeps_legacy_flow`、`disabled_feature_omits_new_fields`。分别断言旧输出完全不增加字段、280 字上限、未知引用结构拒绝、新探测失败不禁用旧助手。
- [ ] 新增仅内部令牌可访问的 `GET /internal/v4/assistant/reply-capabilities`，返回 `{"replyContracts":["meal_reply.v1"]}`。Java 独立缓存能力 60 秒，绑定网关地址；只在配置 `assistant.v4.natural-reply-enabled` 为 true 时探测。不要改变旧扩展探测的返回要求。
- [ ] 默认配置为 false；新 Python 未见 replyContract 就走原严格合同；Java 探测失败不发新字段。禁止通过关闭未知字段检查兼容。
- [ ] 运行新 Java/Python 定向合同测试；预期旧/旧、新/旧、旧/新、新/新四组合均有明确结果。
- [ ] 提交：`feat: negotiate bounded natural meal replies`。

### Task 3：有界事实、自然输出与核验

**Files:** Create `service/AssistantAnswerBasisService.java`、`service/AssistantAnswerPolicy.java`、`recommend-service/assistant_reply.py`、`service/AssistantAnswerPolicyTest.java`、`tests/test_assistant_reply.py`；Modify `recommend-service/assistant_v4_step.py`、`recommend-service/assistant_v4_schema.py`。

**Interfaces:** `AssistantAnswerBasisService.build(ModelContext, List<ReadResult>) -> AnswerBasis`；`AssistantAnswerPolicy.evaluate(AnswerDraft, AnswerBasis) -> Decision{accepted,reply,cardRefs,reasonCode}`。reasonCode 只留内部固定码，不给用户显示。Python `prepare_reply_instructions(basis:dict)->str`、`validate_answer(value:dict,basis:dict)->dict`；不执行数据库访问。

- [ ] 先写失败测试：空结果覆盖旧快照；未查菜不能引用；数值/单位/比较对象错误拒绝；未知用时不比较；旧菜名中的提示注入不改变工具/按钮；普通衔接句可通过；总字符/事实预算遵守 Spec。
- [ ] 构建事实 key 与候选引用，不发送整个数据库。排序保留明确目标、保留菜与执行菜；超预算时缩减可选事实，不丢硬限制。去重与来源版本写断言。
- [ ] 系统规则改为直接回答、少重复、最多两条有依据的理由。保留输出 JSON、工具白名单和不编造规则；新合同下 `final_output` 保留经过结构验证的 answer，不再无条件用固定话术替代。
- [ ] 实现引用、字段值和受限比较核验，禁止任意图片 URL、路由、价格营养/足量结论或成功回执；任何核验失败退回现有 formatter，不再调用一次模型重写。
- [ ] 检查语义剩余风险并加入六条“引用正确但措辞夸大”的对抗样本；记录人工评阅项，不能把正则判定等同事实证明。
- [ ] 定向测试通过后提交：`feat: ground concise meal explanations in authorized facts`。

### Task 4：接入编排与菜品卡片，保留实际结果

**Files:** Modify `service/AssistantV4TurnService.java`、`service/AssistantV4Store.java`（仅必要时）、`utils/assistant-cards.js`、`utils/assistant-page.js`、`pages/chat/chat.wxml`、`pages/chat/chat.wxss`、`components/assistant-card/index.js`、`components/assistant-card/index.wxml`；Create `service/AssistantReplyIntegrationTest.java`、`tests/assistant-natural-reply.test.js`。

**Interfaces:** T3 的 Decision 映射现有 `TurnResult.reply/cards`；卡片仍由原 factCards/业务适配器生成。新增 `selectAnswerDishCards(cards, cardRefs)` 只能选择只读菜卡，不过滤确认、回执、澄清、工作流和恢复卡。

- [ ] 先写失败测试：模型文字和真实卡片同时出现；无图 fallback；卡片换菜/保留/查看可达；引用无效仅文字回退；保存未确认不显示成功；确认完成后显示真实回执而非旧承诺。
- [ ] 接入新回复开关，不新增写入工具。草稿动作之后对照最终菜品与版本重新核验理由；执行失败、结果未知、取消、部分完成时使用权威状态反馈，不把预先生成的建议当结果。
- [ ] 历史只保存最终显示文字和现有卡片，不保存 answerBasis/供应商原始内容；重新打开不重新调用模型，老历史仍可读。
- [ ] 气泡使用纯文本；默认一至三句，无强制标题和重复功能说明。卡片保留 F、照片圆角、原按钮和加载反馈，不新增大块“依据/校验”说明。
- [ ] 定向验证请求恢复、账号/API 切换、菜单改变后的旧卡片禁用，且不同回执不被菜品去重合并。
- [ ] Java/Node 定向通过后提交：`feat: present natural replies beside actionable dish cards`。

### Task 5：比较、临时要求和指代真正能执行

**Files:** Create `service/AssistantRequirementResolver.java`、`service/AssistantRequirementResolverTest.java`；Modify `service/AssistantGuidanceService.java`、`service/AssistantV4ContextService.java`、`service/AssistantV4TurnService.java`、`service/AssistantCapabilityService.java`、`recommend-service/assistant_v4_schema.py`、`recommend-service/assistant_reply.py`、`utils/assistant-conversation.js`、`utils/assistant-cards.js`；Create `tests/assistant-meal-requirements.test.js`。

**Interfaces:** `resolve(ModelContext, ActionProposal) -> RequirementDecision{status,validatedProposal,clarificationKind,options}`，status 为 applicable/needs_input/unsupported；不产生任意新条件。`meal_requirement` 配合前端能力 `meal_requirements_v1`，只在支持新内部合同且客户端声明后启用，未协商保留旧澄清。

- [ ] 先写失败测试：明确排除仅改本餐；目标不明仅问一次选菜；“简单”不自动设分钟；无可信标签的“少油”不声称已满足；澄清后保留原始需求；不同账号/版本的选项不能应用。
- [ ] 比较模式只用两至三道授权菜及最多两个已知维度。无数据不推断；比较本身不改菜单，通过现有加入/换菜操作继续。
- [ ] 原文字 requirements 的防护不删除。仅将能够对应既有合法 contextPatch/targetConstraints 的参数交给现有校验；模糊项按 Spec 用服务器生成选项收敛。
- [ ] 从当前菜单、有效卡片、实际回执和用户选择提取近期焦点，放入有界上下文；切餐和版本变化重新校验。禁止把“待确认推荐”自动视为已选择。
- [ ] 澄清卡单题最多三个选项，选择后继续原任务；前端不展示模型内部条件码，用户可编辑输入。
- [ ] 运行 resolver、澄清选择、模型合同的相关定向测试，通过后提交：`feat: resolve meal-specific requirements and dish comparisons`。

### Task 6：减少重复查询，保留最终回答预算

**Files:** Create `service/AssistantTurnReadCache.java`、`service/AssistantTurnReadCacheTest.java`；Modify `service/AssistantV4TurnService.java`、`recommend-service/assistant_v4_step.py`；Extend `tests/test_assistant_reply.py`。

**Interfaces:** 本 turn 内 `find(toolName,canonicalArguments,sourceVersion)->ReadResult|null`、`put(...)`；复用结果时重新绑定当前 callId，不泄露旧 callId。缓存实例不跨 turn、用户或环境。

- [ ] 先写失败测试：相同查询只访问业务读取一次；cursor 不同要继续读；版本改变不能复用；新 callId 与 tool_result 一一匹配；重复结果不反复消耗事实字符预算；仍受八次工具调用和四次模型请求上限约束。
- [ ] 规范化仅做 JSON 字段稳定排序和已定义默认值，不擅自合并语义不同的筛选。结果版本只能由后端产生；无法确定新鲜度的读取不缓存。
- [ ] 调整提示与调度：优先一次均衡查询，当前餐事实足够不重复读；不默认加润色/审核请求；第四次只能最终回答或澄清。守住原总期限，不每轮重新获得完整时限。
- [ ] 记录固定指标：provider_calls、read_calls、read_cache_hits、fallback_reason、duration、workflow_outcome；不记用户原文、令牌、原始模型结果。
- [ ] 针对食材定餐、换一道、二菜比较各检查一次调用轨迹；通过后提交：`perf: reuse scoped assistant reads without expanding budgets`。

### Task 7：定向验收、真实效果与交付

**Files:** Create `scripts/acceptance/assistant-menu-reply.cjs`、`scripts/assistant_menu_reply_acceptance.py`；Update `docs/testing/assistant-menu-reply-acceptance.md`。复用 `scripts/assistant_v4_provider_budget.py` 的总账，不建立绕过旧账的隐藏预算。

- [ ] 执行 T1 的 36 条隔离场景和四条流程；使用合成账号/菜品，禁用真实供应商。检查真实菜单与回执，不只检查回复字面。
- [ ] 定向后端打包；在开发工具验收 chat/assistant-card 受影响状态：正常推荐、比较、澄清、待确认、已完成、失败恢复、旧会话；390 宽度及一个大字号检查。隔离项目收齐 ui-icon 等组件依赖，不发 QR。
- [ ] 只在新增预算获批后运行真实模型代表任务，失败也记账，不并发超额。每例绑定模型配置非秘密标识、源码 SHA、用例和实际调用数。无预算则保留“真实模型待验收”，不得写整轮效果已通过。
- [ ] 对六个代表任务按 Spec 记录任务完成、重述次数、回复是否有用及卡片操作；发现问题只重跑原症状和必要相邻样本，不重跑全量。
- [ ] 对本批差异做一次独立范围复审，重点查看协议混用、语义夸大、状态变化、临时条件与缓存边界；无需重新审整个仓库。
- [ ] 整理本地提交、实际验证数、缺口与关闭开关的回退步骤。关闭新回答后原助手和已有历史继续工作；不撤销已完成业务写入。不推送、不部署。

## 定向命令约定

以下均在仓库根运行；执行前确认测试入口只使用隔离资源。沿用现有本机运行时和 Maven 缓存，不下载升级依赖；工具不在 PATH 时使用已核实路径。

```powershell
# Python：一次只跑本任务相关文件；测试显式注入替身，禁止读取真实供应商配置
python -m unittest discover -s tests -p test_assistant_reply_contract.py
python -m unittest discover -s tests -p test_assistant_reply.py
# Node：新行为与受影响卡片/会话相邻合同
node --test tests/assistant-natural-reply.test.js tests/assistant-meal-requirements.test.js
# Java：各任务只选择自己的测试类；不要执行整套 test
mvn -o -f backend/pom.xml -Dmaven.repo.local=../.m2 '-Dtest=AssistantMealReplyContractTest,AssistantAnswerPolicyTest,AssistantReplyIntegrationTest,AssistantRequirementResolverTest,AssistantTurnReadCacheTest' test
mvn -o -f backend/pom.xml -Dmaven.repo.local=../.m2 -DskipTests package
git diff --check
```

如新文件继承的测试框架需要路径注入，沿用现有 tests 的隔离 loader，不通过真实启动器“修好测试”。一次必要测试通过后，只在相关源码改变或出现新证据时重跑。

## 计划自检与完成口径

| 用户关注 | 负责步骤 | 可检查结果 |
|---|---|---|
| 模型自己说，简洁不死板 | T2–T4 | 新协议保留自然文字，两层不再无条件替换；不强制套话 |
| 卡片方便查看与操作 | T4 | 有图用图，保留原操作，确认和回执不被过滤 |
| 比较不是泛泛建议 | T3、T5 | 只比较真实已知字段，不编造数字，不误改菜单 |
| 模糊临时条件可落实 | T5 | 一次关键澄清，合法 patch 应用成功，长期偏好不变 |
| 少问、少查、少等待 | T6 | 同 turn 相同查询复用，事实足够停止，预算不扩大 |
| 真实模型效果有证据 | T7 | 实际样本/请求数、完成事实和人工评价独立列示 |

交付分为“代码与离线验收完成”“开发工具通过”“真实模型效果已验证”“可部署候选”四种状态，不能互相代替。本计划不自动产生最后一种许可。性能全库排名、全站视觉重做、数据治理与旧聊天扩展不加入本批。
