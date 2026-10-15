# 有明确作用范围的用餐反馈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户用已有可靠操作表达保留、想换和省时，并明确区分本餐调整与长期偏好。

**Architecture:** 复用当前 workspace 的锁定/替换/用时设置和现有 UserPreference API，不新建学习表或模型工具。反馈只是可理解的动作入口；不虚构自动学习或永久排除单菜的能力。计划A验收后再执行。

**Tech Stack:** 微信小程序 CommonJS/WXML/WXSS、node:test；现有 Java UserPreferenceController/Service（只读核对，本轮不修改）。网页只有既有锁定/替换与偏好界面，不新增助手。

**Spec:** [实施规格](../specs/2026-10-15-meal-experience-refinement.md)，尤其“后续反馈的范围”；依赖[计划A](2026-10-15-meal-experience-refinement.md)最终提交。

## Global Constraints

- 不支持单菜永久黑名单，因此不显示“永不推荐这道菜”按钮。
- 整餐总时长不得直接写成每道菜上限。首次选择省时不猜分钟数。
- 本餐反馈不调用长期偏好API；用户主动进入并保存偏好后才写入，失败不显示成功。
- 保留原锁定/替换的硬约束、忙状态、版本和撤销；新入口不能绕过禁用状态。
- 不改数据库、不访问生产、不调用真实模型，不新增采集或第三方分析。
- 延续A/F、44px点击区、原图片、四导航与所有账户隔离规则。

## Review Focus

1. “想换”被误解为永久排除或立即删菜：任务B1，菜单未成功替换前保留。
2. 双击、已锁定、生成中和未知结果触发重复命令：任务B1。
3. 整餐用时被写入每道菜偏好：任务B2，不做自动映射。
4. 偏好保存失败或切换账户后提示另一账户成功：任务B2。
5. 助手把用户一次操作解释成永久忌口：任务B3，既有上下文与偏好快照不变。

## Task B1：本餐反馈复用原命令

**Files:** Create `utils/meal-feedback.js`, `tests/meal-feedback.test.js`; Modify `components/compact-dish-row/index.{js,wxml,wxss}`, `utils/meal-workspace-page.js`, `templates/meal-workspace.wxml`。

**Interfaces:** `feedbackAction({kind,dishId,busy,locked}):{action:'keep'|'release'|'replace'|'open_time'|'none',dishId?:number}`；kind仅 keep/change/quicker，dishId必须正整数；busy返回none，locked时change返回none，keep对已锁定返回release。component发出 `feedback` 事件 `{kind,dishId}`，页面 `onDishFeedback(event):void` 经当前草稿核对 dishId/locked 后转到原 `onKeep({currentTarget:{dataset:{id,locked}}})`、`onReplace({detail:{id}})`、`onOpenMealSettings()`，不直接调api。

- [ ] 编写测试 `feedback_respects_scope_and_busy`：keep→keep、已锁keep→release、change→replace、quicker→open_time；非法ID/未知kind/busy→none；锁定时不换菜。核心断言如下；运行 `node --test tests/meal-feedback.test.js` 确认失败。

```js
assert.equal(feedbackAction({kind:'keep',dishId:7,busy:false,locked:false}).action,'keep')
assert.equal(feedbackAction({kind:'keep',dishId:7,busy:false,locked:true}).action,'release')
assert.equal(feedbackAction({kind:'change',dishId:7,busy:false,locked:true}).action,'none')
assert.equal(feedbackAction({kind:'quicker',dishId:7,busy:true,locked:false}).action,'none')
```
- [ ] 实现纯函数和菜单：主按钮“换一道”保留，更多菜单显示“这餐保留/取消保留”“这次想换”“这餐想省时”；通过原handlers执行，时间入口打开现有设置，不改值、不自动生成。
- [ ] 页面夹具验证两次快速点击仍走原busy保护；失败保留原菜单，成功后有原撤销入口；断言 `updateUserPreferences` 调用次数为0。
- [ ] 运行新测试、`node --test tests/meal-workspace.test.js tests/experience-actions.test.js tests/experience-composition.test.js`，提交 `feat: expose meal-scoped feedback through existing actions`。

## Task B2：长期偏好显式入口与反馈

**Files:** Modify `pages/settings/settings.{js,wxml}`, `utils/preference-store.js`（仅必要失败反馈修正）, `templates/meal-workspace.wxml`, `utils/meal-workspace-page.js`; Create `tests/meal-feedback-preference-scope.test.js`; Regress `tests/preference-scope.test.js`。

**Interfaces:** 复用 `createPreferenceStore().save(value):Promise<{preferences,synced:boolean,error?,accountChanged?:boolean}>` 与 `api.updateUserPreferences(preferences)`，不更改字段定义。新增 `onOpenLongTermPreferences():void` 只导航 `/pages/settings/settings`；未保存的本餐编辑先走原flush/recovery，失败不跳转。

- [ ] 编写测试：进入设置前本餐省时不写maxCookMinutes；保存整餐总分钟数不调用偏好save；设置页主动保存才写一次，失败显示未同步并保留输入，换账户迟到响应不更新新页面。
- [ ] 在本餐更多操作中新增“长期口味偏好”；设置页只用现有字段并明确“每道菜用时上限”。不提供从刚才反馈自动勾好的长期忌口；不写虚假“助手已记住”。
- [ ] 实现并运行 `node --test tests/meal-feedback-preference-scope.test.js tests/preference-scope.test.js tests/account-boundaries.test.js`；正常保存、拒绝保存、离线三态人工核对，提交 `feat: distinguish current meal changes from saved preferences`。

## Task B3：验证上下文、全流程与限制

**Files:** Create `docs/testing/2026-10-15-meal-feedback-acceptance.md`; Test `tests/assistant-conversation.test.js`, `tests/experience-journeys.test.js`, `tests/meal-feedback.test.js`, `tests/meal-feedback-preference-scope.test.js`。

**Interfaces:** 不改变8个读取工具或3类动作，不改变 AssistantV4ContextService payload；只比较反馈前后原context与已保存preferences的事实。

- [ ] 在离线夹具中验证“这次想换→新菜单→发送给助手”的长期偏好快照不变；“省时→用户输入具体分钟→生成”只改变workspace.totalCookMinutes。不是供应商模型验证，不宣称模型永不误解。
- [ ] 原生验证长菜名的更多菜单、忙状态、撤销、取消省时设置和返回；网页只回归既有锁定/替换/偏好，不增加本轮不存在的入口。
- [ ] 运行上述4项Node回归及 `powershell -ExecutionPolicy Bypass -File ./scripts/verify.ps1 -SkipModelServiceTests`；记录未执行真实模型/真机/线上及未提供单菜永久黑名单。
- [ ] 把A与B结果合并到现状报告，但分别记录源码SHA和验收范围；提交 `docs: verify meal feedback scope and context boundaries`。不自动上线。

## 自审与状态

- [x] 明确本轮可复用的字段与操作；移除未有接口支撑的永久单菜黑名单承诺。
- [x] 五类失败模式均有对应测试，不把接口存在等同于模型可靠调用。
- [ ] 计划审阅通过且A验收完成。
- [ ] B1–B3实施完成。当前未实施。
