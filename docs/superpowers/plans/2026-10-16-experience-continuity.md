# 吃什么：体验连续性优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户仅要求方案时停在方案交付，不自动开始实施。

**Goal:** 让现有小程序从选菜到保存、采购、做菜和助手协作形成顺畅、可靠的连续体验，以真实完成任务的表现验收。

**Architecture:** 在现有工作区/会话/回执合同之上增加轻量展示投影与来源信封，复用写入与恢复协议。小程序和网页共用设计与业务语义；服务先补实际计时再优化瓶颈。保留当前数据和权限边界，默认不增加业务表。

**Tech Stack:** 原生微信小程序 / JS / WXML / 生成WXSS；React / TypeScript / Vite / IndexedDB；Spring Boot 2.7 / MyBatis / MySQL；FastAPI / Python；Node test、Vitest、Playwright、JUnit与隔离验收脚本。Node24.x，其余沿现有锁定环境。

**Spec:** [完整体验设计](../specs/2026-10-16-experience-continuity-design.md)。配套：[机器覆盖清单](2026-10-16-experience-continuity-coverage.json)。

基线 `8672c922f3d96b361ae7a9cee632eedfa1c5fb97`；本文件所有任务状态为 **planned**，本次未改业务代码。当前代码比旧方案已有大量完成项；先读 [前轮最终报告](../../testing/product-maturity-final.md)，不要重跑旧设计待办。

## Global Constraints

- 本次是完整方案交付；实施任务均为 planned。开发、真实验证、生产发布分别记账，不因计划获批就推送或上线。
- 目标是用户完成真实任务时少找入口、少重复输入、少无意义等待、少误判；不设产品分数目标。不新增第5个Tab、悬浮助手、无功能装饰。
- A用于一般工具区域；F用于菜品卡片及助手。品牌#28634E、背景#F8F7F2、正文#25332B、辅助#56645B；F底#E9F0E9，145度#E4EEDA→#F5ECE2(60%)→#D7E9E3，白色66%面/74%边。
- 字号24/18/16/13/12；正文与菜名16，行高1.5/长文1.65；字号比例1/1.3/2；触控≥44×44、主按钮≥48高。照片圆角14/详情18，常规64/F紧凑56图；间距4/8/12/16/20/24/32。
- 按压100ms、行变化180ms、弹层200ms；减弱动效不移动。真图优先、缺失/失败才占位；身份/URL变化清失败；不扩大全局TLS豁免。
- 复制编辑保存才创建；取消不创建；未知核对原请求。计划/采购/阅读/实吃独立；缺价格为空、实付0合法、参考价与实付独立。
- 临时条件不写长期偏好；硬忌口/保留项/版本/归属不放宽。人数1–50默认2；手工菜数不随人数重写；数量弹层仅“应用后保留此搭配”。
- 前端来源信封不传模型；模型只提建议，Java决定授权和写入。原有预览/明确确认/幂等/过期与能力关闭保护不丢。
- 本轮不做菜谱清洗、补图、营养推算、数据扩充，也不新增语音、家庭协同、库存、支付或网页云同步。数据不足仍要诚实且可继续使用。
- 保持当前依赖和数据库结构；Node使用仓库规定24.x；Java/Python与现有锁定环境一致，不顺便升级技术栈。样式只改design源再生成。
- 测试先验证实际数据源和隔离所有权；外部模型用既有账本逐HTTP计数。真实设备、真实用户和新发布不能由模拟结果替代。
- K01–K32全部保留，K21按当前能力更新；本方案新增量优先于历史计划中的已过时待办，旧方案不重复执行。

## Review Focus

- **F01** 点击后、异步保存草稿完成前，账号/餐次/版本发生变化；不得把原菜行命令写到新餐。 → E03 E10，固定回归 `reference is checked after asynchronous draft flush`。
- **F02** 用户已输入忌口但没有点添加，随后点保存；不得静默丢输入或擅自永久保存。 → E13，固定回归 `unadded ingredient is never silently omitted`。
- **F03** 复合任务部分成功但公开续接不含完整参数；不得猜来源、恢复终态或重复已经成功的保存。 → E12 E17，固定回归 `partial terminal task offers editable remaining request`。
- **F04** 写入已成功但读回失败/超时/重启；不得一直忙、报假失败或创建替代写入。 → E14 E17，固定回归 `save readback rejection clears busy without duplicate write`。
- **F05** 一个日期同时有计划和实吃，且其他餐未记录；不得用整日完成标记抹掉差异。 → E07 E18，固定回归 `mixed day retains both plan and actual meaning`。

## 执行入口、顺序和责任

默认E01→E20顺序推进；任务内部按复现/断言→最小改动→回归→记录。仅文档、审阅、人工验收不强套TDD。任务是可独立验收的提交单位，不要求每个任务重新请用户批准。每个agent领取任务时必须读取Global Constraints、Spec、该任务的依赖接口与K保留项。

| 顺序 | 范围 | 交付检查点 |
|---|---|---|
| 1：E01–E03 | 状态、A/F、跨页来源 | 目标/状态/来源合同稳定，未改后端写协议 |
| 2：E04–E09 | 今天→菜谱→日历→采购→做菜 | 一条完整主流程可回退、可恢复、位置连续 |
| 3：E10–E13 | 助手与偏好/辅助页 | 简单操作少一轮输入，复杂任务只说事实，输入不丢 |
| 4：E14–E16 | 网页和服务等待 | 网页状态可持续，性能前后有同条件证据 |
| 5：E17–E19 | 数据、原生、模型、真实用户 | 故障不写错，真实设备/用户缺口明确 |
| 6：E20 | 总审、候选与报告 | 应用字节与证据绑定，发布仍独立 |

可选并行仅在依赖满足且无共享编辑文件时进行，例如E15可与E04–E09并行；E10/E11/E12共享assistant-page与chat，必须串行整合。E14不得在E02规则还未定时自建风格。E16不能先猜瓶颈再补指标。不同agent不覆盖未提交成果，审阅通过后再交接共享文件。

### 执行前环境准备

- [ ] 读取根/仓库AGENTS和DEVELOPER，核对正式仓库、当前分支、HEAD、未提交变化，保留其他工作。若源码已前进，记录差异再决定是否需要调整具体接口，不盲套旧行号。
- [ ] 读取 `docs/testing/local-verification.md` 与现有私有运行清单；配置仅存在仓库外或忽略目录，不输出凭据。不为测试更改生产API默认值。
- [ ] 将路径变量绑定到已验证的专属运行配置/新输出目录：`$ExperienceConfig`、`$ServiceEvidence`、`$DatabaseEvidence`、`$PerformanceShared`、`$PerformanceIndependent`、`$NativeFixtureEvidence`、`$NativeServiceEvidence`、`$LiveEvidence`。这些是私有路径参数，不是虚构默认配置；每个输出目录新建且不覆盖旧证据。
- [ ] 按现有环境绑定 `$PythonExecutable`、`$MavenExecutable`、`$MavenRepository`；下文python/node/mvn使用该已确认版本，Java命令同样使用所选缓存或可用镜像。依赖解析失败标为工具链阻塞，不当业务测试失败或成功。
- [ ] 恢复演练使用同一份 `$RehearsalBackup` + `$RehearsalReceipt`；缺一项不能跑R01。模型使用 `$ModelBudget`、`$ModelAuthorizationDate` 与实际可用额度，`$ApprovedLiveCases` 从现有case注册表按依赖选取，不能新建账本抹去已用次数。
- [ ] E20才绑定 `$ExistingQualityBundle`、`$WebRelease`、`$MigrationBundle`、`$CandidateJar`、`$CandidateOutput`、`$EvidenceManifest`。已有质量包固定哈希复用，不开展新清洗。

代码/本地runner新增参数只能在对应任务实现并通过自身测试后运行，下文不是可以在当前基线直接批量执行的命令清单。每条命令退出0且断言成立才算通过；人工验收、图像采集或构建成功不能替代行为测试。

### 文件责任

`*-presentation.js` 只派生显示数据，不写业务；`assistant-origin.js` 只处理可信客户端来源；`assistant-page.js`组织事件，真正命令由既有store执行；Java formatter只用已鉴权事实；metrics只观测；acceptance/packaging脚本只在已核对环境运行。原有大模块不顺便整体重构。

---

## E01 · 冻结体验基线与页面状态契约

**状态：** planned；**类别：** 基线与契约；**依赖：** 无。

**用户问题：** 多个状态分别正确，组合后却可能让用户不清楚正在改哪餐、哪次已保存。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `utils/meal-journey-presentation.js`
- Existing: `utils/meal-workspace-presentation.js`
- Existing: `docs/testing/product-maturity-final.md`
- Existing: `scripts/acceptance/maturity-cases.json`
- Create: `docs/testing/experience-continuity-baseline.md`
- Create: `tests/experience-state-contract.test.js`

**Interfaces：** 扩展 deriveWorkspacePresentation(value) -> {...existing, contextLabel, menuState, resultNotice}。contextLabel 来自当前 context；menuState 为 empty|draft|saved|changed|working|recover|conflict；resultNotice 为 null 或 {kind,text,target,action}。deriveMealJourney 继续作为主动作权威，不新增持久化状态。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `saved target and current draft remain separate` | 保存到次日晚餐后改当前午餐，两个 target 不相等；主动作不跳回今天。 |
| `unknown operation cannot become saved` | 有旧成功回执且新请求未知，menuState==='recover'，旧回执可读但不代表新请求成功。 |
| `repeated selected meal is a no-op` | 重复点当前餐次不发写请求、不清空菜单。 |

- [ ] **2. 执行指定改动。** 固定当前源码、应用包及数据版本，保存相同夹具的前态；列出现有行为与新增量。

- [ ] **3. 执行指定改动。** 按恢复优先级：未知结果 → 冲突 → 处理中 → 未应用条件 → 待确认 → 普通草稿/已保存。当前目标与曾保存目标不同必须分别保留。

- [ ] **4. 执行指定改动。** E01只建立投影合同和可重复状态夹具；E04接入页面，不提前更改按钮行为。

- [ ] **5. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
node --test tests/experience-state-contract.test.js tests/workspace-primary-action.test.js tests/experience-save-target.test.js
```

- [ ] **6. 记录证据并审阅。** 完成条件：覆盖空餐、草稿、处理中、已保存、修改后未保存、跨日、冲突、未知、能力关闭；记录前态证据，不给新功能填已完成。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **7. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `test: establish experience continuity state contracts`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E02 · 精修 A/F 组件、操作层级与动效规则

**状态：** planned；**类别：** 设计增量＋保留；**依赖：** E01。

**用户问题：** 已有统一样式，但嵌套卡片、重复强调与内容变化仍会争夺注意力。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `design/tokens.json`
- Existing: `design/theme.wxss.tpl`
- Existing: `design/wxss-manifest.json`
- Existing: `design/wxss/components/compact-dish-row/index.tpl`
- Existing: `design/wxss/components/assistant-card/index.tpl`
- Existing: `components/compact-dish-row/index.js`
- Existing: `components/compact-dish-row/index.wxml`
- Existing: `components/ui-sheet/ui-sheet.js`
- Existing: `components/ui-field/ui-field.wxml`
- Existing: `scripts/build_ui_assets.py`
- Existing: `tests/motion-contract.test.js`
- Existing: `tests/component-accessibility.test.js`
- Existing: `tests/fixed-action-layout.test.js`

**Interfaces：** 沿用 ui-sheet.visible/busy/reducedMotion/returnFocusId 和现有 ui-field.error。组件事件名不变；仅 E10 新增 dishaction。禁止把返回按钮 focus 回调等同原生读屏焦点已恢复。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `changed dish keeps surrounding geometry` | 替换中与结束后其余菜卡顺序不变；图片加载前后占位宽高不变。 |
| `large labels preserve hit area` | 1/1.3/2倍字时按钮可换行且触控>=44px，底部主动作>=48px。 |
| `reduced motion preserves outcomes` | 关闭位移动画后，相同回执、撤销入口和可达内容不丢失。 |

- [ ] **2. 执行指定改动。** 菜品区域保持 F；助手一张菜单外层 F，内部菜行用间距/分隔线，减少白卡套白卡。标题和菜名优先，次要文案不新增一个字号档。

- [ ] **3. 执行指定改动。** 主按钮实色、次操作描边或浅底、低频更多；换菜/收藏等可点击性不能因轻量化消失。44px触控和48px主按钮不缩水。

- [ ] **4. 执行指定改动。** 按压100ms、行变化180ms、弹层200ms沿用；只动画改变的对象，图片保留固定占位，减弱动效时不移动。已有购物过渡不重写。

- [ ] **5. 执行指定改动。** 修改模板后运行生成器，核对 diff 不产生无关资源变化；复用现有键盘/安全区测量。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
python scripts/build_ui_assets.py
python scripts/verify_miniapp_experience.py --templates --assets
node --test tests/motion-contract.test.js tests/component-accessibility.test.js tests/fixed-action-layout.test.js
```

- [ ] **7. 记录证据并审阅。** 完成条件：组件样式样例覆盖正常/按下/忙碌/禁用/错误/大字；正常390宽首屏至少两张完整菜卡的既有基线不倒退，大字不为数量挤压文本。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `style: refine warm glass action and content hierarchy`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E03 · 建立真实来源返回与跨页交接衔接

**状态：** planned；**类别：** 交互增量；**依赖：** E01。

**用户问题：** 助手固定回到今天；跨Tab编辑常用菜单后，原对话栈和任务上下文可能不可达。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `utils/assistant-action-handoff.js`
- Existing: `utils/assistant-entry.js`
- Existing: `utils/assistant-page.js`
- Existing: `utils/meal-workspace-page.js`
- Existing: `pages/chat/chat.wxml`
- Existing: `pages/dish-detail/dish-detail.js`
- Existing: `pages/calendar-detail/calendar-detail.js`
- Existing: `pages/assistant-history/assistant-history.js`
- Existing: `pages/customize/customize.js`
- Existing: `pages/settings/settings.js`
- Existing: `pages/custom-dishes/custom-dishes.js`
- Existing: `pages/shopping-list/shopping-list.js`
- Existing: `tests/assistant-action-handoff.test.js`
- Existing: `tests/assistant-entry.test.js`
- Existing: `tests/workspace-navigation.test.js`
- Create: `utils/assistant-origin.js`
- Create: `tests/assistant-origin.test.js`

**Interfaces：** createAssistantOriginStore({storage,scopeKey,now}) -> {put(origin),take(token)}；resolveAssistantReturn({origin,pageStack,currentScope,now}) -> {label,mode:'back'|'navigateTo'|'switchTab'|'none',delta?,routeKey?,params?}。take(token)返回已校验origin或null；origin的scopeKey由store写入而非调用者指定。origin={scopeKey:string,kind:'home'|'calendar'|'dish'|'history'|'assistant',created,sessionId?,workspaceId?,date?,mealType?,dishId?}，账号/API由本地信封绑定。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `tab handoff returns without resending` | switchTab后恢复原session；send/confirm调用数均为0。 |
| `scope or expiry invalidates return` | 换账号/API、超10分钟、未来created、伪造route一律不给原私有目标。 |
| `return keeps original editor guard` | 取消离开保留编辑；保存结果未知仍指向原requestId。 |

- [ ] **2. 执行指定改动。** 来源token单次消费且10分钟有效，与单菜预填token分开。跨页返回源数据只在同作用域页面生命周期内保留，重开仍须核对session与workspace。

- [ ] **3. 执行指定改动。** createActionHandoffStore返回对象的put(payload, origin?) 将 origin 存在可信客户端信封；模型payload的 validate 允许字段不增加。旧 incoming 返回形状继续可用；新增 incomingWithOrigin 返回 {payload,origin} 给迁移后的调用点。

- [ ] **4. 执行指定改动。** 原栈匹配优先返回，保持位置；栈消失时按白名单 routeKey 重建并读最新会话。无有效来源显示回到今天；不接任意URL，不把来源送模型。

- [ ] **5. 执行指定改动。** 所有目标页尊重现有未保存/未知写入保护；返回、取消、查看、已保存、待核对互不冒充。普通来源不出现返回原对话按钮。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
node --test tests/assistant-origin.test.js tests/assistant-action-handoff.test.js tests/assistant-entry.test.js tests/assistant-v4-history.test.js tests/workspace-navigation.test.js
```

- [ ] **7. 记录证据并审阅。** 完成条件：今天→助手、日历具体餐→助手、单菜→助手、助手→7类交接→返回均有确定去向；不重发原话或执行写入。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `feat: preserve validated origins across assistant handoffs`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E04 · 首页与本餐结果只表达必要目标、状态和下一步

**状态：** planned；**类别：** 展示增量；**依赖：** E01, E02, E03。

**用户问题：** 日期、已保存、结果卡和恢复提示分散重复，用户要自行拼出当前事实。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `templates/meal-workspace.wxml`
- Existing: `utils/meal-workspace-presentation.js`
- Existing: `utils/meal-workspace-page.js`
- Existing: `design/wxss/styles/workspace.tpl`
- Existing: `tests/today-maturity.test.js`
- Existing: `tests/experience-composition.test.js`
- Existing: `tests/workspace-navigation.test.js`

**Interfaces：** 消费 E01 的 contextLabel/menuState/resultNotice；保留原 primaryAction/primaryLabel、onViewSavedMeal、onShoppingPreview、onUndo。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `cross-day save plus replace shows one scoped result` | 原保存目标可达；当前草稿明确未保存，成功文案只出现一次。 |
| `unknown new request suppresses misleading success` | 保存旧回执仍能查看，但未知操作的核对入口可达并成为优先动作。 |
| `collapsed settings retain important recovery` | 收起设置不隐藏未应用、硬条件不可读或恢复信息。 |

- [ ] **2. 执行指定改动。** 顶区保留日期、横排餐次、人数/搭配和助手；有菜单继续默认收起本餐设置，菜品为首屏主体。

- [ ] **3. 执行指定改动。** 同一事件只留一处结果表达；未知、冲突优先且靠近相关任务。旧计划已保存而草稿又修改时合并为两句有明确对象的提示，不抹平状态。

- [ ] **4. 执行指定改动。** 保存成功只展示一次准确目标与查看这餐；已有准备食材/做法等入口按原状态出现，不把采购完成当实吃。

- [ ] **5. 执行指定改动。** 搭配弹层只保留应用后保留此搭配；不新增总数说明、常驻教程、任务进度仪表。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
node --test tests/today-maturity.test.js tests/experience-composition.test.js tests/workspace-navigation.test.js tests/workspace-primary-action.test.js tests/experience-save-target.test.js
```

- [ ] **7. 记录证据并审阅。** 完成条件：同一屏可回答正在改哪餐/哪一版已保存/下一步做什么；不新增业务状态或重复回执。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `feat: clarify meal targets and consolidate workspace feedback`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E05 · 找菜、筛选、选择与返回更直接

**状态：** planned；**类别：** 交互增量；**依赖：** E02, E03。

**用户问题：** 零结果时整组清除容易丢掉其他要求；已选条件不易逐个撤回。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `pages/customize/customize.js`
- Existing: `pages/customize/customize.wxml`
- Existing: `pages/recommend-filter/recommend-filter.js`
- Existing: `pages/recommend-filter/recommend-filter.wxml`
- Existing: `design/wxss/pages/customize/customize.tpl`
- Existing: `tests/recipe-browsing-maturity.test.js`
- Existing: `tests/experience-recipe-selection.test.js`
- Create: `utils/browse-filter-presentation.js`
- Create: `tests/browse-filter-presentation.test.js`

**Interfaces：** activeBrowseFilters(criteria,optionGroups) -> Array<{key,group,code,label}>；removeBrowseFilter(criteria,key) -> criteria。只读投影当前浏览条件；不修改长期偏好、本餐硬忌口或将OR改成AND。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `remove one filter preserves all other state` | 去掉某菜系只变化该code；query/其他条件/selectedIds保持。 |
| `zero results do not clear hard constraints` | 空结果恢复不会调用保存偏好或清除本餐excludedIngredients。 |
| `late search cannot replace new results` | 快速搜索A→B，A迟到不覆盖B；返回详情保留B和位置。 |

- [ ] **2. 执行指定改动。** 已选条件显示最多两项可撤回标签，其余用更多筛选；横向分类、搜索清空和分页恢复沿用。

- [ ] **3. 执行指定改动。** 零结果指出可调整的当前浏览条件，并允许只去掉一个；永久硬忌口只能经明确偏好编辑，不混入清除浏览筛选。

- [ ] **4. 执行指定改动。** 保留已选菜和列表位置；去详情后返回同一查询/分页/选中项。请求改代后旧结果不覆盖新查询。

- [ ] **5. 执行指定改动。** 本餐已选底栏只在有选择或待恢复任务时显示；主动作明确回到当前餐，不新增自动生成。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
node --test tests/browse-filter-presentation.test.js tests/recipe-browsing-maturity.test.js tests/experience-recipe-selection.test.js tests/preference-scope.test.js
```

- [ ] **7. 记录证据并审阅。** 完成条件：用户能在保留其他条件的前提下恢复零结果，选菜时不丢已选集合；返回不从头找。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `feat: make active recipe filters individually reversible`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E06 · 菜品详情、收藏与个人菜编辑减少操作竞争

**状态：** planned；**类别：** 展示增量＋回归；**依赖：** E02, E03, E05。

**用户问题：** 大字做法入口位于完整做法后；收藏取消与主要操作并列；复制各状态说明可进一步收拢。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `pages/dish-detail/dish-detail.wxml`
- Existing: `pages/dish-detail/dish-detail.js`
- Existing: `pages/favorite-dishes/favorite-dishes.wxml`
- Existing: `pages/favorite-dishes/favorite-dishes.js`
- Existing: `pages/custom-dishes/custom-dishes.wxml`
- Existing: `pages/custom-dishes/custom-dishes.js`
- Existing: `design/wxss/pages/dish-detail/dish-detail.tpl`
- Existing: `design/wxss/pages/custom-dishes/custom-dishes.tpl`
- Existing: `tests/recipe-interaction-hierarchy.test.js`
- Existing: `tests/personal-copy-recovery.test.js`
- Existing: `tests/dish-media-lifecycle.test.js`

**Interfaces：** 沿用当前菜品ID/contentVersion、copy-edited原请求和 onCancel 编辑确认；详情主动作仍依据来源选择加入/查看本餐/做法。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `reading entry precedes long recipe body` | 长做法无需先读到底才找到大字入口。 |
| `favorite menu does not select recipe` | 更多/取消收藏不触发加入本餐；取消确认不删除。 |
| `copy cancellation and unknown recovery stay independent` | 取消未保存0副本；未知保存只核对原UUID，来源下架仍可进入。 |

- [ ] **2. 执行指定改动。** 大字看做法移到做法标题附近；真图、步骤图、圆角、菜名与分享收藏顶端对齐保持。

- [ ] **3. 执行指定改动。** 收藏移除放在单行更多中，名称明确且沿用原确认；点更多不得误选/加菜。

- [ ] **4. 执行指定改动。** 个人菜编辑只展示当前状态必要说明：编辑未保存、失败保留输入或保存待核对；来源下架时恢复入口保留。

- [ ] **5. 执行指定改动。** 缩略图缺图/加载失败只降级该图；URL或内容身份变化重置失败状态；不扩大旧域名兼容范围。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
node --test tests/recipe-interaction-hierarchy.test.js tests/experience-personal-recipes.test.js tests/personal-copy-recovery.test.js tests/dish-media-lifecycle.test.js tests/dish-image-compatibility.test.js
```

- [ ] **7. 记录证据并审阅。** 完成条件：照片和菜名仍是主角；普通阅读、加入与编辑路径各自清楚；已修复复制语义无回退。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `feat: simplify recipe detail and personal recipe action hierarchy`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E07 · 日历、餐次与回顾表达真实混合状态

**状态：** planned；**类别：** 展示增量；**依赖：** E01, E02, E03。

**用户问题：** 日期格任意一餐有实吃后，互斥勾号覆盖计划标记，容易被理解为整天完成。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `pages/calendar/calendar.js`
- Existing: `pages/calendar/calendar.wxml`
- Existing: `pages/calendar-detail/calendar-detail.js`
- Existing: `pages/calendar-detail/calendar-detail.wxml`
- Existing: `pages/statistics/statistics.js`
- Existing: `pages/statistics/statistics.wxml`
- Existing: `utils/calendar-meal-presentation.js`
- Existing: `design/wxss/pages/calendar/calendar.tpl`
- Existing: `tests/calendar-maturity.test.js`
- Existing: `tests/experience-calendar.test.js`
- Existing: `tests/experience-diet-review.test.js`

**Interfaces：** 日期展示对象增加 hasPlan/hasActual 两个独立标志并扩展 calendarDayLabel；原 MealConsumption 状态 eaten/skipped/unrecorded 不改。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `mixed day retains both plan and actual meaning` | 早餐已吃+午餐已安排+晚餐未记录，hasPlan===true且hasActual===true，不宣称三餐完成。 |
| `unrecorded is not skipped` | 未录入不生成skipped/eaten。 |
| `review correction preserves period` | 更正后回顾保持原日期范围并读到真实实际菜品。 |

- [ ] **2. 执行指定改动。** 月历计划与实际标记可同时表达；读屏完整日期和存在何种记录，不使用整日完成勾。

- [ ] **3. 执行指定改动。** 选中餐次附近展示已安排/已记录/没有记录；不增加完成率、页首总数或催补录。

- [ ] **4. 执行指定改动。** 餐次详情标题唯一指明日期餐次，删重复介绍；修改实际后保留原周期与查看位置。

- [ ] **5. 执行指定改动。** 未知实吃保存优先提供核对；旧计划仍可读。删除计划后的独立实吃及版本墓碑保护继续生效。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
node --test tests/calendar-maturity.test.js tests/calendar-actual-recovery.test.js tests/experience-calendar.test.js tests/experience-diet-review.test.js
```

- [ ] **7. 记录证据并审阅。** 完成条件：用户看得出安排与实际记录的差别，颜色关闭/读屏仍可区分；不增加记录压力。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `feat: distinguish planned and recorded meals in calendar`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E08 · 采购过程突出勾选、来源与必要用量

**状态：** planned；**类别：** 展示增量＋保留；**依赖：** E01, E02, E03。

**用户问题：** 有清单时添加按钮仍过重，来源入口靠后，多行相同警告影响浏览。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `pages/shopping-list/shopping-list.js`
- Existing: `pages/shopping-list/shopping-list.wxml`
- Existing: `pages/shopping-preview/shopping-preview.js`
- Existing: `pages/shopping-preview/shopping-preview.wxml`
- Existing: `components/compact-ingredient-row/index.wxml`
- Existing: `utils/meal-next-step.js`
- Existing: `design/wxss/pages/shopping-list/shopping-list.tpl`
- Existing: `design/wxss/pages/shopping-preview/shopping-preview.tpl`
- Existing: `tests/shopping-view-hierarchy.test.js`
- Existing: `tests/shopping-maturity.test.js`
- Create: `utils/shopping-page-presentation.js`
- Create: `tests/shopping-page-presentation.test.js`

**Interfaces：** shoppingPagePresentation({pendingCount,checkedCount,sourceMeals,drafts,loading,offline}) -> {contextLabel,addEmphasis:'primary'|'secondary',emptyAction}。来源复用 distinctMealSources/mealSourceUrl，不存另一份清单。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `nonempty shopping emphasizes checking` | pending>0时addEmphasis==='secondary'；空清单动作不被隐藏。 |
| `mixed sources require explicit selection` | 两个日期餐次不直接跳任一餐，更不写实际。 |
| `owned exclusion preserves source identity` | 同名不同形态/来源独立选中，确认只加入真实选中项。 |

- [ ] **2. 执行指定改动。** 非空清单以勾选为主，添加食材降次级且保持可达；空清单突出从日历准备。

- [ ] **3. 执行指定改动。** 单来源餐放在页首上下文，多来源仍显式选择，不能根据全部已买猜来源餐或吃过。

- [ ] **4. 执行指定改动。** 家里有入口在预览行就可理解，按sourceKey排除并核对来源；形态/部位/原用量保留。

- [ ] **5. 执行指定改动。** 未知量警告仅放受影响行，可用短标签展开原文；费用默认折叠，参考价日期、缺价、实付0不变。已有180ms过渡/撤销/滚动恢复原样保留。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
node --test tests/shopping-page-presentation.test.js tests/shopping-view-hierarchy.test.js tests/shopping-maturity.test.js tests/experience-shopping-list.test.js tests/experience-shopping-preview.test.js
```

- [ ] **7. 记录证据并审阅。** 完成条件：买东西时能快速勾选、看用量和来源；精简后仍能辨别不同食材条目与未知信息。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `feat: prioritize purchase actions and meal provenance`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E09 · 做法阅读保持步骤、食材与操作位置连续

**状态：** planned；**类别：** 交互增量；**依赖：** E02, E03, E06。

**用户问题：** 食材内联展开推开步骤；换步强制回页顶；长步骤的下一步离操作手太远。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `pages/meal-cooking/meal-cooking.js`
- Existing: `pages/meal-cooking/meal-cooking.wxml`
- Existing: `design/wxss/pages/meal-cooking/meal-cooking.tpl`
- Existing: `utils/cooking-progress.js`
- Existing: `tests/cooking-continuity.test.js`
- Existing: `tests/meal-cooking.test.js`
- Existing: `tests/fixed-action-layout.test.js`

**Interfaces：** 保留 cooking-progress 身份/版本键；onIngredients 切换 ui-sheet，新增页面局部 _ingredientReturnPosition；moveStep(amount) 定位 #cooking-step-heading 而非 scrollTop:0。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `ingredient sheet preserves step and viewport` | 展开关闭后dishId/stepIndex/scroll锚点相同。 |
| `step navigation targets content heading` | 下一步目标selector为步骤标题而非页顶；末步不再增索引、不写实吃。 |
| `long final step clears bottom controls` | 320宽2倍字最后一句完整可达；控件占位随换行变化。 |

- [ ] **2. 执行指定改动。** 菜名和当前步骤靠近正文，前后步使用稳定底部操作区并测量占位，长步骤末行不被遮挡。

- [ ] **3. 执行指定改动。** 查看食材打开复用ui-sheet，关闭恢复同一步同位置；切换菜时各自阅读进度独立。

- [ ] **4. 执行指定改动。** 换步定位步骤标题；减弱动效时即时定位，无整页滚动装饰。

- [ ] **5. 执行指定改动。** 去掉常驻重复教程，把阅读仅本机/不等于实吃放到需要说明的入口；记录实吃仍独立、明确确认。未知步骤/用量保留。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
node --test tests/cooking-continuity.test.js tests/meal-cooking.test.js tests/fixed-action-layout.test.js
```

- [ ] **7. 记录证据并审阅。** 完成条件：用户边做边看不必反复找刚才的步骤；内容版本变更重置旧位置的提示仍准确。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `feat: keep cooking steps and ingredient lookup in place`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E10 · 助手菜单支持直接保留、取消保留和换一道

**状态：** planned；**类别：** 交互增量；**依赖：** E01, E02, E03, E04。

**用户问题：** 明确的单菜操作仍需打字绕一轮模型；历史菜单又容易误操作当前餐。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `utils/assistant-page.js`
- Existing: `utils/assistant-cards.js`
- Existing: `utils/meal-workspace-page.js`
- Existing: `utils/meal-workspace.js`
- Existing: `components/assistant-card/index.js`
- Existing: `components/assistant-card/index.wxml`
- Existing: `design/wxss/components/assistant-card/index.tpl`
- Existing: `pages/chat/chat.wxml`
- Existing: `tests/assistant-maturity-ui.test.js`
- Create: `tests/assistant-direct-dish-action.test.js`

**Interfaces：** presentMenuActions({card,workspace,conversationState,workspaceState}) -> {enabled,rows:[{dishId,locked,canReplace}],expectedRef}；新增 dishaction({cardId,dishId,action,expectedRef}) 事件和 onConversationDishAction。runCommand(command,extra={},expectedRef=null) / store.command(command,extra={},expectedRef=null) 向后兼容；expectedRef={workspaceId,workspaceRevision,planVersion,date,mealType}。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `direct dish action does not send a model turn` | 有效当前卡执行工作区命令一次，assistant.send调用0次。 |
| `reference is checked after asynchronous draft flush` | 点击后flush期间餐次/版本变化，原操作被拒绝，不作用到新餐。 |
| `pending confirmation blocks competing command` | 待确认/未知状态不允许绕过已有确认；历史错版本卡不得发命令。 |
| `unknown replacement recovers original command` | 恢复只查询原requestId，不能追加新换菜或伪造成功卡。 |

- [ ] **2. 执行指定改动。** 当前有效菜单使用已有工作区命令做可逆手动操作；不发送助手轮次、不生成虚构助手回执。每行显示换一道；保留/取消保留置于菜行更多或已保留标签，避免一排三个按钮。

- [ ] **3. 执行指定改动。** 点击时核对当前卡；等待 flushDraft/save 后、冻结写请求前再次比对 expectedRef 与账号/API作用域。变更、未知请求、待确认助手动作时不并行写，给出查看当前餐或完成当前核对入口。

- [ ] **4. 执行指定改动。** 历史菜单只有与当前工作区引用完全匹配才可操作，否则查看/回到当前餐。页面文案不能让用户误以为在改历史快照。

- [ ] **5. 执行指定改动。** 附加要求如换清淡点进入可编辑预填，不自动发送；换菜反馈仅引用真实回执，保留项不被解除；未知直接操作交给工作区原requestId恢复。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
node --test tests/assistant-direct-dish-action.test.js tests/assistant-maturity-ui.test.js tests/workspace-primary-action.test.js tests/workspace-navigation.test.js
```

- [ ] **7. 记录证据并审阅。** 完成条件：常用简单操作少一轮输入和模型等待；账户/版本/目标竞态不因此放松。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `feat: connect assistant menu controls to validated workspace actions`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E11 · 助手说明用到了什么，并用事实回答读取问题

**状态：** planned；**类别：** 展示与后端增量；**依赖：** E01, E02, E03。

**用户问题：** 上下文来源不够透明；只读回答常是笼统的已查到，用户仍需自行理解卡片。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `utils/assistant-presentation.js`
- Existing: `utils/assistant-page.js`
- Existing: `pages/chat/chat.wxml`
- Existing: `backend/src/main/java/com/eatwhat/service/AssistantV4TurnService.java`
- Existing: `backend/src/test/java/com/eatwhat/service/AssistantV4TurnServiceTest.java`
- Create: `backend/src/main/java/com/eatwhat/service/AssistantFactReplyFormatter.java`
- Create: `backend/src/test/java/com/eatwhat/service/AssistantFactReplyFormatterTest.java`
- Create: `tests/assistant-context-summary.test.js`

**Interfaces：** buildAssistantContextSummary({workspace,preferencesSnapshot,options,preferencesState}) -> {targetLabel,mealRows,savedRows,unavailableLabel}。Java内部 format(List<AuthorizedReadFact> facts, ModelContext context) -> String；AuthorizedReadFact 为已鉴权读取结果的内部包装，不改变公开API，不接模型自由成功声明。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `context summary separates temporary and saved inputs` | 本餐少油与长期忌口分组；偏好失读有unavailableLabel，不显示空偏好。 |
| `partial read is not a complete total` | 分页采购只说这次查到/部分，不报整个清单总数；实吃空记录不宣称未进餐。 |
| `model success prose cannot create a factual receipt` | 恶意或错误模型文案已保存日历不进入只读事实回答。 |

- [ ] **2. 执行指定改动。** 默认仍一行当前餐，点开才看本餐输入和已保存偏好；复用已取得的偏好快照，不为每张卡增加查询。失读显示暂未读到，不假称未设置；不把前端展示投影称为后端精确生效条件。

- [ ] **3. 执行指定改动。** 修改本餐要求仍预填待发送；长期偏好跳现有页面明确保存，返回后重新读取。上下文来源不混进永久记忆。

- [ ] **4. 执行指定改动。** 覆盖当前11类只读工具的事实回答模板：菜品搜索、按食材、详情、做法、当前餐、日历、采购、实际回顾、合法选项、收藏、常用菜单；工具实际枚举以注册表核对，不能为凑数量新造工具。

- [ ] **5. 执行指定改动。** 模板只使用有权访问且明确返回的事实，保留分页/部分结果/未知标记；没有记录不等于没吃。日历安排与实吃、整餐时间与单菜上限分开。自然短句后保留有用卡片，删除重复泛泛引导。

- [ ] **6. 执行指定改动。** 只读完成分支调用formatter；空/截断/混合多读取有上限与去重。模型声称已保存或已采购时，没有真实写回执绝不呈现为成功。

- [ ] **7. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
node --test tests/assistant-context-summary.test.js tests/assistant-maturity-ui.test.js
mvn -f backend/pom.xml '-Dtest=AssistantFactReplyFormatterTest,AssistantV4TurnServiceTest' test
```

- [ ] **8. 记录证据并审阅。** 完成条件：用户能理解助手依据与当前结果，减少机械措辞；不多调用模型、不扩大事实权限。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **9. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `feat: ground assistant read replies and expose context sources`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E12 · 多步任务、历史与恢复只展示可以兑现的下一步

**状态：** planned；**类别：** 交互增量；**依赖：** E01, E03, E10, E11。

**用户问题：** 部分成功后用户不知道剩什么；一键继续如果猜参数可能重复保存或选错来源。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `utils/assistant-page.js`
- Existing: `utils/assistant-presentation.js`
- Existing: `utils/assistant-conversation.js`
- Existing: `pages/chat/chat.wxml`
- Existing: `pages/assistant-history/assistant-history.js`
- Existing: `pages/assistant-history/assistant-history.wxml`
- Existing: `tests/assistant-v4-history.test.js`
- Existing: `backend/src/main/java/com/eatwhat/dto/AssistantV4Contract.java`
- Create: `utils/assistant-workflow-presentation.js`
- Create: `tests/assistant-workflow-presentation.test.js`

**Interfaces：** presentWorkflow({turn,confirmationPending,selectionPending}) -> {rows,primaryAction,primaryLabel,remainingKinds}；buildRemainingTaskPrefill({turn}) -> string|null。当前continuation公开合同只有kind/status/taskId/receiptRef/requestId，没有动作完整参数；不得伪装可无损重放。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `partial terminal task offers editable remaining request` | 保存成功采购失败，只预填采购的必要澄清，不恢复终态或重做保存。 |
| `unknown confirmation preserves original request` | 同requestId检查，无新的confirm提交；成功行依真实receiptRef。 |
| `history rendering cannot execute or overfetch` | 打开历史不send/confirm；不为每张旧卡触发恢复请求。 |
| `cancelled workflow cannot auto continue` | 取消后没有自动recover/send，已有真实成功回执仍可查看。 |

- [ ] **2. 执行指定改动。** 复合任务最多3条结果摘要：已完成须有回执，未完成与待确认分开；同任务只能一个主要下一步。单一动作不额外展示进度条。

- [ ] **3. 执行指定改动。** 结果未知先核对原请求；有效 pendingAction 展示当前预览；awaiting_confirmation且当前任务尚pending但预览未取得时走现有recover。过期预览重新核对，已关闭能力保持禁止确认。

- [ ] **4. 执行指定改动。** partially_completed为终态，不能假称恢复原任务：只根据明确剩余动作种类预填，请用户重新核对来源/目标，不推测丢失日期参数，不重做已完成保存。用户主动发送后才产生新任务。

- [ ] **5. 执行指定改动。** 历史读取不重放；原有查看长历史时不自动拉底、新回复提示和分页保留。取消后不自动续跑。可缓存轻量展示，但不逐条额外查询所有历史任务。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
node --test tests/assistant-workflow-presentation.test.js tests/assistant-v4-history.test.js tests/assistant-maturity-ui.test.js tests/assistant-conversation.test.js
```

- [ ] **7. 记录证据并审阅。** 完成条件：连续任务可看懂、可核对，剩余事项不会被伪装成无需澄清就能继续。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `feat: clarify assistant partial outcomes and safe recovery`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E13 · 偏好、个人资产及辅助页统一输入和离开规则

**状态：** planned；**类别：** 行为修复与审阅；**依赖：** E02, E03, E05, E06。

**用户问题：** 忌口输入后未点添加可能被保存操作静默忽略；不同页面离开和提示规则不一致。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `pages/settings/settings.js`
- Existing: `pages/settings/settings.wxml`
- Existing: `pages/profile-edit/profile-edit.js`
- Existing: `pages/profile-edit/profile-edit.wxml`
- Existing: `pages/recommend-filter/recommend-filter.js`
- Existing: `pages/profile/profile.wxml`
- Existing: `pages/sync/sync.wxml`
- Existing: `pages/about/about.wxml`
- Existing: `pages/logs/logs.wxml`
- Existing: `tests/secondary-pages-maturity.test.js`
- Existing: `tests/profile-entry-hierarchy.test.js`
- Existing: `tests/personal-copy-recovery.test.js`
- Create: `utils/preference-save-presentation.js`
- Create: `tests/preference-save-presentation.test.js`

**Interfaces：** preferenceSaveIssue({peopleDraft,ingredientDraft}) -> {field,message}|null；dirty判断比较当前编辑值与加载/已保存快照，不设置新的云端草稿。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `unadded ingredient is never silently omitted` | draft非空时save请求0，error指向该字段；用户添加后save只含明确确认项。 |
| `cancel dirty leave keeps current values` | 退出取消后输入未清空；成功保存后返回不重复询问。 |
| `assistant prefill remains a proposal` | 预填不触发save或跨账号保留；资料取消不发POST。 |

- [ ] **2. 执行指定改动。** 长期忌口文本未添加时阻止保存，在字段旁提示请先添加这项忌口并聚焦；不静默丢弃，也不擅自把输入保存成永久忌口。沿用既有去空白/长度/去重规则。

- [ ] **3. 执行指定改动。** 设置、个人资料、临时筛选按是否dirty提示离开；已保存不再确认，取消离开保留输入。未持久化的输入不能提示草稿已保存。

- [ ] **4. 执行指定改动。** 助手跳转的偏好预填在当前页可见并注明作用范围，用户确认保存后才生效；复用已有自定义菜/筛选离开保护，不建立第二套框架。

- [ ] **5. 执行指定改动。** 我的只突出真正待处理的恢复/同步问题；关于、日志和同步去重复介绍，保留必要能力/隐私/失败信息。六个管理页只审当前对象、危险操作、权限与长文本，不增加新后台业务。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
node --test tests/preference-save-presentation.test.js tests/secondary-pages-maturity.test.js tests/profile-entry-hierarchy.test.js tests/personal-copy-recovery.test.js
```

- [ ] **7. 记录证据并审阅。** 完成条件：输入有去处、取消有明确结果，辅助页不变成故障和技术信息展示墙。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `fix: preserve explicit preference input and consistent leave guards`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E14 · 网页端延续操作位置并完善等待、保存与展示层级

**状态：** planned；**类别：** 行为修复与交互增量；**依赖：** E01, E02, E05, E07, E08, E13。

**用户问题：** 页面切换可能重置找菜条件；分页加载耗时可叠加；本地保存异常可能留下持续忙状态。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `web/src/ui/App.tsx`
- Existing: `web/src/catalog/catalog.ts`
- Existing: `web/src/catalog/public-transport.ts`
- Existing: `web/test/catalog.test.ts`
- Existing: `web/test/public-transport.test.ts`
- Existing: `web/test/ui.test.tsx`
- Existing: `web/test/maturity-ui.test.tsx`
- Existing: `web/test/shopping-ui.test.tsx`
- Existing: `web/e2e/maturity-journey.spec.ts`
- Existing: `web/e2e/maturity-accessibility.spec.ts`
- Existing: `web/e2e/network.spec.ts`
- Existing: `web/src/ui/Recipes.tsx`
- Existing: `web/src/ui/Calendar.tsx`
- Existing: `web/src/ui/Shopping.tsx`
- Existing: `web/src/ui/components.tsx`
- Existing: `web/src/ui/styles.css`
- Existing: `web/src/domain/types.ts`

**Interfaces：** loadCatalog(provider?,options?:{signal?:AbortSignal;deadlineMs?:number;onProgress?:(p:{loaded,total})=>void}) -> Promise<Result<Catalog>>。PublicCatalogProvider.list(query,options?:{signal?:AbortSignal})；PublicCatalogTransport(query,options?:{signal?:AbortSignal})，既有返回类型不变。App持有会话级WebViewState={recipes:{keyword,category,favoritesOnly},calendar:{date,mode,month}}。现有Dialog增加可选onRequestClose，不改IndexedDB schema。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `refresh abort preserves last complete catalog` | 超20秒终止；中间页不会代替完整旧数据；新代次不被旧响应覆盖。 |
| `save readback rejection clears busy without duplicate write` | 写入后读失败pending解除，原requestId保留，重试不重复创建。 |
| `return preserves filters and calendar target` | 菜谱→详情→返回或切Tab，query/category/selectedDate不重置。 |
| `browser only boundary remains explicit at relevant entry` | 备份恢复仍本机存储，不显示已经同步微信。 |

- [ ] **2. 执行指定改动。** 默认菜库刷新总截止20秒，单页15秒且不超过剩余预算；App按加载代次和AbortController取消重试/卸载旧任务。进度仅加载较久时简短展示。保留上一份完整验证菜库，部分新页不用于自动配餐。

- [ ] **3. 执行指定改动。** 当前源码中网页与后端配置上限均500，部署状态另核对；保留授权发布范围；不把私有全量测试6665当成网页应该放开的公开范围。

- [ ] **4. 执行指定改动。** 切页保留查询、日期、月份、合法滚动/焦点锚点；无有效锚点才回页首。已有IndexedDB内容可独立查看，菜库刷新失败不全屏阻断个人记录。

- [ ] **5. 执行指定改动。** App保存入口用catch/finally收敛忙状态；提交后读回失败按原command/requestId核对，不能盲新建或把未知显示为失败。沿用useLocalMutation幂等语义。

- [ ] **6. 执行指定改动。** 脏表单关闭只由表单确认一次；采购默认显示菜名/日期餐次/人数/形态用量，内部recipeId/familyId/hash不占普通用户详情，保留数据原文供明确诊断。

- [ ] **7. 执行指定改动。** 沿用A/F、真实图、圆角和单主动作；网页仍本浏览器个人数据，不增加假云同步或未实现的网页版助手。

- [ ] **8. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
npm --prefix web run test -- --run
npm --prefix web run typecheck
npm --prefix web run boundaries
npm --prefix web run build
npm --prefix web run e2e
```

- [ ] **9. 记录证据并审阅。** 完成条件：网页同一业务语义与视觉规范，网络和本地存储异常都能结束等待并继续有效工作。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **10. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `fix: preserve web view state and bounded recoverable loading`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E15 · 补齐用户等待的分段观测

**状态：** planned；**类别：** 诊断基础；**依赖：** E01。

**用户问题：** 目前总耗时不能区分扫描、排队、执行与模型等待，难以选准体验瓶颈。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `backend/src/main/java/com/eatwhat/service/ExperienceMetrics.java`
- Existing: `backend/src/main/java/com/eatwhat/service/DishCandidateQueryService.java`
- Existing: `backend/src/main/java/com/eatwhat/service/MealWorkspaceTaskRunner.java`
- Existing: `backend/src/main/java/com/eatwhat/service/AssistantV4TurnService.java`
- Existing: `backend/src/main/java/com/eatwhat/service/AssistantV4ModelGateway.java`
- Existing: `backend/src/main/java/com/eatwhat/service/MealWorkspaceService.java`
- Existing: `backend/src/main/java/com/eatwhat/service/AssistantActionService.java`
- Existing: `backend/src/test/java/com/eatwhat/service/ExperienceErrorContractTest.java`
- Existing: `recommend-service/assistant_v4_provider.py`
- Create: `backend/src/test/java/com/eatwhat/service/ExperienceStageInstrumentationTest.java`
- Create: `tests/test_experience_provider_metrics.py`

**Interfaces：** 延伸ExperienceMetrics现有固定stage集合，记录candidate_scan/candidate_details/assistant_queue/model_http/confirmation，并增加task_execution固定值。task入队到claim为queue，claim到结束为execution；Java网关model_http含Java→Python全过程，Python另记供应商阶段，报告不得混称。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `queue delay is separate from execution duration` | 控制clock与任务排队后两段计时正确，各记一次，不从claim冒充queue起点。 |
| `instrumentation failures cannot fail a valid response` | 模拟metrics异常不改变保存/读取结果和回执。 |
| `metrics labels cannot contain private values` | 固定白名单验证，无prompt/userId/requestId出现在维度。 |

- [ ] **2. 执行指定改动。** 按真实生产调用点接入当前空置或未覆盖的计时，不仅在测试里手动observe；扫描/详情计数和确认结果按真实操作采集。

- [ ] **3. 执行指定改动。** 结果标签只用固定枚举success/error/timeout/cancel/recover；不加用户ID、requestId、菜名或提示词标签，不记录聊天正文。

- [ ] **4. 执行指定改动。** 任务取消、deadline、队列满和线程资源回收保留；埋点失败不得影响业务，不能为观测扩大重试和并发。

- [ ] **5. 执行指定改动。** 本地验收另记tap→可见反馈→结果可用时间，后端耗时与端到端感觉分开；合成页面不充当真实服务链路。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
mvn -f backend/pom.xml '-Dtest=ExperienceStageInstrumentationTest,ExperienceErrorContractTest,AssistantV4ModelGatewayTest' test
python -m unittest discover -s tests -p test_experience_provider_metrics.py
```

- [ ] **7. 记录证据并审阅。** 完成条件：报告能解释用户究竟等在哪里，不采集额外私人内容。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `perf: instrument bounded request stages and task queue latency`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E16 · 针对测量瓶颈优化候选与并发，验证真实容量

**状态：** planned；**类别：** 测量驱动优化；**依赖：** E15。

**用户问题：** 非模型配餐在高并发和扩容数据下超过原有目标；旧25worker只有两账号，不能代表25独立用户。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `scripts/benchmark_maturity.py`
- Existing: `scripts/maturity_runtime.py`
- Existing: `backend/src/main/java/com/eatwhat/service/DishCandidateQueryService.java`
- Existing: `backend/src/main/java/com/eatwhat/service/MealWorkspacePlanner.java`
- Existing: `backend/src/main/java/com/eatwhat/service/MealWorkspaceTaskRunner.java`
- Existing: `backend/src/main/java/com/eatwhat/mapper/MealWorkspaceMapper.java`
- Existing: `backend/src/test/java/com/eatwhat/service/CandidateScanEquivalenceTest.java`
- Existing: `backend/src/test/java/com/eatwhat/service/AssistantCandidateCursorTest.java`
- Create: `tests/test_experience_benchmark_population.py`
- Create: `docs/testing/experience-performance-decisions.md`

**Interfaces：** bench(runtime,concurrency,seconds,user_mode='two-shared')；CLI --user-mode two-shared|per-worker。per-worker只在专属测试库创建可核对的合成账号，不只换不存在的userId。新增比较参数使基线与候选使用同一时长，保留旧20秒结果为历史诊断。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `per worker population matches declared users` | 25worker对应25已创建授权账号；two-shared明确只有2账号。 |
| `candidate results remain semantically equivalent` | 同种子/数据/硬条件/保留菜下结果和分页等价，跨批一致性与缓存上限通过。 |
| `cancellation frees resources within existing contract` | 指定任务取消不影响其他账号，无持续增长线程/连接/缓存。 |

- [ ] **2. 执行指定改动。** 先以E15分段选择一个最大瓶颈：候选扫描、详情读取、规划器重复计算或任务排队；在决策文档记录证据、最小修改和替代项。不得把所有可能优化预先堆入代码。

- [ ] **3. 执行指定改动。** 可减少同请求重复读取/排序、复用不可变轻字段或按版本缓存；每批<=256、全候选覆盖、一致快照/准确总数/稳定游标/版本全部保留。缓存必须有上限与失效键。

- [ ] **4. 执行指定改动。** 不截前N菜、不放松硬忌口/保留、不盲加线程或连接池；优化任务取消和资源释放时保留按taskId取消及作用域。

- [ ] **5. 执行指定改动。** 固定同一脱敏样本和50000合成扩容、1/10/25worker；两共享账号用于竞争验证，独立账号用于容量，分别报告。冷启动与热态分开，基线和候选同配置/预热/时长。

- [ ] **6. 执行指定改动。** 正式最终矩阵每种用户模型各6场×300秒，分别30分钟；无模型外部调用。报告p50/p95/p99/错误/队列/SQL/堆与GC，不能用20秒对300秒宣称同条件提升。

- [ ] **7. 执行指定改动。** 对比模式新增 --comparison-duration equal|legacy-20s，默认equal且只有equal结果用于前后改善结论；legacy-20s显式标为诊断。最终candidate持续时长门槛仍独立计算，不能加上baseline凑时长。

- [ ] **8. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
python -m unittest discover -s tests -p test_experience_benchmark_population.py
mvn -f backend/pom.xml '-Dtest=CandidateScanEquivalenceTest,AssistantCandidateCursorTest,MealWorkspaceRulesTest,MealWorkspacePlannerTest' test
python scripts/benchmark_maturity.py --config $ExperienceConfig --out $PerformanceShared --seconds-per-scenario 300 --user-mode two-shared --comparison-duration equal
python scripts/benchmark_maturity.py --config $ExperienceConfig --out $PerformanceIndependent --seconds-per-scenario 300 --user-mode per-worker --comparison-duration equal
```

- [ ] **9. 记录证据并审阅。** 完成条件：沿用列表p95<=300ms、非模型整餐p95<=1000ms、无故障错误率<1%、退出后遗留worker=0；达不到则给实测容量/残余瓶颈，不改门槛冒充完成。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **10. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `perf: reduce measured planning costs with equivalent results`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E17 · 建立跨流程故障矩阵与真实数据服务验收

**状态：** planned；**类别：** 集成验证；**依赖：** E04, E05, E06, E07, E08, E09, E10, E11, E12, E13, E14, E16。

**用户问题：** 单页或单测试通过不能证明跨页取消、重启、重试和账号切换后仍是同一件事。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `scripts/run_maturity_acceptance.py`
- Existing: `scripts/maturity_runtime.py`
- Existing: `scripts/acceptance/maturity-cases.json`
- Existing: `tests/test_maturity_release_inputs.py`
- Create: `scripts/run_experience_acceptance.py`
- Create: `scripts/acceptance/experience-continuity-cases.json`
- Create: `tests/test_experience_acceptance_guards.py`
- Create: `docs/testing/experience-continuity-service.md`

**Interfaces：** 新runner复用maturity_runtime安全校验；CLI --config/--cases/--out/--stage database|journey；只允许所有权已验证的隔离数据库，预期目录/端口/账号/来源指纹写脱敏receipt。场景字段id/steps/assertions/sourceFingerprint/status/evidence/limits，status=passed|failed|blocked|not-run|not-applicable。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `production-like config is rejected before any write` | 非专属库/不匹配端口目录/未知所有权立即停止。 |
| `lost response does not duplicate a persistent operation` | 日历/采购/实吃/复制各查原请求，成功对象与预期数量一致。 |
| `handoff return preserves partial completion` | 已保存餐仍存在；未采购内容不被宣称已加入。 |

- [ ] **2. 执行指定改动。** 先静态检查配置来源，再用只读真实数据副本或获准的只读线上采样准备固定本地快照；业务写入仅专属隔离库和合成账号。数据质量不清洗、不计分、不改原始备份。

- [ ] **3. 执行指定改动。** 覆盖J01首次生成保存、J02跨日换菜、J03筛选选菜返回、J04复制取消/未知、J05采购部分选择/撤销、J06做法中断继续、J07多步助手部分成功、J08长期偏好明确保存、J09弱网恢复、J10账号/API切换、J11网页重启/恢复、J12混合日历/删除计划后实吃。

- [ ] **4. 执行指定改动。** 每种写路径注入提交前失败、提交后响应丢失、重启、重复确认、版本冲突；断言同原requestId、无重复对象、真实来源餐次和已完成部分保留。

- [ ] **5. 执行指定改动。** 复用既有数据库和助手验收但记录适用SHA/包/配置/数据指纹；R01恢复演练需成对backup+receipt，缺文件标not-run，不能把21/22改称全绿。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
python -m unittest discover -s tests -p test_experience_acceptance_guards.py
python scripts/run_experience_acceptance.py --config $ExperienceConfig --cases scripts/acceptance/experience-continuity-cases.json --out $ServiceEvidence --stage journey
python scripts/run_maturity_acceptance.py --config $ExperienceConfig --stage database --out $DatabaseEvidence --maven $MavenExecutable --maven-repository $MavenRepository --rehearsal-backup $RehearsalBackup --rehearsal-receipt $RehearsalReceipt
```

- [ ] **7. 记录证据并审阅。** 完成条件：每个J场景有可复核结果与限制；没有真实数据或权限时如实blocked，不用fixture替代真实事务。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `test: verify continuity journeys with isolated real-data services`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E18 · 全页面原生、无障碍和真实模型统一验收

**状态：** planned；**类别：** 体验验证；**依赖：** E17。

**用户问题：** 预览像样不代表原生布局、中文键盘、返回确认和真实助手同样可用。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `app.json`
- Existing: `scripts/acceptance/meal-experience-native.cjs`
- Existing: `scripts/run_maturity_live.py`
- Existing: `scripts/assistant_v4_provider_budget.py`
- Create: `scripts/acceptance/experience-continuity-native.cjs`
- Create: `scripts/acceptance/experience-continuity-device.md`
- Create: `docs/testing/experience-continuity-native.md`
- Create: `docs/testing/experience-continuity-model.md`

**Interfaces：** 新增原生runner必须显式 --mode fixture|service，输出mode/lifecycleEnabled/sourceSha/appFingerprint/actualViewport/fontScale/device/evidence；fixture不允许使用service结论。模型预算沿用既有账本，供应商HTTP尝试逐次计数，不能将每个scenario当一次。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `native page content stays reachable` | 无横向溢出/遮底/压字；44触控、48主动作、大字完整可达；必要反馈未被精简。 |
| `system cancel creates no copy` | 原生返回/取消后副本增量0，保存未知时原恢复入口可达。 |
| `model proposal and actual mutation are distinguished` | 建议不自动执行，保存/采购只有明确确认和真实回执后成功；错误目标必须澄清。 |

- [ ] **2. 执行指定改动。** 27路由逐项登记正常/加载/空/失败/权限/已完成/未保存/未知状态；不适用项写理由。6管理页使用管理员与普通账号，不伪造私有内容。

- [ ] **3. 执行指定改动。** 原生可调实际宽度320/390/430×字号1/1.3/2；实际模拟器宽度要读取，不用CSS缩放截图冒充设备。真实iOS与Android补中文IME、输入中退后台、系统返回/确认、读屏、弱网、安全区和长列表连续操作。

- [ ] **4. 执行指定改动。** 已有合成runner关闭部分生命周期，继续仅验证夹具布局；新service模式启用真实生命周期且仅接E17隔离服务。复制取消等系统弹窗无法自动化时给人工步骤和证据，不能跳过后填pass。

- [ ] **5. 执行指定改动。** 模型先核对本机真实ledger：当前核对为本批16/20，最多剩4次HTTP，执行时重新读。优先新语义回归：临时要求、歧义澄清、剩余采购任务；一次可多HTTP，按实际预算截断，未覆盖明列。不为确定性换菜/只读formatter浪费真实请求。

- [ ] **6. 执行指定改动。** 模型只用合成账号/公开菜谱，测试子进程只传必需配置，不修改本机凭据；卡片目标、回执、硬约束与实际记录核对。真实模型失败和超时也计入额度；额度不足不自动扩或转账。

- [ ] **7. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
node scripts/acceptance/experience-continuity-native.cjs --mode fixture --out $NativeFixtureEvidence
node scripts/acceptance/experience-continuity-native.cjs --mode service --config $ExperienceConfig --out $NativeServiceEvidence
python scripts/run_maturity_live.py --config $ExperienceConfig --out $LiveEvidence --budget $ModelBudget --authorization-date $ModelAuthorizationDate --approved-live --cases $ApprovedLiveCases
```

- [ ] **8. 记录证据并审阅。** 完成条件：报告分别列夹具布局、真实服务原生、真机、真实模型，不用截图数计通过率；缺设备/额度/平台能力明确保留未验收。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **9. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `test: add native and budgeted live experience acceptance`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E19 · 让真实目标用户完成任务并修复关键阻碍

**状态：** planned；**类别：** 可用性研究与定向修正；**依赖：** E18。

**用户问题：** 内部实现者知道入口在哪里，不能代表第一次使用者是否能自己完成。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `docs/testing/product-maturity-final.md`
- Existing: `docs/testing/product-maturity-usability.md`
- Existing: `docs/testing/product-maturity-usability-template.csv`
- Create: `docs/testing/experience-usability-protocol.md`
- Create: `docs/testing/experience-usability-findings.md`

**Interfaces：** 记录任务开始/结束、首次有意义操作、主动求助、误触、回退、数据丢失、恢复和用户原话；匿名participantId只存在私有研究资料。公开报告仅聚合且去标识，不用小样本算总体留存率。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `first time task can finish without route coaching` | 记录成功/失败及具体求助点，不把被教会后完成算独立完成。 |
| `no critical mistake is averaged away` | 重复写、错餐、丢输入任一出现即阻断，即使总体完成率高。 |
| `participant data remains private` | 报告无姓名账号聊天正文/原始录屏，取得参与者同意后才录制。 |

- [ ] **2. 执行指定改动。** 沿用已有10位目标用户、每人4个主任务的40次研究，不降低样本或门槛；覆盖首次使用、独居/两人/家庭与较大字体用户。招募需用户协助，不由agent或模型冒充，也不自动对外发送邀请。

- [ ] **3. 执行指定改动。** 主任务保持原四项：选出一餐、保存到指定日期、准备采购、记录不同的实吃。原5分钟/指导即assisted/未做not_run规则保留；新增临时忌口、做菜续接、助手部分成功、复制取消作为独立观察，不混入40次分母。

- [ ] **4. 执行指定改动。** 沿用40次中至少36次无指导成功，错餐写入/越权/数据丢失任何一次即阻断；不因总数好看掩盖重大可用性阻碍。逐项结果与真实样本限制一起报告，不外推总体满意度或留存，也不宣称没有同条件前态支撑的改善百分比。

- [ ] **5. 执行指定改动。** 先修阻断/误导/高频多余操作，复测同任务另换材料避免记忆掩盖；视觉个人偏好记录为建议，不无端改A/F。无法组织真实用户时交付待执行脚本，状态blocked且整体不宣称用户体验验证已完成。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
人工依照 docs/testing/experience-usability-protocol.md 执行；将阻碍映射到E01–E18责任任务，修复后运行该任务相关回归，再复测受影响旅程。
```

- [ ] **7. 记录证据并审阅。** 完成条件：用户完成任务的证据支撑结论；没有真实参与者时保留明确缺口，不用主观分数代替。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `docs: record observed usability outcomes and targeted follow-ups`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## E20 · 交付一份证据绑定的完整候选版

**状态：** planned；**类别：** 集成与发布准备；**依赖：** E17, E18, E19。

**用户问题：** 源码SHA、旧测试报告和实际打包产物可能没有绑定，容易误读成整版已经能直接发布。

**Files（现有文件检查/按需修改；测试文件不因列入清单就必须重写）：**

- Existing: `scripts/package_maturity_release.py`
- Existing: `tests/test_maturity_release_package.py`
- Existing: `tests/test_maturity_release_inputs.py`
- Existing: `scripts/verify.ps1`
- Create: `docs/testing/experience-continuity-final.md`
- Create: `docs/testing/experience-continuity-release-checklist.md`

**Interfaces：** package新增可选evidence_manifest参数/CLI --evidence-manifest；manifest条目含kind/status/sourceSha/artifactFingerprint/reportSha256/limits。校验报告hash及对应应用/资源/配置/数据指纹，允许证明运行产物未变的旧报告复用，不能只认docs HEAD。

- [ ] **1. 冻结本任务前态与断言。** 用下列命名场景记录输入、事件和期望。行为增量先运行到能复现原症状/缺少新合同；已有正确行为标为保留回归，不人为制造失败。

| 测试/场景名 | 必须断言 |
|---|---|
| `stale report cannot certify changed application bytes` | 证据hash/subject不匹配拒绝标verified；仅文档变更可明确复用相同应用指纹。 |
| `missing evidence yields draft not deployable` | 缺manifest、真机未做或性能未达，报告和包元数据都如实限制。 |
| `package excludes private configuration` | 候选清单无凭据、运行目录、用户内容或模型原始请求。 |

- [ ] **2. 执行指定改动。** 统一对最终修改做全仓适用检查、独立审阅和风险任务复测；引用中间结果需证明相关字节/配置/数据未变。审阅关注错餐、重复写、账户混入、假成功、信息精简误删恢复入口。

- [ ] **3. 执行指定改动。** 候选包含小程序/网页/Java/Python、已有迁移与回滚说明及脱敏证据索引；无新增业务表作为默认目标，任何新增schema必须回到设计评审。

- [ ] **4. 执行指定改动。** 缺证据manifest仅能打DRAFT且evidenceStatus=missing；有blocked/not-run不能显示全部验收。deploymentAllowed始终false，候选打包不是生产授权；不得携带本机配置/令牌/私有日志。

- [ ] **5. 执行指定改动。** 最终报告按真实改进、保留、未达、未验收、已打包分别写；不再给主观90分。后续如用户授权推送/上线，再核对目标、备份、迁移和回滚及小程序独立发布状态。

- [ ] **6. 运行对应验证。** 行为测试退出0且具名断言通过；真实/人工项产生带环境、源指纹和限制的报告。不能运行的项目标blocked或not-run。

```powershell
python -m unittest discover -s tests -p 'test_maturity_release*.py'
powershell -ExecutionPolicy Bypass -File scripts/verify.ps1 -PythonExecutable $PythonExecutable -MavenExecutable $MavenExecutable -MavenRepository $MavenRepository
mvn -f backend/pom.xml -DskipTests package
python scripts/package_maturity_release.py --quality-bundle $ExistingQualityBundle --out $CandidateOutput --web-release $WebRelease --migration-bundle $MigrationBundle --jar $CandidateJar --evidence-manifest $EvidenceManifest
```

- [ ] **7. 记录证据并审阅。** 完成条件：全部任务有终态与证据；未验收或未达不被汇总遮盖，代码候选、验收完成、生产发布三个状态分开。 对照机器清单中的K责任项与Review Focus，记录源码/产物/配置/数据指纹、输出路径与未验证项。

- [ ] **8. 整理一个可审阅提交。** 只暂存本任务相关差异，建议提交说明 `build: bind experience release candidate to verified evidence`；不自动push、不改线上。若本次授权仅是计划，本步骤保持未执行。

## 具体验收断言示例

以下为纯投影函数可直接采用的断言形式；依赖页面/Java/数据库的具名场景在相应现有测试夹具内实现，不能把伪造接口当真实集成。字段以Interfaces为准。

```javascript
// E13：未添加输入必须显式处理。
assert.deepEqual(
  preferenceSaveIssue({peopleDraft: 2, ingredientDraft: '花生'}),
  {field: 'ingredientDraft', message: '请先添加这项忌口'}
);
assert.equal(preferenceSaveIssue({peopleDraft: 2, ingredientDraft: ''}), null);

// E08：有内容时以勾选为主。
assert.equal(shoppingPagePresentation({pendingCount: 3, checkedCount: 0,
  sourceMeals: [], drafts: [], loading: false, offline: false}).addEmphasis, 'secondary');

// E03：即使有有效页面栈，跨账号来源仍无私有返回目标。
assert.notEqual(resolveAssistantReturn(crossAccountFixture).routeKey, 'assistant');
```

E10关键并发用可控Promise阻塞flush，点击菜A，改变餐次/版本，再释放flush；断言工作区命令调用0次。E14模拟commit已写成功、readback抛异常，断言pending最终false、commandId保留、下次恢复仅核对原命令。E12把公开continuation的参数字段故意留空，断言不生成日期/来源、不调用resume终态；这些不能只测试某个展示字符串。

## 最终收口与问题分级

- P0：越权、错餐写入、重复创建、不可恢复丢失、假成功 → 阻断交付，先修并重验相关链路。
- P1：主任务无法独立完成、关键恢复入口丢失、输入/焦点严重遮挡、最终性能容量无结论 → 阻断“完整验收”结论。
- P2：次要文案、局部间距等低风险问题 → 同计划收口；若因平台无法处理须给具体影响，不用“待优化”笼统替代。

只有所有范围内任务有明确结果才能结束本轮；缺真机/参与者/额度时可以交付代码候选与已验证部分，但报告必须保持对应blocked/not-run，不能称全量完成。收到必要信息后从原任务续接，不另起一套评分计划。

## 计划自检要求

执行前核对：20任务依赖可排序，27路由全覆盖，K01–K32各有负责人，12旅程都有故障/回退断言；现有路径真实存在、新建路径明确；模板生成与代码入口一致。接口命名与返回形状在上下游一致，禁止重复状态存储。五项Review Focus必须在负责任务的测试中落地。

每次实现更改了设计决定，原位更新本规格、对应任务、coverage和证据指针，记录原因；不要让网页预览与实施计划产生两个真值。最终由独立审阅核对全部差异和剩余问题，事实与推断分开。
