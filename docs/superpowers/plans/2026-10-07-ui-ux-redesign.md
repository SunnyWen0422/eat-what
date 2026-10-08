# 吃什么 V4 全页面 UI / UX 改版 Implementation Plan

> **For agentic workers:** 执行时使用 `superpowers:executing-plans` 按任务推进。本文为用户要求的计划交付，不构成启动实施、生产变更或自动委派授权。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不丢失现有功能与数据契约的前提下，把 27 页统一为温暖、清楚、顺手的餐桌生活体验，清除无意义装饰。

**Architecture:** 延续 Token 与模板生成链路、V4 单一工作区和现有 API。布局按任务分为餐单内容、连续列表、阅读步骤、编辑表单及管理列表；共享组件负责统一行为和样式。页面状态继续来自既有业务模型，不建立新的前端事实来源。

**Tech Stack:** 原生微信 WXML/WXSS/JavaScript、现有 Python 资产生成、Node/Python 验证、微信官方编译器与开发者工具。设计样板为独立静态预览，不接业务服务。

**Spec:** [美化总方案](../specs/2026-10-07-ui-ux-redesign-design.md)、[27 页与功能矩阵](../../ui/2026-10-07-full-page-experience-matrix.md)、[装饰专项清单](../../ui/2026-10-07-decoration-audit.md)。三份一起使用。

## Global Constraints

- 方向已选定为“温暖餐桌感”；主绿 `#28634E`、暖白 `#F8F7F2`；首页无作用星星直接移除。
- V4 继续开启；语音服务空置，点击弹窗逐字为“抱歉，该功能暂不可用”，不录音、不调用模型。
- 27 个路由与四 Tab 全覆盖；兼容入口保留。计划/采购/勾选/实付/实际五类动作不得合并写入。
- 缺参考价保持空值、显示真实报价日期；实付按当前食材汇总一次，0 有效，与已买独立。
- 新 Token 与模板是单源；不得只修改生成 WXSS。图标语义名向后兼容，去掉旧伪元素前核对所有引用。
- 触点至少 44×44px，主按钮最小 48px；大字可增高，不以固定高度裁字。
- 普通文字对比至少 4.5:1，关键非文字控件至少 3:1；图形不单独承担状态含义。
- 无凭据、无真实个人数据的隔离状态样例；不依赖线上、真实模型或图片下载完成布局开发。
- 本轮模型累计额度约束延续，设计/样板验证不消耗产品模型请求；实际联调另按既有计数器处理。
- 保留未提交成果与现有线上升级文档；不自动推送、部署、迁移或清理他人目录。

## Review Focus

1. 一个点击同时触发菜品详情与加入/收藏：使用原生事件边界，UI04/05 验证只触发目标动作。
2. 视觉状态已切换但原保存结果未知：UX03/06 保持原请求与 pending 数据，不能为新文案创建第二次写入。
3. 320px、大字、中文键盘挤掉确认按钮：UX02/08 检查实际点击盒与可滚动范围，不只读 CSS。
4. 无封面/无步骤/缺价时显示虚构内容：UX04/05/06 验证完整的缺数据布局及未知语义。
5. 减少按钮后高级/危险/管理员入口失联：UX03/07/08 按全功能矩阵从实际入口完成任务，核对旧路由与返回。

## 任务关系与交付批次

UX01 → UX02 → UX03；UX04/05/06 在底座稳定后依次完成，UX07 统一剩余页面，UX08 总验收。先完成一条“决定晚餐 → 采购 → 做饭 → 实际记录”的设计与交互样板再全面铺开。

粗估 12–18 个有效工作日；以每批验收交付为准，不包含线上环境或外部素材等待。以下均未实施，不标完成比例。

### UX01：设计样板与可追踪基线

**Files:**
- Modify: `docs/ui/2026-10-07-ui-direction-preview.html`、`docs/ui/2026-10-07-full-page-experience-matrix.md`、`docs/ui/2026-10-07-decoration-audit.md`。
- Create at execution: `docs/ui/redesign/route-state-cases.json`（27 路由、状态、功能与证据映射）。
- Private outputs: `work/ui-ux-redesign/`，不复制生产配置。

**Interfaces:** Consumes 总方案、44 份源码清单；Produces `route-state-cases.json` 每项 `{id, route, state, task, actions, fixture, result, evidence}`，`result` 初始 `not_run`，后续只用 `pass/fail/not_run/not_applicable`。

- [ ] 记录执行时源码 SHA 与改动，不用计划基线覆盖新成果。
- [ ] 核实今天/菜谱/详情/采购/计划/我的六类布局，以及要求/实际两个弹层的正常、无图、空和失败样板。
- [ ] 为 27 页生成适用状态条目，覆盖 UI01–UI27 和 L01–L13；动态菜单与旧兼容分支单独标识。
- [ ] 在 320/390px 检查样板，和本次装饰清单逐项对照；发现设计矛盾先修改文档与样板，再进入实现。
- [ ] 将仅涉及设计基线的成果单独保存，用户未要求改变方向时不反复询问普通布局细节。

### UX02：基础组件、图标和资源链路

**Files:**
- Modify: `design/tokens.json`、`scripts/build_ui_assets.py`、`design/wxss/app.tpl`、`design/wxss/components/*/*.tpl`、`components/ui-*/*`。
- Generated outputs: `app.wxss`、`styles/theme.wxss`、各组件 WXSS、`utils/ui-tokens.js`、`utils/ui-assets.js`、`assets/icons/*`、`design/asset-manifest.json`，只能通过生成器更新。
- Create at execution: `design/icon-sources.json`、`design/licenses/`、`docs/ui/redesign/icon-specimen.html`。
- Tests: `tests/ui-assets.test.js`、`tests/ui-components.test.js`、`tests/ui_source_audit.py`。

**Interfaces:** 保留 `ui-button` 的 `label/variant/disabled/loading` 和 `action` 事件，新增 `variant='tertiary'`；`primary/secondary/danger` 兼容。`ui-state` 保留 `kind/title/description/actionLabel/action`，新增可选 `density='page'|'inline'`，普通 loading 默认无插画。`ui-icon` 的原 name/alias 不变；缺 icon 的列表行省略图标槽。

- [ ] 为新增按钮变体、普通 loading 不默认展示 AI 图、禁用/忙碌不触发事件补充针对性检查；先确认旧行为与失败断言。
- [ ] 增加 reading=16、display=28 等总方案语义 Token；统一按钮、字段、列表、状态、Sheet 与确认层级。
- [ ] 选定图标基础版本并保留许可；设计四 Tab 和收藏选中轮廓；生成 20/24/32px 对照板，不直接灌色凑选中态。
- [ ] 按 D18 清点并消除旧伪元素重复绘制；有兼容用途的先迁移调用，不盲删样式。
- [ ] 执行资产生成与上述检查；核对生成可重现、资源路径正确、完整级联后触点尺寸/长按钮/对比度符合标准。
- [ ] 提交独立底座变更与组件样板，关联 D05/06/14–20。

### UX03：当前餐与助手的层级重排

**Files:**
- Modify: `templates/meal-workspace.wxml`、`design/wxss/styles/workspace.tpl`、`utils/meal-workspace-presentation.js`、`utils/meal-workspace-page.js`、`pages/index/index.*`、`pages/result/result.*`、`pages/chat/chat.*`。
- Tests: `tests/workspace-page.test.js`、`tests/workspace-requirements-sheet.test.js`、`tests/workspace-voice.test.js`、`tests/meal-workspace.test.js`。

**Interfaces:** 延用 `deriveWorkspacePresentation(value)` 的 `primaryAction/primaryLabel/primaryDisabled/showRequirements`；允许增加展示字段，不改变输入状态或写入 API。三个路由继续共享 `createWorkspaceStore`，按现有 `mode` 区分视图，不保存第二套餐单。

- [ ] 为未知/冲突优先于正常主动作、换餐/切账号关闭旧输入层、确认目标显示增加有行为价值的断言；保留原请求恢复测试。
- [ ] 移除 D01 首页星星、D02 重复书本、D04 常驻成功图；空态简化；菜单成为中心。
- [ ] 把重复要求入口合并，清单和历史成为明确入口；所有高级人数/菜数/时长/已有食材/筛选仍可达。
- [ ] 分别实现今天总览、结果决策、助手表达布局；停止任务、换菜、保留、撤销、替换确认全部沿用已有方法。
- [ ] 验证语音弹窗原文且没有录音/请求；跑上述针对测试，逐状态从 UI01/03/23 实际入口走查。
- [ ] 保存本批截图及覆盖状态，独立提交。

### UX04：菜谱浏览、选菜与内容阅读

**Files:**
- Modify: `pages/customize/customize.*`、`pages/dish-detail/dish-detail.*`、`components/dish-card/*`、对应 `design/wxss/pages/` 与组件模板。
- Tests: `tests/detail-servings.test.js`、`tests/page-contracts.test.js`；create `tests/recipe-interaction-hierarchy.test.js`。

**Interfaces:** `dish-card` 保留 `dish` 与 `open` 事件；新增可选 `mode='browse'|'select'` 和 `selected`，选择使用单独 `select` 事件且阻止向 open 冒泡。父页继续调用原选菜与保存函数。

- [ ] 用“点击加号不打开详情、点击图片不改变选择、返回保持筛选/滚动/已选”的用例固定边界。
- [ ] 建立有图/无图、浏览/选择两种展示；D09 的重复占位文案消失；搜索/筛选/分类保持稳定。
- [ ] 详情调整阅读顺序与上下文主动作；保留图片预览、原生分享、收藏和本人编辑。
- [ ] 创建私房菜表单从默认浏览中收起，通过清楚入口进入；原字段、草稿和取消规则不丢失。
- [ ] 验证长菜名、未知用时、空步骤、图片失效、分页晚到结果及事件隔离，保存 UI04/05 样例并提交。

### UX05：计划、做饭与实际记录

**Files:**
- Modify: `pages/calendar/calendar.*`、`pages/calendar-detail/calendar-detail.*`、`pages/meal-cooking/meal-cooking.*`、`templates/meal-actual-sheet.wxml`、对应样式模板；必要时改 `utils/meal-actual-entry.js` 的展示状态，保留提交契约。
- Tests: `tests/meal-workflow.test.js`、`tests/meal-dates.test.js`、`tests/meal-cooking.test.js`、`tests/meal-actual-entry.test.js`。

**Interfaces:** 实际记录入口仍传 `{date, mealType, planRevision, displayedPlanNames}`；按计划与自由实际仍走已有独立提交方法。新增选择态仅为 Sheet 内部 `byPlan|changed`，不改变后端枚举或历史存储。

- [ ] 固定“选记录类型不写入，确认才写入；已显示计划变更时不能按新计划直接记实际”的断言。
- [ ] 周/月历和餐次详情优化分组，完整保留编辑/选菜/复制/采购/取消/删除/实际/撤销路径。
- [ ] 做饭页以步骤阅读为中心；保留各菜进度和缺步骤状态，完成不自动记实际。
- [ ] 实际 Sheet 改为类型选择后单主动作，保留未来限制、原请求重试、冲突对照和输入恢复。
- [ ] 跑针对测试，检查大字与键盘下确认可达、旧计划快照不被悄悄替换，保存 UI06/07/26 与 L04 证据并提交。

### UX06：采购预览与清单

**Files:**
- Modify: `pages/shopping-preview/shopping-preview.*`、`pages/shopping-list/shopping-list.*`、对应样式模板、`components/ui-checkbox/*`。
- Tests: `tests/shopping-view-hierarchy.test.js`、`tests/shopping-edit-intent.test.js`、`tests/shopping-drafts.test.js`、`tests/v4-business-contracts.test.js`。

**Interfaces:** 保留 `rowKey/ingredientKey/selectionKey/itemIds` 等原身份键，不因视觉分组改变费用归属。来源、金额编辑继续调用原有 handler；本批不重写数量/价格算法。

- [ ] 为“打开行详情不勾选、金额 0 保存且不改变已购、部分已买状态、改名不确认未知量”固定回归。
- [ ] 采购预览突出餐次/人数/确认；清单改连续行，来源/费用按需展开，D08 空态与过滤零结果区分。
- [ ] 合并添加入口、把低频复制/清空放更多；保留所有确认与失败恢复路径。
- [ ] 验证缺价为空、报价日真实、同食材仅一笔实付、重试不重复写、未知状态保留原请求。
- [ ] 检查单手勾选、长食材名、单位、滚动与返回；保存 UI24/25 和 L05–07 证据并提交。

### UX07：个人内容、支持与六个管理页

**Files:**
- Modify: `pages/profile/`、`pages/profile-edit/`、`pages/favorite-dishes/`、`pages/custom-dishes/`、`pages/settings/`、`pages/recommend-filter/`、`pages/statistics/`、`pages/sync/`、`pages/about/`、`pages/logs/`、`pages/assistant-history/`、`pages/admin*/` 的模板/必要页面展示逻辑和对应样式模板。
- Tests: `tests/preference-scope.test.js`、`tests/page-identity-regressions.test.js`、`tests/account-boundaries.test.js`、`tests/assistant-history.test.js`、`tests/page-contracts.test.js`。

**Interfaces:** 保留全部原路由和参数、管理员接口和权限验证；导航只能移位置，不能减少能力。历史仍只读，导入仍明确复核来源/目标/账号。

- [ ] 固定“关闭登录后不循环弹窗、普通用户不能进入管理、返回编辑不自动保存、历史浏览不写当前餐”的针对断言。
- [ ] 我的重新分组，合并 D11 同义清单入口，删除 D12 重复说明；资料和助手历史入口可发现。
- [ ] 收藏/私房菜/偏好/筛选采用底座；首次空与搜索空分开；长期与临时作用域清晰。
- [ ] 回顾/同步/关于/日志聚焦真实内容和必要口径；不要以装饰徽章或假指标填充。
- [ ] 六个管理路由逐一优化密度、搜索、编辑和危险确认；逐功能对照旧 admin 能力再调整入口。
- [ ] 跑适用针对测试、核对全页矩阵无漏页，记录本批结果并提交。

### UX08：全页与真实微信体验验收

**Files:**
- Update: `docs/planning/2026-10-06-acceptance-matrix.md`（追加本版证据，不覆盖旧历史）。
- Create at execution: `docs/testing/2026-10-ui-ux-redesign-results.md`；截图/记录写私有 `work/ui-ux-redesign/`。
- Use: `scripts/verify.ps1`、`scripts/check_native_compile.py`、`scripts/export_local_miniprogram.py`。

**Interfaces:** 消费 UX01 的 route-state-cases 和各批证据，输出准确的逐条结果；普通源测试、浏览器布局、官方编译、原生交互和真机分别报告。

- [ ] 全部代码完成后运行 `scripts/verify.ps1` 和适用官方 WXML/WXSS 编译；检查只修改目标文件、资产可重现，无密钥进入包。
- [ ] 导出纯净小程序目录，在微信工具使用隔离配置；核对服务目标后才做行为测试。
- [ ] 对 UI01–UI27、L01–L13 在 320/375/390/414px、普通/1.5 倍字体及 iOS/Android 适用场景检查；验证键盘、安全区、Tab、返回、权限取消。
- [ ] 按 D01–D28 逐项检查装饰处置；所有图标对照真实 20/24px；每个保留元素都有信息或操作作用。
- [ ] 请 3–5 位目标用户完成总方案五项任务，记录误点/停顿/理解偏差，修复具体问题。无法组织用户测试时明确标未执行，不阻止已授权本地修复。
- [ ] 汇报已覆盖与未完成项；本地验收不等于线上升级或微信发布。只有用户另行要求时推送目标分支。

## 自检与开始条件

本计划覆盖全部 27 页、15 个公共组件、13 类交互层和 D01–D28；纯样式与文档不强制 TDD，行为变化才补必要回归。执行方法建议当前会话按批实现，便于你在微信工具持续体验；本次交付到计划为止。
