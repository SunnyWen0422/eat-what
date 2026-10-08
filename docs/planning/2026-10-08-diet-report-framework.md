# 实际饮食报告框架（第一版）

## 入口与范围

- 页面：`pages/statistics/statistics`，周/月回顾。
- 跨页面入口：`/pages/statistics/statistics?period=week&anchor=YYYY-MM-DD`；日期严格校验，`onShow` 仅重新读取，不改所选周期。`period=month` 同样支持。
- 数据接口：已存在的 `GET /api/diet-reviews?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`。身份取认证上下文，不接收客户端用户 ID；日期范围沿用 367 天以内的限制。
- 使用已有 `meal_consumption`、日历计划和确认时保存的快照；无新增报告表、迁移或外部模型依赖。
- 客户端每次报告读取附带递增 `readSequence`，避开通用客户端对同 URL 未完成请求的去重，防止更正实际记录后重用旧响应；其他 API 去重不变。服务端每次计算并返回 `Cache-Control: no-store`。这不是历史报告档案，不能凭报告编号找回已被更正的旧数据。

## 响应契约

保留原有平铺统计字段与 `consumptions`，新增：

- `metadata`：`reportId`、`startDate`、`endDate`、`timezone`、`generatedAt`、`executionAsOfDate`、`sourceFingerprint`、`calculationVersion`、`basis`、`persisted`。
- 固定 `timezone=Asia/Shanghai`、`calculationVersion=actual-diet-v1`、`basis=explicit_eaten`、`persisted=false`。
- `sourceFingerprint` 为规范化源记录 SHA-256。对象属性与查询返回行序不影响指纹；实际内容/状态/修订、计划修订及快照变化会影响它。
- `reportId` 为账户、周期、时区、执行截止日、来源指纹、计算版本的内容身份。生成时间不参与身份，因此同一天同一来源重新读取可得到相同编号和新的生成时间。跨上海日期会重新计算执行范围与缺失天数。

`blocks` 固定为六块：

1. `overview`：明确吃过的餐次、实际记录天数、已知菜品种类、菜品条目和逐日次数。
2. `actualDetails.records`：仅 `status=eaten` 的实际快照，带源记录 ID、修订、日期、餐次及 `sourceUrl`。链接进入日历详情的对应餐次。
3. `frequentDishes.dishes`：按已知 `dishId` 排序的出现餐次数；同菜同餐只计一次；自由填写不猜测菜品身份。
4. `categoryCounts`：分类次数与未分类条目，分母仅为已有实际菜品条目，绝不是营养比例。
5. `planExecution`：昨日及以前的明确手动计划，以及已确认实际记录内保存的手动计划快照；保留已删除计划的确认依据。计划未确认不计为未吃/取消，今天与未来计划不计入到期数。
6. `completeness`：截至今天的可观察日期数、无实际记录行的天数、明确取消/撤销为未记录的状态数、自由填写/未分类条目、已吃但菜品明细为空的餐次。无每日三餐假设、无完成率、无营养评分或热量估计。

## 展示与失效

零实际餐次时仍显示六块，明确展示计划未确认和记录缺失。实际分布条长相对该周期的最高记录次数，文案注明不是完成率。报告周期不匹配、缺少实际依据时拒绝展示；新周期、账户切换、晚到响应/错误及页面卸载均不能覆盖当前结果。原始快照中的自由文字始终保留。

## 旧统计接口兼容

`GET /api/recipe-records/statistics` 保持原有计划计数及字段名称，不偷偷改成实吃数字；新增 `basis=plan`、`deprecated=true` 和边界说明。`statistics.totalCalories` 由误导性的占位 `0` 改为 `null`，表示未知。仓库运行页面已使用 `/diet-reviews`，旧 `getStatistics` 仅保留 API 导出。外部旧客户端若将 `totalCalories` 视为必定非空，必须适配；不能把 `null` 转成零摄入。

## 验证边界

新增与既有实际领域 JUnit 通过命名列表运行，不运行默认 Java suite、模型服务或模型相邻测试。Node 覆盖六块空态、周期入口、日分布、未知菜名、原记录链接、错周期、账户/请求/卸载竞争。样式修改来自 `design/wxss/pages/statistics/statistics.tpl` 并通过仓库生成函数核对。

未进行真实数据库查询、生产服务访问、模型调用、迁移、发布、微信官方编译或真机验收。Mock/源级界面测试不能替代真实历史数据和原生交互验收。


## 完整轮次验证

本文件的测试说明是报告子模块的开发检查。整个修复轮次的集成验证、发布状态及一次早期 Java 默认套件的范围偏差，统一见[最终验证摘要](../testing/2026-10-08-product-foundations-results.md)。
