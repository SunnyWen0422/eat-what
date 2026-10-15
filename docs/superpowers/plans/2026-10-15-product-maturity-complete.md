# 吃什么：现阶段完整成熟度提升 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 如明确改用分任务代理执行，使用 superpowers:subagent-driven-development。Steps use checkbox syntax for tracking.

**Goal:** 一次完整交付现有一餐场景内的体验、数据、助手、性能与验证提升，保留已有设计及恢复契约，不再按评分拆成反复改方向的小轮次。

**Architecture:** 继续原生小程序+独立React网页+Java可信业务写入+Python受限模型建议。复用既有工作区、回执、质量表、组件与本地数据仓库；新增能力先定合同再接页面；所有开发汇入同一候选后统一验收。

**Tech Stack:** WXML/WXSS/JavaScript、glass-easel；React/TypeScript/Vite/IndexedDB、Node 24.x；Spring Boot 2.7/MyBatis/MySQL 8；FastAPI/Python；现有Node/Vitest/Playwright/JUnit/Python及隔离微信工具。

**Spec:** [完整设计与32项保留契约](../specs/2026-10-15-product-maturity-complete-design.md)。

**Baseline:** 4b28ae106b722e8787b38d9c6da9d800fcc283ac，2026-10-15。本文件是待执行计划；没有把新任务标成完成。计划编写不运行服务、不调用模型、不访问生产、不推送或发布。

## Global Constraints

- 正式仓库只有 project/；四个主Tab“今天 / 菜谱 / 日历 / 我的”；不加第五个助手Tab、挡内容悬浮球或无功能星星。
- 非菜品区域用温暖餐桌A；菜品卡片、助手整页/气泡/推荐用轻透F。
- 品牌#28634E、背景#F8F7F2、正文#25332B、当前辅助#56645B；字体24/18/16/13/12；正文行高1.5，长文1.65；触控44×44、主按钮≥48，字号1/1.3/2。
- 图优先：缩略圆角14、详情18；仅无图/本次加载失败占位。动画100/180/200ms；减少动态效果关闭位移；不逐卡模糊。
- 模板与token是样式唯一源，重新生成WXSS/JS；组件样式隔离保留。
- 复制编辑保存才创建；临时反馈不写长期偏好；计划、采购、阅读进度、实吃分开；价格缺失不补零，实付0合法。
- 写入必经目标/来源/变更预览、用户确认、版本/幂等/回执；未知核对原请求；过期重新核对。
- 当前V4优先，旧聊天仅兼容；网页个人数据仍属本浏览器，无微信云同步或虚构助手。
- 现有助手6000字符上下文、12000工具事实、4次供应商HTTP/轮、8次读取/轮、30秒执行租约不因本方案自动扩大。
- 规格K01–K32均为全局要求；历史文件的旧数字/默认开关不能覆盖当前事实。所有现有行为只在指定改进范围内改变。
- 原数据、私有运行环境不覆盖；破坏性测试仅新建独占库；真实模型计预算，生产部署单独完成具体发布批准。

## Review Focus

1. 用户提交后掉网/重启，且来源菜谱或计划已经删除：必须继续核对原请求，不能重复创建或失去恢复入口。T08/T09/T10/T21。
2. 正在等待时切账号/API环境/日期，旧响应或旧澄清随后返回：不能污染新对象，也不能执行旧选项。T06/T07/T09/T10。
3. 单条质量坏数据、过期内容hash、未知用量与可访问但无权益证据的图片：普通阅读可继续，派生资格不能被错误恢复。T03/T04/T05。
4. 长会话、反复查询、模型伪造成功/工具字段或超时：预算仍有界，硬限制/待确认引用不丢，回执才驱动成功。T06/T07/T20/T22。
5. 窄屏2倍字+键盘+嵌套弹层+长名称：全部内容与主动作可到达，退出与取消不丢输入；网页焦点和原生读屏单独验证。T11–T19/T23。

## 执行约定

采用一个总计划、一个待办台账、一个最终候选。按T01→T25主顺序执行，不在任务间反复要求设计批准；只有范围/外部影响实质变化才提问。T03人工证据整理可与后续实现并行，T20性能两条服务链可由不同执行者处理；接口依赖和最终验收不能跳过。

任务标签：**保留回归**不表示重造；**完善**为局部增强；**新增连接**为新的合同/入口；**验收**不冒充新增功能。文档/证据任务不强制TDD；行为任务先测试症状、后实现、再回归。未通过的检查修复后继续，不用跳过或缩小断言换通过。

每项交付一个有意义提交；提交前审查diff与相关结果。不自动推送。按用户工作区规则在正式project中实施，若存在不相关未提交改动先保留并标清，不重置工作树。

### 文件与类型约定

下列路径全部相对project/。为控制重复，**J**=backend/src/main/java/com/eatwhat，**JT**=backend/src/test/java/com/eatwhat，**JI**=backend/src/isolated-test/java/com/eatwhat。标为“新增”的路径/接口是待实施产物，其余均为现有落点。执行时遇到上游新增相同职责先复用，不能创建同义第二套服务。

- MealTarget={date:YYYY-MM-DD,mealType:breakfast|lunch|dinner}，沿用UTC+8及现有校验。
- Scope={apiBase:string,accountKey:string}，只用于本机隔离，不送模型/分析平台。
- ResourceRef={kind,id,version?}，服务端按认证用户重新解析，版本类型沿用原域合同，不统一改成数字。
- 诊断、质量状态、澄清、导航交接都不是业务写回执；不能互相代替。
- 新测试命令在任务创建相应测试后执行；非零退出立刻停止该任务，不把后续成功退出码覆盖前面的失败。

## 总依赖顺序与完成门

| 顺序 | 输出 | 必须具备的输入 |
|---|---|---|
| T01–T02 | 不丢设计的基线、证据与安全错误/观测规范 | 当前HEAD、现有测试及原始资料索引 |
| T03–T05 | 可靠字段、图片、推荐候选与解释合同 | 基线和审计口径 |
| T06–T09 | 助手上下文、澄清、只读扩展、历史、任务交接 | 数据资格与版本契约 |
| T10–T11 | 主流程恢复与共享组件 | 既有回执及助手交接合同 |
| T12–T19 | 全页面及网页一次完整落地 | 共用状态/组件/数据合同 |
| T20 | 性能优化与资源回收 | T02测量基线、已整合实现 |
| T21–T23 | 真实隔离数据、有限真实模型、原生与真机 | 同一冻结候选及合法测试环境 |
| T24–T25 | 用户证据、重评、匹配发布包与回退单 | 验收事实；正式发布仍是独立动作 |

---

## T01 — 冻结保留契约与可验证基线（保留回归）

**依赖：** 无。**保留：** K01–K32。

**Files:** 新增 docs/testing/product-maturity-baseline.md、scripts/acceptance/maturity-cases.json；修改 docs/superpowers/plans/2026-10-15-product-maturity-coverage.json、DEVELOPER.md。读取app.json、design/tokens.json、现有体验规格/验收/研究，不改历史结果。

**Interfaces:** 产出 Case={id,route,scenario,requirements,sourceSha,dataset,environment,status,evidence}；status为planned/captured/asserted/manual_pass/failed/blocked，captured不能自动升pass。环境和具体目标必须记录。

- [ ] 记录HEAD、工作树、27路由、网页路由、能力默认值与本轮不访问的环境；从K清单建立可追踪case ID。
- [ ] 对同一最终源码与夹具保存改前基线；取不到截图就记录blocked，不引用旧图作同源对照。
- [ ] 建立八条主链：自动选餐、手动选餐、本餐调整、日历保存、采购、做菜、实吃、更正/中断恢复；为每条加入取消、重复和失败支线。
- [ ] 将旧报告标注时间与适用源码，新增当前文档入口；不重写旧历史为“已全部完成”。
- [ ] 校验路由集合等于app.json且K01–K32都有任务和case；提交 docs: freeze maturity contracts and acceptance baseline。

**完成门：** 任何执行者能知道哪些细节必须保留、什么是未测；没有页面或业务链只写“正常-or-empty”而无具体夹具。

## T02 — 安全错误与最小观测（完善）

**依赖：** T01。**保留：** K22/K26/K29–K31。

**Files:** 修改 J/controller/RecommendController.java、J/exception/GlobalExceptionHandler.java、J/config/RequestObservabilityFilter.java、utils/meal-workflow.js；新增 J/service/ExperienceMetrics.java、JT/service/ExperienceErrorContractTest.java、tests/experience-error-contract.test.js。

**Interfaces:** ExperienceMetrics.recordStage(stage,outcome,durationMs,count)仅接有限枚举；errorCode映射认证/权限/校验/冲突/忙/暂不可用/未知结果，复用原HTTP状态和返回形状。未知异常固定安全提示，诊断关联号可选复制，不常驻显示。

- [ ] 写shouldHideUnexpectedDiagnosticsAndRetainUnknownOutcome：注入带SQL/路径/token的异常，响应不含原文；断网后的写入仍判unknown，不当成可新建重试；401与403不互换。
- [ ] 运行 mvn -f backend/pom.xml -Dtest=ExperienceErrorContractTest test 及 node --test tests/experience-error-contract.test.js，确认新断言覆盖原症状。
- [ ] 去除旧推荐接口完整req日志与e.getMessage()直返；添加有界阶段计数，沿用request关联和Actuator，不建第二监控平台。
- [ ] 用日志捕获测试断言没有自由文本、菜谱全文、凭据、用户高基数标签；保留控制器兼容合同。
- [ ] 重跑定向测试并提交 fix: normalize safe service errors and bounded diagnostics。

**完成门：** 用户知道下一步；开发者有排查证据；没有泄漏内部诊断或新增分析外发。

## T03 — 全量质量审计、分项资格与坏记录隔离（完善）

**依赖：** T01/T02。**保留：** K18/K23/K25。

**Files:** 修改 scripts/catalog_quality.py、scripts/build_catalog_quality.py、scripts/validate_catalog_reviews.py、scripts/catalog-quality-rules.json、J/service/DishQualityService.java、J/dto/CatalogQuality.java、docs/data/catalog-review-standard.md；新增 tests/test_catalog_maturity.py、JT/service/DishQualityIsolationTest.java。

**Interfaces:** audit_catalog(source)->{counts,missing,duplicates,anomalies,reviewQueue,sourceHash,rulesVersion}；质量展示沿用现有字段，新资格计算getEffectiveCapabilities(dish,quality)->{browsable,recommendable,scalable,priceable,reasons}，服务端真值，前端不得自升VERIFIED。

- [ ] Python测试覆盖缺失/重复ID/同名不同菜/异常单位/伪材料/步骤缺损/hash变化/所有权；Java测试一条坏JSON不拖累正常菜、失效核验不继承换算能力、数据库整体故障不吞成可信。
- [ ] 运行 python -m unittest discover -s tests -p test_catalog_maturity.py 与 mvn -f backend/pom.xml -Dtest=DishQualityIsolationTest test，保留失败证据。
- [ ] 实现全量剖析与分项降级；所有输出写新目录。只隔离已识别的数据损坏，连接故障仍有可诊断状态；原材料原文可读，派生值保持未知。
- [ ] 形成最多100道分层核验工作集（30荤/30素/20汤/15主食/5甜品），每道给结论与原文定位；不够或缺证据标UNKNOWN，不伪造克数/人数/时间。旧6,665等数量重新计算。
- [ ] 比较两次执行输出hash，核对原文件hash不变；重跑测试并提交 feat: isolate catalog quality and produce reproducible audits。

**完成门：** 自动审计覆盖全量，首批每条有处理结论；未核验队列明确。人工证据未齐不阻塞其他代码，但不得开放该字段计算资格。

## T04 — 图片与菜谱事实贯通两端（完善）

**依赖：** T03。**保留：** K05/K06/K13/K25/K26。

**Files:** 修改 utils/dish-image.js、components/compact-dish-row/index.js、components/assistant-card/index.js、web/src/catalog/media.ts、web/src/ui/RecipeImage.tsx、J/service/PublicCatalogService.java；新增 tests/dish-media-lifecycle.test.js、web/test/media-lifecycle.test.tsx、scripts/audit_catalog_media.py。

**Interfaces:** 媒体身份继续dishId+contentVersion+URL；audit_catalog_media --input <审计清单> --out <新目录>，默认仅URL语法检查；只有显式--probe才访问限定图片源，不携带个人凭据。

- [ ] 测试有图/无图/首次失败/同组件换菜/换地址/旧成功迟到/步骤图；assert新URL不继承旧failure，原来源仍保留，非图片协议拒绝。
- [ ] 运行 node --test tests/dish-media-lifecycle.test.js；在web运行 npm test -- --run test/media-lifecycle.test.tsx。
- [ ] 修齐从公共DTO/缓存/卡片/详情/助手到image的字段传递，精确域名兼容不扩大；加载时保留占位尺寸，失败不清菜单。
- [ ] 审计全量语法、分层外链可达性和来源依据；故障按无图/404/类型/证书/网络分开。权益未知不得因200改为VERIFIED。
- [ ] 复跑有图和失败回归并提交 fix: preserve recipe media through cards and cache changes。

**完成门：** 所有菜品展示路径遵守实图优先，来源可追溯；不能承诺第三方永不失效。

## T05 — 推荐质量、显式偏好与真实理由（完善）

**依赖：** T03/T04。**保留：** K10/K14/K23–K25。

**Files:** 修改 J/service/MealWorkspacePlanner.java、J/service/RecommendationScorer.java、J/service/DishCandidateQueryService.java、utils/meal-feedback.js、web/src/menu/rules.ts；新增 JT/service/RecommendationEvidenceTest.java、tests/recommendation-evidence.test.js、web/test/recommendation-evidence.test.ts。

**Interfaces:** RecommendationEvidence={codes,sourceVersion,unknownFields}；代码限定已设置条件匹配/明确实吃避重/食材匹配/保留菜。展示最多两条短理由，其余按需。不会新增永久黑名单或隐式记忆。

- [ ] 固定种子测试硬忌口优先、OR标签一致、早餐资格、保留菜、近期实吃与计划分离、未知时间不说快手、收藏不会压过硬限制。
- [ ] 运行 mvn -f backend/pom.xml -Dtest=RecommendationEvidenceTest test；Node及web对应文件测试，先证明缺口。
- [ ] 让评分依据和理由来自同一验证事实；无候选给明确受限项与自己选菜入口，不静默放宽。每餐反馈只调用现有命令。
- [ ] 对同一候选集比较新旧限制与多样性；解释不增加常驻文字墙，未知时间保留未知。
- [ ] 回归并提交 feat: ground recommendation reasons in verified meal facts。

**完成门：** 智能改善来自事实与选择，不是多写夸赞话；性能结构优化留T20，先冻结语义。

## T06 — 助手上下文去重与扩展协商（完善）

**依赖：** T02/T05。**保留：** K19/K21–K24/K30。

**Files:** 修改 J/dto/AssistantV4Contract.java、J/service/AssistantV4ContextService.java、J/service/AssistantV4TurnService.java、J/service/AssistantV4ModelGateway.java、recommend-service/assistant_v4_schema.py、recommend-service/assistant_v4_step.py、utils/assistant-conversation.js；新增 JT/service/AssistantContextBudgetTest.java、tests/test_assistant_context_budget.py。

**Interfaces:** TurnRequest.uiFeatures?:string[]（最多8个、允许clarification_v1/handoff_v1；缺省[]），存入已有input_json并计入请求hash；能力响应增加supportedUiFeatures。老端不发送，新端仅探测后发送。不改变现有业务动作种类。模型上下文传输采用单一历史来源，消费者同步调整。

- [ ] 测试历史每条只进供应商请求一次；12条/每条400限制、6000/12000预算仍有效；保留菜/硬限制/待确认引用不被挤出；savedMenus确为个人常用菜单而非日历。
- [ ] 测试旧请求无uiFeatures完全兼容、未知feature拒绝、新请求在旧后端能力为空时不发送；同requestId不同feature内容冲突，不产生第二轮。
- [ ] 增加Java/Python版本配对测试：新Python只按调用方能力提供工具，新Java配旧Python时扩展能力不得宣告可用；基础assistant.v4.1旧请求不含新字段且保持可读。扩展能力只有两端合同检查通过才开启。
- [ ] 去除重复文本但保留本轮工具call ID和供应商必要续接字段；不持久化推理内容；所有私有字段按现有白名单最小发送。
- [ ] 运行 mvn -f backend/pom.xml -Dtest=AssistantContextBudgetTest test 与 python -m unittest discover -s tests -p test_assistant_context_budget.py；补JS旧后端兼容用例。
- [ ] 提交 refactor: budget assistant context once and negotiate UI guidance。

**完成门：** 合同端到端一致，扩展不要求旧端理解新卡，不以字符预算冒充token费用。

## T07 — 合法选项、个人内容读取与结构化澄清（新增连接）

**依赖：** T05/T06。**保留：** K19–K24。

**Files:** 修改 J/service/AssistantCapabilityService.java、J/service/AssistantReadToolService.java、J/service/AssistantV4TurnService.java、J/dto/AssistantV4Contract.java、recommend-service/assistant_v4_schema.py、recommend-service/assistant_v4_step.py；新增 J/service/AssistantGuidanceService.java、JT/service/AssistantGuidanceTest.java、tests/test_assistant_guidance.py。

**Interfaces:** 新只读get_recommendation_options({group?})、read_favorites({query?,cursor?,limit:1..20})、read_saved_menus({query?,menuId?,cursor?,limit:1..20})，复用现有元数据/收藏/个人菜单服务。query最多200字符，group仅现有元数据组枚举；menuId验证认证归属。澄清={kind,questionCode,requiredFields,authorizedOptions[0..4],continuationRef,workspaceRef}；kind限meal_target/dish_reference/source_choice/missing_people，模型只能声明类型，具体选项由Java生成。

**选择提交合同：** TurnRequest新增clarificationChoice?:{continuationRef,optionId,date?}，只对clarification_v1客户端开放并计入请求hash。continuationRef指向原turn内保存的合法澄清卡，AssistantGuidanceService.resolveChoice(user,request)->ValidatedChoice在模型调用前校验账号/会话/工作区版本/状态；卡有效期10分钟，过期重问。同一请求重放幂等，冲突不消费。date仅日期选择项允许且沿用原MealTarget日期校验；其他选项内容从原卡读取，不信任客户端回传菜名/ID。澄清结果是输入事实，不是写入批准。

- [ ] 覆盖空收藏、同名菜单、下架/无权菜、错误选项码、分页、菜单版本变更；assert只读不创建草稿/计划。
- [ ] 覆盖日期不明不默认今天、选项期间菜单改变、重复选择、账户切换、保留菜不可偷换；未选择零写入，选择后仍需原动作确认。
- [ ] 扩白名单和JSON schema、工具结果裁剪；个人菜单初始最多5摘要仍保留，细节按需读。选择码保持既有OR规则。
- [ ] 增加模型澄清可选结构，Java清理为合法卡；不支持uiFeatures的客户端仅获得旧问句。任何模型自由reply不得伪装执行成功。
- [ ] 运行 mvn -f backend/pom.xml -Dtest=AssistantGuidanceTest test 与 python -m unittest discover -s tests -p test_assistant_guidance.py；提交 feat: add grounded assistant choices and personal reads。

**完成门：** 新读工具、Java/Python/客户端三方清单一致；响应给真实对象，不扩大任意写权限。

## T08 — 新助手历史与原会话恢复（新增连接）

**依赖：** T06。**保留：** K19/K22/K28/K30。

**Files:** 修改 J/controller/AssistantV4Controller.java、J/service/AssistantV4Store.java、J/mapper/AssistantV4Mapper.java、J/dto/AssistantV4Contract.java、utils/api.js、utils/assistant-conversation.js、utils/assistant-page.js、pages/assistant-history/assistant-history.js、pages/assistant-history/assistant-history.wxml；新增 JT/service/AssistantSessionListTest.java、tests/assistant-v4-history.test.js。

**Interfaces:** GET /api/assistant/v4/sessions?cursor=&limit=20，limit1..50；响应{sessions:[{sessionId,workspaceRef,target,updatedAt,lastStatus,hasPending}],nextCursor}。认证用户范围，稳定(updatedAt,id)游标；摘要不放整段消息。现有GET单会话及删除继续复用。

- [ ] 测试同时间多条稳定分页、并发更新/删除不串用户、非法游标、关闭能力后读取与写入分别遵守现有规则。
- [ ] 前端测试新历史继续绑定原workspace、重读版本；重启后未知动作可核对；旧记录不误当V4，删除会话不删日历/采购/实吃。
- [ ] 添加列表查询及必要增量索引；先检查现有索引，只有缺少(user_id,updated_at,id)支撑才写下一未使用迁移号，不改旧迁移。
- [ ] 历史页优先“餐桌助手记录”，旧记录次级展开；继续按钮与只读浏览分开，读卡不重放提交。
- [ ] 运行 mvn -f backend/pom.xml -Dtest=AssistantSessionListTest test 及 node --test tests/assistant-v4-history.test.js tests/assistant-history.test.js；提交 feat: connect V4 session history and recovery。

**完成门：** 历史入口真正覆盖新助手；游标、清理与回执恢复不冲突。

## T09 — 助手到已有功能的安全交接（新增连接）

**依赖：** T07/T08。**保留：** K15–K24/K30。

**Files:** 新增 utils/assistant-action-handoff.js、tests/assistant-action-handoff.test.js；修改 J/service/AssistantGuidanceService.java、J/service/AssistantV4TurnService.java、J/dto/AssistantV4Contract.java、recommend-service/assistant_v4_schema.py、recommend-service/assistant_v4_step.py、utils/assistant-cards.js、utils/assistant-page.js、utils/meal-actual-entry.js、pages/settings/settings.js、pages/shopping-list/shopping-list.js、pages/custom-dishes/custom-dishes.js、pages/favorite-dishes/favorite-dishes.js、pages/dish-detail/dish-detail.js。

**Interfaces:** createActionHandoffStore({storage,scopeKey,now}).put(payload)->token / take(token)->payload|null；payload={kind,ref,target?,sourceVersion?,prefill?}，kind限record_actual/edit_preferences/edit_shopping/copy_recipe/save_personal_menu/use_personal_menu/view_favorite。scope与10分钟一次消费沿用问菜约束，类型由Java授权事实生成，route由本地枚举映射。prefill只保留用户原句及当前授权事实：实吃含待核对菜ID/目标、偏好含待确认字段建议、采购含条目引用、复制含原菜引用；不能从“少糖/快一点”生成确定克数或时长。目标页重新读取原值，用户明确应用后才进入原保存流程。

**模型建议合同：** StepOutput可增加type=navigation及navigationIntent={kind,ref,target?,userText?}，仅在本轮handoff_v1能力下加入供应商schema；kind为上面的白名单，不属于ACTIONS三类写协议。Java resolveNavigation(user,intent,scope)重新取对象并校验，生成type=handoff展示卡；无权限/字段不足转澄清，无uiFeatures转简短操作说明。原始模型URL、预填数字和成功声明一律不能直达页面。

- [ ] 测试过期/重复/跨账号/跨API/任意URL拒绝；到页后对象删改重核，现有输入非空先确认，未知写入不得被新交接覆盖。
- [ ] 分别验：实吃先选餐确认；偏好全量原值不能被模型增量覆盖；采购同名形态部位先选择；复制取消无副本；常用菜单保存取消无写入。
- [ ] 交接到既有编辑/确认流程，不自动触发业务保存；“用于本餐”复用菜单resolve及保留项冲突处理，不建第二个选菜引擎。
- [ ] 返回助手只根据目标页原业务回执显示完成；没有回执不发成功卡，取消留“未保存”或无成功消息。
- [ ] 扩T07的AssistantGuidanceTest及test_assistant_guidance.py覆盖navigation白名单/旧端/越权/伪造字段；运行这两套及 node --test tests/assistant-action-handoff.test.js tests/personal-copy-recovery.test.js tests/meal-feedback-preference-scope.test.js；提交 feat: hand assistant tasks to existing confirmed workflows。

**完成门：** 用户能完成更多任务，模型直接写工具仍只有3类；取消/离线不多写。

## T10 — 全旅程状态与中断继续（完善）

**依赖：** T02/T08/T09。**保留：** K09–K18/K22/K30/K31。

**Files:** 修改 utils/meal-workspace-presentation.js、utils/meal-next-step.js、utils/meal-action-feedback.js、utils/meal-workflow.js、pages/sync/sync.js；新增 utils/meal-journey-presentation.js、tests/meal-journey-recovery.test.js。

**Interfaces:** deriveMealJourney({workspace,plan,actual,shoppingSources,pendingReceipts})->{primary,secondary,recovery,target}，纯展示无写入；恢复优先unknown>conflict>busy>unapplied>normal。只投影原持久请求，不存第二份写请求/自动重试队列。

- [ ] 写四条旅程及退出重开/跨日/来源删除/10次双击测试；assert最终数据库写次数只一次、未实际确认不产生eaten。
- [ ] 固定主按钮状态表；保存到别日后目标准确；采购多餐不能猜目标；失败仍显示原菜单与原请求恢复。
- [ ] “我的→账户与恢复”聚合已有恢复指针，首页最多显示一项相关待办；未知来源不用模糊的“继续上次”按钮。
- [ ] 运行 node --test tests/meal-journey-recovery.test.js tests/experience-journeys.test.js tests/workspace-day-boundary.test.js；对状态表逐行核对。
- [ ] 提交 feat: unify meal continuation without duplicating write state。

**完成门：** 主流程与失败流程都能找到下一步；不靠新常驻说明填补流程漏洞。

## T11 — 共享组件、大字、键盘、读屏和动效（完善）

**依赖：** T10。**保留：** K02–K08/K31。

**Files:** 修改 components/ui-field/ui-field.js、components/ui-field/ui-field.wxml、components/ui-confirm/ui-confirm.js、components/ui-confirm/ui-confirm.wxml、components/ui-sheet/ui-sheet.js、design/tokens.json、design/component-theme.wxss.tpl、design/theme.wxss.tpl；新增 tests/component-accessibility.test.js、tests/motion-contract.test.js。

**Interfaces:** ui-field新增accessibleLabel/errorId，确认弹层可读标题/描述；沿用ui-sheet.returnFocusId/restorefocus与keyboardHeight逻辑。实际支持的微信语义属性以基础库验证为准，不能为测试臆造API。

- [ ] 测试输入label/错误不重复朗读、禁用/选中有状态、44点击节点实际尺寸、2倍字换行；保留现有键盘极端高度与footer滚动。
- [ ] 补属性和调用接线，不重造弹层；主次按钮边界不退化；页面/组件模板分别维护避免样式隔离失效。
- [ ] 将按压/更新/弹层都接现有100/180/200ms token，reducedMotion时位移为0；旧兼容闪动也服从设置。
- [ ] 运行 python scripts/build_ui_assets.py、node --test tests/component-accessibility.test.js tests/motion-contract.test.js；检查生成diff仅预期文件。
- [ ] 原生先看320/390/430及键盘关键样例，完整记录留T23；提交 feat: finish accessible warm-glass interaction primitives。

**完成门：** 后续页面只复用已测组件；按钮有边界，字体与状态可读。

## T12 — 今天与本餐结果精修（完善）

**依赖：** T05/T10/T11。**保留：** K09–K11/K14/K19。

**Files:** 修改 templates/meal-workspace.wxml、utils/meal-workspace-page.js、utils/meal-workspace-presentation.js、design/wxss/styles/workspace.tpl、components/compact-dish-row/index.wxml；新增 tests/today-maturity.test.js。

**Interfaces:** 沿用deriveWorkspacePresentation、feedbackAction；新增字段限展示，不另建菜单state。搭配说明文案固定“应用后保留此搭配”，只在实际约束冲突时附原因。

- [ ] 测试空菜单/有菜单/未应用/保留/同步未知/冲突/保存别日状态；assert同餐点击菜单与草稿不变、保留菜不自动解除。
- [ ] 把多余摘要/过程文字移除，保留受影响位置的可行动提示；换菜只更新该行，成功反馈不挤出主菜单。
- [ ] 390正常字核对首屏≥2完整卡；大字分行、操作不挤图；按原函数保留生成/停止/保存/恢复语义。
- [ ] 运行 node --test tests/today-maturity.test.js tests/meal-feedback.test.js tests/experience-composition.test.js；生成样式并提交 feat: refine menu-first meal decisions。

## T13 — 菜谱、详情、收藏、个人菜与常用菜单（完善）

**依赖：** T04/T09/T11。**保留：** K06/K12/K13/K15/K24/K25。

**Files:** 修改 pages/customize/customize.js、pages/customize/customize.wxml、pages/dish-detail/dish-detail.wxml、pages/favorite-dishes/favorite-dishes.js、pages/favorite-dishes/favorite-dishes.wxml、pages/custom-dishes/custom-dishes.js、pages/custom-dishes/custom-dishes.wxml、对应design/wxss/pages下现有模板；新增 tests/recipe-browsing-maturity.test.js。

**Interfaces:** 查询状态按API/账号/条件/请求代次隔离；返回保留当前query/category/filter/scrollAnchor。收藏底栏仅有选择或恢复任务时出现；完整菜名/步骤在详情可读。

- [ ] 测试快速输入迟到响应、返回位置、分类末项、筛选清空、缺图/坏图/长名；空结果提供改条件，非技术错误堆栈。
- [ ] 内容层级固定标题与对齐操作→图片→材料→步骤→折叠来源；未知时间/用量不补值；详情问菜继续预填不发送。
- [ ] 个人菜最少字段先填、时间图片选填；常用菜单复用前核对覆盖；复制取消/未知/来源下架恢复全部回归。
- [ ] 运行 node --test tests/recipe-browsing-maturity.test.js tests/personal-copy-recovery.test.js tests/experience-personal-recipes.test.js tests/assistant-entry.test.js；生成模板产物。
- [ ] 提交 feat: finish recipe browsing and personal content continuity。

## T14 — 日历、实际用餐与回顾（完善）

**依赖：** T09/T10/T11。**保留：** K16/K22/K23/K30。

**Files:** 修改 pages/calendar/calendar.js、pages/calendar/calendar.wxml、pages/calendar-detail/calendar-detail.js、pages/calendar-detail/calendar-detail.wxml、utils/calendar-meal-presentation.js、utils/meal-actual-entry.js、pages/statistics/statistics.wxml；新增 tests/calendar-maturity.test.js。

**Interfaces:** 日期读屏名含完整日期+选中+计划/实吃摘要；跳转统一MealTarget，仍用现有计划/实吃revision和墓碑版本。

- [ ] 测试跨月、UTC+8零点、同名不同餐、计划删后实吃、改实吃与原计划不同、重复和未知恢复；无记录不写“没吃饭”。
- [ ] 保留状态差异与来源，精简并列操作为当前主动作+更多；历史目标不误提示购物来源。
- [ ] 实吃确认显示目标、实际菜名与“按计划/有调整”选项；取消不写，重开先核对原请求。
- [ ] 运行 node --test tests/calendar-maturity.test.js tests/calendar-actual-recovery.test.js tests/experience-calendar.test.js；提交 feat: clarify calendar plans and actual meal records。

## T15 — 采购、费用与来源完整衔接（完善）

**依赖：** T03/T09/T10/T11。**保留：** K17/K18/K22。

**Files:** 修改 pages/shopping-preview/shopping-preview.js、pages/shopping-preview/shopping-preview.wxml、pages/shopping-list/shopping-list.js、pages/shopping-list/shopping-list.wxml、utils/shopping-prices.js、components/compact-ingredient-row/index.wxml；新增 tests/shopping-maturity.test.js。

**Interfaces:** 复用现有价格能力探测及金额接口；价格展示={reference?,quoteDate?,estimate?,actualSpend?}，空与0分开。无能力时不探测循环、不影响购物主流程；费用默认折叠。

- [ ] 测试同名不同部位/形态不混、原文本数量保留、跨餐来源、已有排除、实际加入回执、过期重新核对、重试不重复加。
- [ ] 按待买/已买和食材/按菜组织，来源按需展开；已买可撤销，清单为空提供从日历准备入口。
- [ ] 费用区接现有参考/实付，缺参考仍可独立记录实付；实付一次按汇总食材记录，不分摊、不造历史；权限或功能关闭时保留主清单。
- [ ] 运行 node --test tests/shopping-maturity.test.js tests/experience-shopping-list.test.js tests/experience-shopping-preview.test.js；回归实际支出0、缺价、不能换算三例。
- [ ] 提交 feat: complete shopping sources and optional expense experience。

**完成门：** 不为了让费用区有数字造估值；未配置的商超跳转仍不开放。

## T16 — 做菜阅读与继续（完善现有进度，不重造）

**依赖：** T04/T10/T11/T14。**保留：** K13/K16/K30。

**Files:** 修改 pages/meal-cooking/meal-cooking.js、pages/meal-cooking/meal-cooking.wxml、utils/cooking-progress.js、design/wxss/pages/meal-cooking/meal-cooking.tpl；新增 tests/cooking-continuity.test.js。

**Interfaces:** 沿用现有scope/date/mealType/planRevision或contentVersion进度键；loadProgress/saveProgress保持阅读状态含义。无版本的菜谱以内容指纹避免改步骤后用错旧位置。

- [ ] 测试两菜同名不同ID、多菜切换、退后台/重开、长步骤、空步骤、步骤版本变化、账号环境切换。
- [ ] 改善材料随手查看与当前步骤位置；已读进度不等于烹饪完成；内容变化提示后从有效位置开始。
- [ ] 单菜来源与本餐来源保持区分，记录实吃按钮继续打开原确认；未来日期不允许伪记录当前实吃。
- [ ] 运行 node --test tests/cooking-continuity.test.js；2倍字/键盘实际核对交T23；提交 feat: refine cooking reading and versioned resume。

## T17 — 助手对话、结果卡与历史界面（完善）

**依赖：** T06–T11/T16。**保留：** K19–K24/K31。

**Files:** 修改 utils/assistant-page.js、utils/assistant-conversation.js、utils/assistant-cards.js、components/assistant-card/index.js、components/assistant-card/index.wxml、pages/chat/chat.wxml、pages/assistant-history/assistant-history.wxml、对应design模板；新增 tests/assistant-maturity-ui.test.js。

**Interfaces:** 卡片展示只接T07合法澄清/T09handoff/T08历史和既有事实/回执；最多4快捷项；同一任务只一个当前可操作卡，历史卡可读但不能重新确认。

- [ ] 测试现有输入替换取消、问菜恢复桥、澄清选择、部分完成、旧卡失效、关闭能力后旧确认不可用、上划读历史收到新消息不被强拉底。
- [ ] F保持清晰文字面；一行上下文/折叠菜单；短进度只描述真实状态，不模拟模型思考；停止与重试边界清楚。
- [ ] 成功卡简短指出真实变化与目标去向；采购只显示实际加入；“去编辑”等交接不显示“已完成”。
- [ ] 运行 node --test tests/assistant-maturity-ui.test.js tests/assistant-cards.test.js tests/assistant-conversation.test.js tests/assistant-entry.test.js。
- [ ] 提交 feat: make assistant choices results and recovery explicit。

## T18 — 我的、偏好、同步与其余页面（完善）

**依赖：** T08–T11/T13–T17。**保留：** K01/K24/K27/K28/K30/K31。

**Files:** 修改 pages/profile/profile.wxml、pages/settings/settings.wxml、pages/profile-edit/profile-edit.wxml、pages/sync/sync.wxml、pages/about/about.wxml、pages/logs/logs.wxml、pages/recommend-filter/recommend-filter.wxml；管理六页仅按覆盖表修改必要公共绑定/对应design模板；新增 tests/secondary-pages-maturity.test.js。

**Interfaces:** 仍三组“常用内容/偏好设置/账户与恢复”；管理权限沿原服务判定；诊断信息可复制但默认不展示技术全文。

- [ ] 测试常用人数与本餐分离、每道菜用时上限、长期保存失败保留输入、账号迟到、复制/助手/实吃待恢复入口。
- [ ] 删除重复帮助和旧能力承诺；关于如实说明语音/图片/数据/模型隐私；logs不当饮食记录。
- [ ] 管理页只补布局、权限/分页/失败反馈；不加权限、不替换管理业务。
- [ ] 运行 node --test tests/secondary-pages-maturity.test.js tests/meal-feedback-preference-scope.test.js；核对全27页已分配，提交 feat: finish secondary pages without losing recovery access。

## T19 — 网页完整同风格落地（完善）

**依赖：** T04/T05/T10–T18。**保留：** K02–K08/K15–K18/K27。

**Files:** 修改 web/src/ui/Today.tsx、Recipes.tsx、Calendar.tsx、Shopping.tsx、My.tsx、PersonalActions.tsx、DataManagement.tsx、components.tsx、styles.css、web/src/catalog/media.ts；新增 web/test/maturity-ui.test.tsx、web/e2e/maturity-journey.spec.ts。

**Interfaces:** 复用web现有repository/menu/shopping API与IndexedDB版本；同步视觉/层级/事实规则，不共享小程序账户或借私有API实现假同步。

- [ ] 测试取消编辑、重复当前餐次、未应用条件、回收站对象类型、菜图、采购部位、断存储/备份导入失败；assert原数据不被覆盖。
- [ ] 今天/菜谱/详情/日历/采购/我的按小程序已定层级精修；桌面多列但主操作唯一；日历与购物次级并列操作收进更多。
- [ ] 保留Dialog键盘焦点闭环、浏览器后退、skip link与本地存储边界；价格只用网页实际可得能力，不冒接微信实付接口。
- [ ] 在web运行 npm test -- --run test/maturity-ui.test.tsx、npm run typecheck、npm run boundaries、npm run build、npm run e2e -- --project=chromium maturity-journey.spec.ts；浏览器宽320/390/430/1280×字号1/1.3/2。
- [ ] 提交 feat: align web maturity within local data boundaries。

## T20 — 候选查询与模型资源性能（完善）

**依赖：** T02–T07/T19。**保留：** K21–K23/K29。

**Files:** 修改 J/service/MealWorkspacePlanner.java、J/service/DishCandidateQueryService.java、J/service/AssistantReadToolService.java、J/mapper/DishMapper.java、recommend-service/assistant_v4_provider.py、recommend-service/assistant_v4_step.py、recommend-service/main.py；新增 JT/service/CandidateScanEquivalenceTest.java、tests/test_provider_lifecycle.py、scripts/benchmark_maturity.py。

**Interfaces:** CandidateScan按≤256轻字段批次、详情按最终ID读取；扫描状态绑定用户/过滤/目录版本。FastAPI lifespan持有有界HTTP客户端；不允许asyncio.run跨循环复用客户端。benchmark_maturity --config <私有运行配置> --out <新目录>，只能本机专属目标、默认替身模型。

- [ ] 建性能改前基线及语义等价测试：固定种子全候选覆盖、硬忌口、早餐、保留、排序/游标/快照、权限零差异；不得截前N条省事。
- [ ] 将配餐/助手检索改为轻字段有界扫描、最终取详情；保持普通COUNT+LIMIT及复杂准确总数O(N)事实；避免N+1与跨用户缓存。
- [ ] 为供应商连接实现lifespan资源管理；测试慢DNS/慢响应体/拒绝/取消/退出/队列满，绝对截止不延长、不自动重试；不能仅返回超时而无限遗留后台线程。
- [ ] 运行 mvn -f backend/pom.xml -Dtest=CandidateScanEquivalenceTest test 与 python -m unittest discover -s tests -p test_provider_lifecycle.py。
- [ ] 按规格当前快照/50k×1/10/25并发、30分钟测p50/p95/p99/错误/堆GC/连接线程/队列；产出基线差异与容量建议，未达目标不隐去。提交 perf: bound candidate reads and provider resources。

**完成门：** 性能证据和业务等价同过；无模型供应商压测，无生产压力测试。

## T21 — 同版本全栈与真实数据隔离验收（验收）

**依赖：** T01–T20。**保留：** K15–K18/K22/K23/K25/K30/K32。

**Files:** 新增 scripts/run_maturity_acceptance.py、tests/test_maturity_acceptance_guards.py、tests/fixtures/maturity-journeys.json、docs/testing/product-maturity-integration.md；复用 scripts/run_mysql_integration.py、scripts/local_maturity.py、scripts/assistant_v4_acceptance.py、backend/isolated-tests/README.md。

**Interfaces:** run_maturity_acceptance --config <私有JSON> --stage database --out <新目录>。配置记录sourceSha/datasetHash/ownedProcessManifest/loopbackApi/privateDb/modelBudgetLedger；校验全部目标归属、仅回环、凭据不打印；缺任何核对即拒绝。每case有API结果和持久化断言。

- [ ] 先测试防护：生产URL、既有共享库、缺归属、旧JAR、跳过凭据/网络检查全部拒绝；默认不调用真实模型。
- [ ] 分开创建合成空库IT与备份脱敏库；备份hash固定，保持原件不改；专属测试账号只写自己数据，真实私人记录不进外部模型。
- [ ] 完整运行登录边界→生成→保留/换菜→跨日保存→采购→做菜→实吃→改实吃→复制/恢复→新助手历史/交接，加入冲突、重复、掉线、重启、取消。
- [ ] 核对真实MySQL行、版本、回执、采购来源键/形态、实际条目数，不只HTTP200；既有10项IT在相关代码变化后复跑。
- [ ] 在同一SHA执行适用Node/Python/Java/web及verify；日志、数据hash、包hash与未测分别登记，提交 test: verify maturity journeys on isolated full-stack data。

**完成门：** 代码候选可进入模型/原生验收；不能因此宣布生产就绪。

## T22 — 模型离线与有限真实请求验收（验收）

**依赖：** T21。**保留：** K19/K21–K24/K32。

**Files:** 修改 tests/fixtures/assistant-v4-evaluation.jsonl、scripts/assistant_v4_acceptance.py、scripts/assistant_v4_live_acceptance.py、scripts/assistant_v4_provider_budget.py；新增 docs/testing/product-maturity-model.md。

**Interfaces:** 所有场景记录HTTP尝试数/业务断言/用时/输出安全/最终回执；一次会话可能消耗多次HTTP，预算按实际尝试预留后扣账，失败也扣。复用现有硬预算入口，禁止另写绕过入口。

- [ ] 离线矩阵补：指代/保留换菜、日期澄清、多步部分完成、收藏菜单、长期意图交接、伪成功、错误工具码、硬限制、截断/上限、取消恢复和过期。
- [ ] 固定最终候选后读现有预算账本与有效授权，剩余额度覆盖才开真实请求；不足则记录待测，不假定早先20次仍剩20次。
- [ ] 本次真实尝试分配上限20：找菜/词典/个人内容4；调整及保留4；日期澄清/保存4；采购来源4；实际回顾/安全交接4。每组是HTTP次数上限，不是保证完成的会话数；未用额度可在总额内重分配，仍逐次预留。
- [ ] 使用合成文本/测试账户和可公开菜谱，不外发真实私人记录；写入只到隔离库。核对任务成功、限制遵守、确认与真实回执，不能HTTP200即通过。
- [ ] 报告通过/失败/预算耗尽/未测及具体请求次数；失败修复后仅复跑受影响场景和必要回归，追加真实次数须仍在有效预算内。提交 test: evaluate grounded assistant tasks with bounded provider calls。

## T23 — 全页面原生、真机与连续交互验收（验收）

**依赖：** T21；模型部分验收依T22相应场景。**保留：** K01–K20/K27/K31/K32。

**Files:** 修改 scripts/acceptance/meal-experience-native.cjs、scripts/acceptance/maturity-cases.json；新增 docs/testing/product-maturity-native.md、web/e2e/maturity-accessibility.spec.ts。

**Interfaces:** 保留touristappid/网络guard/manifest/hash校验隔离截图路径；另开明确标记的真实本机服务验收项目，不以移除guard冒充同一环境。记录设备/基础库/fontScale/window/源码/数据/网络目标。

- [ ] 覆盖全部27路由，每页适用正常/加载/空/错误/权限/能力；八条主链做真正点击/返回/重开，不只setData截图。
- [ ] 原生320/390/430×1/1.3/2及至少iOS/Android各1台；键盘中文输入、弹层安全区、最后元素、读屏、减弱动效和慢网分别检查。
- [ ] 用连续帧/录像核对换菜/弹层/新消息不跳屏，普通信息不抢焦点；大字不强求卡片同屏数，但全文与操作完整。
- [ ] 网页跑键盘顺序、模态焦点返回、窄屏、大字、后退、输入保存；差异写具体平台，不把Chromium当微信证据。
- [ ] 同源预览与实际截图逐项比较，发现偏差先修产品/模板再复验；captured保持与pass分开，缺设备明确blocked。
- [ ] 提交 test: complete native web and device experience evidence。

**完成门：** 真机缺口未补时仅“代码候选”，不得“全量可发布”。

## T24 — 真实用户任务验证与定向修正（验收）

**依赖：** T21/T23；可按已验证模型范围纳入T22。**保留：** K31/K32。

**Files:** 新增 docs/testing/product-maturity-usability.md、docs/testing/product-maturity-usability-template.csv。不得将参与者个人资料或原始录屏提交仓库。

**Interfaces:** 每人4任务：选出一餐、保存指定日期、准备并查看采购、记录与计划不同的实吃；10人共40次。记录独立完成/耗时/误触/求助/失败点；助手加问答任务单独统计，不混入四任务成功率。

- [ ] 准备统一场景、设备记录表、招募/同意说明；排除开发者指导动作，参与者不需要懂“工作区/回执”等词。
- [ ] 有真实参与者才开展，目标至少36/40无指导成功；任何数据丢失/错餐写入/越权为阻断，不被成功率平均掉。
- [ ] 按失败频次和严重性改已有范围内的入口/文案/状态；不要因一个偏好重新换视觉主题。每个修改回归受影响链路。
- [ ] 没有参与者时交付可直接执行的脚本及“未开展”，不拿agent操作替代结果；可先完成其他交付。
- [ ] 提交 docs: record usability evidence and remaining external gates。

## T25 — 统一重评、候选打包与上线操作单（交付）

**依赖：** T01–T24的已完成证据和明确未完成项。**保留：** 全部K。

**Files:** 修改 scripts/package_maturity_release.py、scripts/prepare_legacy_v4_release.py、docs/release/local-maturity-cutover.md、DEVELOPER.md；新增 docs/testing/product-maturity-final.md、docs/release/product-maturity-candidate.md。

**Interfaces:** release manifest={sourceSha,artifactHashes,schemaDelta,configDelta,capabilities,publicCatalogVersion,testEvidence,openGates,rollback}。环境secret只列变量名，不列值。未过门的能力保持关闭/不宣传，不能用统一“成功”覆盖。

- [ ] 独立复审最终差异与K01–K32，修复阻断并回归；核对未来能力未误开放、旧兼容未压制V4。
- [ ] 统一八维评分（视觉15/内容20/层级15/文案10/反馈10/可访问性10/助手10/动效10）；每维给最终证据与限制，85是方向非承诺。另列功能/数据/模型/性能/发布状态，不混成一个分数。
- [ ] 构建匹配Java/Python/网页/小程序/迁移与配置差异包，检查不含密钥、私库、备份、测试账户或证据日志；源码与包hash一致。
- [ ] 给出旧前端+新服务、新前端+能力关闭服务、新Java+旧Python的兼容表；后者未通过扩展协议时关闭新增能力，不能让页面暴露随后报错的入口。新增3类读取完成后实际清单为11类读、3类直接写，不把页面交接数计成新写工具。
- [ ] 隔离环境演练已有版本升级、增量SQL、部分失败续跑、回退/备份恢复；不把脱敏本地库全库替换生产，不盲跑旧V1–V7。
- [ ] 写可执行发布单：实际环境核对→备份→兼容增量→服务切换→健康与业务核验→前端匹配→观察/回退。生产目标/端口/时间以届时检查为准，不能硬抄历史。
- [ ] 交付本地候选、实际截图、测试摘要、未过门项目及一次性发布批准所需材料；本方案执行本身不自动推送/上线。提交 docs: deliver one verified maturity candidate and release checklist。

## 统一测试命令与使用边界

在project目录执行；web命令在web目录执行。Maven/Node/Python环境使用现有配置，不提交本机路径。数据库/模型阶段先通过T21防护。

~~~powershell
# 普通完整校验；外部模型仍不调用
powershell -ExecutionPolicy Bypass -File ./scripts/verify.ps1 -Offline -SkipModelServiceTests

# 后端业务最终测试及打包；不是用skipTests代替测试
mvn -f backend/pom.xml test package

# 网页依赖预备后
npm test -- --run --maxWorkers=2
npm run typecheck
npm run boundaries
npm run online:check
npm run build
npm run e2e -- --project=chromium
~~~

online:check当前是源代码合同检查，不是线上访问证明。数据库IT按backend/isolated-tests/README.md，只对新建独占合成库执行。真实数据全栈按T21单独入口；真实模型按T22账本。原生runner只连接核对过的隔离导出与工具端口。

若综合校验因环境故障中断，修正后可分段执行，但最终文档不能把原失败运行写成通过；跳过不是通过。未变化的有效检查可复用，不为了数量重复计数。

## 计划自审与交付状态

- [x] 已从当前源码核对新增连接与已实现内容，未重复把PR12已补缺口列成待修。
- [x] K01–K32、27路由、助手8+3基线、新扩展和网页边界均分配任务。
- [x] 新接口/字段、旧端兼容、权限/幂等/版本、工具预算均有明确拥有任务。
- [x] 全局五类重点失败场景均落到具体测试，不仅视觉快照。
- [x] 本方案只制定计划；真实请求/生产/真机/用户研究未冒充已经执行。
- [ ] T01–T25实施完成。
- [ ] 真实模型、真实设备与用户证据补齐。
- [ ] 候选发布批准与正式发布（本方案不自动执行）。

后续接手者先读规格、此计划和coverage.json，核对当前HEAD差异后从首个未完成任务连续执行。任务粒度用于检查与回退，不是要求用户每完成一项再说一次“继续”。
