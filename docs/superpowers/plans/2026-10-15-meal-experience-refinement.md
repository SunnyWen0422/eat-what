# 餐桌页面与任务流程优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有业务能力与 A/F 视觉方案的基础上，让用户更快找到菜、使用助手和完成一顿饭的完整流程。

**Architecture:** 原页面与状态机继续负责业务，本轮通过展示层和小型纯函数整理布局、入口与下一步。小程序和网页各自使用已有数据与事件接口；不引入新后台服务。任务 1–9 顺序实施，完成后再进入独立反馈计划 B。

**Tech Stack:** 原生微信小程序 / glass-easel / WXML / WXSS / CommonJS；React 19 / TypeScript / Vite；Node 24；node:test / Vitest / Playwright / 微信开发者工具自动化。

**Spec:** [实施规格](../specs/2026-10-15-meal-experience-refinement.md)。执行前完整阅读；规格是本计划的产品判定依据。

## Global Constraints

- 基线 `7977455b26213a1579f7c4f7f73b4426d12748ce`；唯一正式源为当前仓库，不从历史导出副本回写。
- 四个主导航保持“今天 / 菜谱 / 日历 / 我的”。菜品及助手 F，其他 A；品牌 `#28634E`、背景 `#F8F7F2`。
- 字号 24/18/16/13/12；正文行高1.5、长文1.65；触达44×44、主按钮≥48；图片圆角缩略14、主图18；动效100/180/200ms，服从减少动态效果。
- 不直接编辑 `utils/ui-tokens.js`、`styles/theme.wxss`、`styles/component-theme.wxss` 等生成输出；改 `design/` 源并由 `scripts/build_ui_assets.py` 生成。
- 复用既有身份隔离、版本、确认、失败恢复与图片来源；计划不等于实吃，缺价不猜，复制保存时才创建。
- 无部署、上传、生产写入、数据库迁移、真实模型请求。本轮也不扩大旧聊天功能。网页不增加假助手或云同步承诺。
- 每个任务局部通过后提交独立本地提交；指定路径暂存，不使用 `git add .`。本计划的 commit 不等于 push 或上线授权。

## Review Focus

1. 生成中、未知结果或冲突时折叠设置，恢复入口仍可见且不会产生第二个写请求：任务2、5。
2. 从日历或菜品进入助手时用户切换账户、餐次，旧 handoff 不污染新上下文：任务4。
3. 大字、键盘、长菜名和底部安全区导致操作不可达：任务1、3、5、9。
4. 多餐采购来源、未来日期或删除计划，不能误记实吃或跳入错误餐次：任务6。
5. 图片失败、菜库不可用、网页只读模式和复制待确认，不能因精简删除恢复入口：任务3、7、8、9。

## 文件责任与执行约定

| 区域 | 文件 | 责任 |
|---|---|---|
| 设计源 | `design/tokens.json`, `design/theme.wxss.tpl`, `design/component-theme.wxss.tpl` | 控件/字号/玻璃层级；不包含业务状态 |
| 今天 | `utils/meal-workspace-presentation.js`, `utils/meal-workspace-page.js`, `templates/meal-workspace.wxml`, `styles/workspace.wxss` | 状态推导、原命令、布局 |
| 菜谱 | `pages/customize/customize.{js,wxml,wxss}`, `styles/recipe-selection.wxss` | 列表与选择；保留编辑表单和分页 |
| 助手 | `utils/assistant-page.js`, 新 `utils/assistant-entry.js`, `pages/chat/chat.{wxml,wxss}` | 一次性入口与展示；不重写 conversation 状态机 |
| 卡片 | `components/assistant-card/index.{js,wxml,wxss}`, `utils/assistant-cards.js` | 按真实回执展示、原确认事件 |
| 任务流 | 新 `utils/meal-next-step.js` 及日历/采购/做菜页面 | 从已确认事实推导跳转，不写业务数据 |
| 网页 | `web/src/ui/{Today,Recipes,Calendar,Shopping,My,PersonalActions,components}.tsx`, `styles.css` | 保留现有 Props 和数据边界，仅按任务列出的文件改动 |
| 验收 | `tests/`, `web/test/`, `web/e2e/`, `docs/testing/` | 行为、原生截图、浏览器适配、结果限制 |

以下 shell 命令从仓库根运行；先确保 PATH 使用 Node24 与可用 Python。不要依赖其他 agent 的私有绝对路径。运行代码测试前检查入口没有真实数据库或供应商访问。纯样式任务直接做几何/原生验证，不写匹配 CSS 字符串的伪回归。

## Task 1：固定排版与控件基线

**Files:** Modify `design/theme.wxss.tpl`, `design/component-theme.wxss.tpl`, `components/compact-dish-row/index.wxss`, `components/ui-sheet/ui-sheet.wxss`, `web/src/ui/styles.css`; Test `tests/component-native-contracts.test.js`, `tests/fixed-action-layout.test.js`。

**Interfaces:** 消费 `design/tokens.json` 已有字段；产生原有 `.ew-heading/.ew-title/.ew-reading/.ew-hit-target` 及网页对应类的尺寸约束，不新增业务 API。

- [ ] 保存同夹具的今天/菜谱/助手正常和2倍字体“改前”截图到仓库外 work 目录，记录源码 SHA、基础库、viewport 与字体；没有原生工具则标未完成，不用旧截图充当新基线。
- [ ] 修改设计源：只整理正文/标题行高、卡片间距与边界；同一屏不叠加多层透明背景。图片与按钮应用规格尺寸，按钮使用最小高度而非固定高度截字。
- [ ] 运行 `python scripts/build_ui_assets.py`；检查生成 diff 只来自模板，不把无关图标重绘混入。
- [ ] 运行 `node --test tests/component-native-contracts.test.js tests/fixed-action-layout.test.js`；通过并检查原生320宽/2倍字体弹层确认按钮可滚动到达、点击区≥44，正常主按钮≥48。
- [ ] `git diff --check` 通过，按 Files 及对应生成文件逐项暂存，提交 `style: normalize meal typography and controls`。

## Task 2：今天页菜单优先、设置可展开

**Files:** Modify `utils/meal-workspace-presentation.js`, `utils/meal-workspace-page.js`, `templates/meal-workspace.wxml`, `styles/workspace.wxss`, `components/meal-composition-summary/index.{wxml,wxss}`; Create `tests/meal-focus-presentation.test.js`; Regress `tests/experience-composition.test.js`, `tests/experience-save-target.test.js`。

**Interfaces:** 保留 `deriveWorkspacePresentation(value)` 既有输出，新增 `hasMenu:boolean` 与 `settingsInitiallyCollapsed:boolean`。页面新增 `mealSettingsExpanded:boolean`、`onToggleMealSettings(event):void`；原 people/composition/requirements/filter handler 不变。折叠是展示状态，不存入 workspace。

- [ ] 新增行为测试：无菜单 expanded；有菜单初始 collapsed；手动展开后普通 render 不重置；更换 workspace ID 后按新菜单重置；同餐重复点击保留草稿。
- [ ] 新增恢复测试：`syncStatus=unknown/offline/conflict` 不改变既有 primaryAction；生成中折叠/展开不调用 command API。运行 `node --test tests/meal-focus-presentation.test.js`，确认失败原因是尚未实现新输出/事件。
- [ ] 实现新增展示属性和展开事件；人数/搭配两区域同排；有菜单后要求、筛选、用时收进“本餐设置”。把错误/恢复/硬约束变化信息留在可见区域；自己选菜保留可见。重用既有主按钮状态机。
- [ ] 运行新增测试和两个回归文件；原生390×844正常字体有两张完整菜品卡，2倍字体人数、搭配均可操作，餐次仍横排可滚动。
- [ ] 按本任务路径暂存并提交 `feat: prioritize current meal dishes over settings`。

## Task 3：菜谱首屏与详情精简

**Files:** Modify `pages/customize/customize.{js,wxml,wxss}`, `styles/recipe-selection.wxss`, `pages/dish-detail/dish-detail.{wxml,wxss}`; Test `tests/experience-recipe-selection.test.js`, `tests/personal-copy-recovery.test.js`, `tests/dish-image-compatibility.test.js`; Create `tests/catalog-focus.test.js`。

**Interfaces:** 复用 `onToggleBrowseFilters/onClearBrowseFilters/onRecipeSource/onDismissPersonalGuide`、selectedMeal 和现有选择条；新增 `onOpenCatalogHelp():void`，只显示说明，不写选择或偏好。

- [ ] 新增测试：默认高级筛选关闭、打开帮助不改查询/选择、清筛选保留已选、选择条零项不占位；未知复制请求仍有恢复入口。运行 `node --test tests/catalog-focus.test.js` 观察指定行为失败。
- [ ] 先改模板层级及帮助入口，再改样式；取消常驻教学，目标餐次只在选择条显示一次；表单模式、常用菜单编辑范围提示不删。详情的收藏/分享对齐标题顶端，长标题允许换行。
- [ ] 运行新增测试及列出的三个回归；390×844正常字体能看到三条可识别菜品，搜索/筛选/已选条不覆盖列表最后项，缺图显示图标但有图仍走原 URL。
- [ ] 按路径暂存并提交 `feat: simplify recipe browsing and detail hierarchy`。

## Task 4：助手入口携带准确上下文

**Files:** Create `utils/assistant-entry.js`, `tests/assistant-entry.test.js`; Modify `utils/meal-workspace-page.js`, `utils/assistant-page.js`, `pages/calendar-detail/calendar-detail.{js,wxml}`, `pages/dish-detail/dish-detail.{js,wxml}`, `templates/meal-workspace.wxml`。

**Interfaces:** 新模块导出 `createAssistantEntryStore({storage,scopeKey,now})`，storage 为 getStorageSync/setStorageSync/removeStorageSync；scopeKey 使用 `API_BASE_URL + ':' + getUserStorageKey('assistantEntry')`；now 返回毫秒。返回 `put({dishId,dishName,date,mealType}):string` 和 `take(token):Entry|null`；Entry 含正整数 dishId、字符串 dishName、ISO日期 date、breakfast/lunch/dinner mealType，目标使用现有 validateMealTarget 校验。只存一条、10分钟过期、读取即删除；token只作本地查找键，不作授权。

- [ ] 新增测试：匹配 scope 一次性读取成功；重复读取、过期600001ms、切账户/环境、非法ID或日期返回null；消息不自动发送。运行 `node --test tests/assistant-entry.test.js` 确认失败。
- [ ] 实现 store，沿用现有环境/账户隔离函数。今天与日历复用原路由；详情通过 `?entryScene=chat&entryToken=...&date=...&mealType=...` 打开当前餐助手。详情无目标时读取当前选择餐次，不能凭菜名推断目标。
- [ ] 在助手成功加载且 scope 未变时消费 Entry，把“请介绍菜品 ID <id>「<name>」的做法”写入输入框；已有输入先弹确认，取消保留；不直接调用 send/confirm，不向 workspace 加菜。能力不可用时不显示该入口，旧兼容不消费该 handoff。
- [ ] 运行新测试、`node --test tests/assistant-conversation.test.js tests/account-boundaries.test.js tests/dish-workspace-handoff.test.js`；集成夹具确认详情→助手只出现预填消息、无写请求。
- [ ] 提交 `feat: add contextual assistant entry without automatic sends`。

## Task 5：助手对话以内容和办事卡片为主体

**Files:** Create `utils/assistant-presentation.js`, `tests/assistant-presentation.test.js`; Modify `utils/assistant-page.js`, `pages/chat/chat.{wxml,wxss}`, `components/assistant-card/index.{wxml,wxss}`; Regress `tests/assistant-cards.test.js`, `tests/assistant-conversation.test.js`。

**Interfaces:** `buildAssistantSuggestions({hasMenu:boolean,available:boolean}):Array<{id:string,label:string,text:string}>`。无菜单返回 arrange/arrangements 两项；有菜单最多四项 arrange/replace/shopping/arrangements。固定文字分别“按当前人数和要求安排这餐”“帮我换一道菜”“准备这餐的采购清单”“看看我已有的用餐安排”。页面新增 `conversationMenuExpanded`、`onToggleConversationMenu():void`、`onConversationSuggestion(event):void`，数据集只存 id，通过纯函数白名单取 text。

- [ ] 新增测试：能力关无建议；无菜单不出现换菜/采购；最多四项；点击只 setInput，不调用 send；已有输入取消替换时完全保留；会话 busy/recoverable 时不能用快捷项覆盖待恢复输入。运行新增测试确认失败。
- [ ] 实现纯函数与事件；一行餐次摘要代替重复大标题；当前菜单默认折叠，有消息时隐藏快捷项；隐藏新版语音入口，不删除旧版降级 handler。
- [ ] 保留 pending 卡片完整目标、来源和确认/取消；历史卡片不恢复 active。确认后直接使用现有 receipt 的链接，不通过最后一句模型文本拼造“成功”。采购部分选择仍展示真实加入项。
- [ ] 运行新增测试及两个回归；增加 unknown→recover 同 request、预览过期→核对、关闭能力→旧卡不能写入的现有断言覆盖检查；缺失则在对应回归补齐后运行。
- [ ] 原生正常/2倍字体开键盘，输入、发送、停止、恢复与预览确认都可达；截图无重复整份当前菜单。提交 `feat: focus assistant conversation and confirmation cards`。

## Task 6：把保存、采购、做菜和记录接起来

**Files:** Create `utils/meal-next-step.js`, `tests/meal-next-step.test.js`; Modify `templates/meal-workspace.wxml`, `pages/calendar-detail/calendar-detail.{js,wxml}`, `pages/shopping-list/shopping-list.{js,wxml}`, `pages/meal-cooking/meal-cooking.wxml`; Regress `tests/experience-journeys.test.js`, `tests/meal-cooking.test.js`, `tests/calendar-actual-recovery.test.js`。

**Interfaces:** `distinctMealSources(dishes):Array<{date:string,mealType:string}>` 复用 shopping-view.normalizeShoppingSource，从 sourceDate/sourceMealType（兼容date/mealType）提取，按 validateMealTarget 验证、去重、日期与早餐/午餐/晚餐顺序排序；缺失/非法来源跳过。`mealSourceUrl({date,mealType}):string` 返回 `/pages/calendar-detail/calendar-detail?date=<date>&mealType=<mealType>`，非法输入抛错，不包含凭据。页面新增 `onOpenSourceMeal(event):void`；calendar-detail.onLoad 校验可选 mealType，存为 highlightedMeal 并定位对应卡片，不能自动打开写入弹层。不新增写API。

- [ ] 新增测试：同餐来源合并、两餐保持两项、无来源无捷径、非法日期拒绝；购物勾完不写实吃；未来日期做菜不开放实吃。运行新增测试确认失败。

```js
assert.deepEqual(distinctMealSources([{sourceDate:'2026-10-15',sourceMealType:'dinner'},{date:'2026-10-15',mealType:'dinner'}]),[{date:'2026-10-15',mealType:'dinner'}])
assert.deepEqual(distinctMealSources([{dishName:'手动添加'}]),[])
assert.throws(()=>mealSourceUrl({date:'2026-02-30',mealType:'dinner'}))
```
- [ ] 单来源显示“查看对应餐次”，多来源由弹层先选择；跳转目标依赖当前展示来源，不用系统当天替代。保存成功的下一步使用 savedTarget，不能误用正在编辑的另一天。
- [ ] 整理现有准备食材/开始做菜/记录实际用餐按钮层级；复用 onRecordActual 与现有版本读取。被删或改变的计划返回核对，不能从旧菜单偷偷重建计划。
- [ ] 运行新增及三个回归；完成夹具“跨日保存→采购→选择目标餐→做菜→主动记录”，核对 date、mealType、planRevision 和写入次数。提交 `feat: clarify next steps across the meal journey`。

## Task 7：其余页面分组和用户文案

**Files:** Modify `pages/profile/profile.wxml`, `pages/favorite-dishes/favorite-dishes.wxml`, `pages/custom-dishes/custom-dishes.wxml`, `pages/statistics/statistics.wxml`, `pages/sync/sync.wxml`, `pages/assistant-history/assistant-history.wxml` 及各自 wxss；Test `tests/profile-entry-hierarchy.test.js`, `tests/page-user-copy.test.js`, `tests/page-purpose-copy.test.js`, `tests/personal-copy-recovery.test.js`。

**Interfaces:** 所有现有 bindtap、权限判断、恢复状态字段保持；仅分组与文案。不新增通用隐藏错误规则或全局吞异常。

- [ ] 列出常驻文案并分成“操作所需”“有风险时出现”“帮助中可看”；版本号、来源标识、接口术语只移走正常态说明，必要事实与失败恢复仍可见。
- [ ] 按规格整理“我的”三个分组；收藏/私房菜/历史保持F食物区域、其余A；统计空态写“还没有实际用餐记录”，同步页保留待确认复制与原请求核对。
- [ ] 运行列出的四个回归，核对管理员/普通用户入口、来源菜已下架的复制恢复、未保存取消编辑无副本。
- [ ] 提交 `style: simplify secondary pages without hiding recovery`。

## Task 8：网页同步已有页面，保持本地数据边界

**Files:** Modify `web/src/ui/Today.tsx`, `Recipes.tsx`, `Calendar.tsx`, `Shopping.tsx`, `My.tsx`, `PersonalActions.tsx`, `styles.css`（均在 web/src/ui）；Create `web/test/meal-focus.test.tsx`, `web/e2e/meal-focus.spec.ts`; Regress `web/test/warm-ui-regressions.test.tsx`, `recipe-media.test.tsx`, `shopping-ui.test.tsx`。

**Interfaces:** 保留 TodayProps、现有选择/保存/记录回调签名，不更改 IndexedDB schema 或网络 transport。高级设置仅为 React 本地展开状态。无助手会话组件，不新增虚假入口。

- [ ] 写组件行为测试：有菜单设置收起仍可打开；重复当前餐次不清草稿；展开/收起不调用 onGenerate/onSettings；修改数字未应用时保存仍被阻止；存储只读时不开放写操作。运行 `npm --prefix web test -- --run test/meal-focus.test.tsx` 确认目标失败。
- [ ] 实现今天摘要与折叠设置、菜谱精简、购物来源/形态保留、我的分组；别删除当前8人以上确认、已选菜和备份/恢复入口。
- [ ] Playwright 用拦截的公开菜库夹具和临时浏览器上下文，分别在390/1280宽断言无横向页面溢出、底栏不盖最后项、折叠操作不丢数据；网络访问只允许本机。图片用本地夹具，真实图片源由原媒体测试覆盖。
- [ ] 运行 `npm --prefix web test -- --run`、`npm --prefix web run typecheck`、`npm --prefix web run boundaries`、`npm --prefix web run build`、`npm --prefix web run e2e -- e2e/meal-focus.spec.ts`；全部通过后提交 `feat: align web meal pages with focused miniapp experience`。

## Task 9：全页面原生验收、对照和交付

**Files:** Create `docs/testing/2026-10-15-meal-experience-acceptance.md`, `scripts/acceptance/meal-experience-cases.json`, `scripts/acceptance/meal-experience-native.cjs`; Modify `DEVELOPER.md` 仅追加最终事实。

**Interfaces:** cases JSON 为数组 `{id,page,viewport:{width,height},fontScale,state,assertions:string[]}`；runner 命令 `node scripts/acceptance/meal-experience-native.cjs --project <isolated-export> --output <outside-repo-dir>`。runner 必须校验隔离导出标记与回环API、拒绝正式项目/生产URL；沿用项目已安装的 miniprogram-automator，不静默安装或改安全设置。

- [ ] 以 app.json 注册页为准建立27页矩阵；每页至少正常/空或失败态，关键五页追加规格规定的宽度、字体、键盘、十道菜、长名、图错、未知结果及冲突。管理页用合成管理员，绝不线上改权限。
- [ ] 从最终源码导出全新隔离验收项目；先跑 `node --test tests/native-component-paths.test.js` 及导出 JSON 组件路径预检，再连接微信工具。组件缺失或工具未连通记阻塞，不宣称原生通过。
- [ ] runner逐项记录截图、控件边界与交互结果；320/390/430 × 1/1.3/2的关键页不能只留一张截图。保存实际尺寸和字体，禁止通过独立HTML复刻冒充实现。
- [ ] 运行 `powershell -ExecutionPolicy Bypass -File ./scripts/verify.ps1 -SkipModelServiceTests`，以及 `node --test tests/*.test.js`；网页复用任务8最终有效结果，若后来改到共享资源则重跑相关项。命令不支持glob时用PowerShell枚举tests下.test.js文件传入。
- [ ] 汇总四任务链路和页面缺口；按规格八个维度重评，与72分逐项对照。原生、浏览器、真机、真实模型、线上分别写清已测/未测；真机未执行不能给满分，也不宣称全功能生产可用。
- [ ] 更新开发者入口并提交 `docs: record focused meal experience acceptance`。本地代码验收完成后进入[计划B](2026-10-15-meal-feedback.md)，不自动推送或部署。

## 自审与交付状态

- [x] 核对现有路由、助手入口、卡片事件、token生成源和网页脚本。
- [x] 将报告的五项优化逐一映射：页面密度1–3；助手4–5；任务流6；统一样式与适配1、7–9；反馈另见B。
- [x] 五类 Review Focus 均有对应行为/交互验收；不以新增工具数量作为智能体验指标。
- [ ] 用户审阅此计划及计划B，选择当前会话执行或子agent逐任务执行。
- [ ] 任务1–9实施与验收完成。当前只完成计划，产品代码尚未改动。
