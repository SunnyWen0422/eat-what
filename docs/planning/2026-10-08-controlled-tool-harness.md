# Java 受控工具执行基础（2026-10-08）

## 已接入边界

本轮新增 Java 白名单工具合同与持久任务执行器；不替换 Python 的需求理解、方案生成或模型 Runtime。自然语言自动选择这些新 Java 工具尚未接入，不把它描述为已可用的 Agent 能力。

三个真实工具：

- `read_current_meal`：按认证账号、日期和餐次读取当前工作区、计划与实际记录。
- `confirm_current_meal`：保存服务器预览绑定的当前餐计划，沿用 `MealWorkspaceService.mutate(..., "confirm", ...)` 的所有权、菜品来源、限制、版本和领域回执验证。
- `read_actual_diet_review`：调用 `MealConsumptionService.review` 读取真实实际用餐回顾。保存计划不会调用实际用餐写入，也不会凭空增加实际餐次。

一次任务最多三个步骤，最多一次计划写入。工具名、对象字段、字符串类型、日期范围和餐次全部在 Java 明确校验。工具参数没有用户 ID、任意 SQL、模型自报执行结果或开放式服务名。

## HTTP 合同

全部路由在 `/assistant/tool-tasks`，与现有 `meal-workspace.enabled` 开关一致。关闭时返回 404；未认证时返回 401。普通 `/diet-reviews` 不受这个新增路由开关影响。

- `GET /tools`：已实现工具和参数 schema。
- `POST /preview`：仅接受 `requestId` 与 `steps`；步骤仅接受 `tool` 与 `arguments`。
- `GET /{id}`：读取当前账号拥有的完整任务。
- `GET /by-request/{requestId}`：查询未知预览结果对应的原任务；不存在时返回空。
- `POST /{id}/confirm`：仅接受 `previewToken`。拒绝替换步骤、身份、目标、版本或载荷。重复确认同一任务也用于恢复未完成步骤。

组合请求示例：

```json
{
  "requestId": "tools-example-1",
  "steps": [
    {"tool": "confirm_current_meal", "arguments": {"date": "2026-10-08", "mealType": "lunch"}},
    {"tool": "read_actual_diet_review", "arguments": {"startDate": "2026-10-05", "endDate": "2026-10-11"}}
  ]
}
```

预览由服务器读取当前工作区，保存目标、工作区 revision、planVersion、目标 planRevision、人数、菜品快照、被替换安排和内容哈希。`summary` 是确认弹窗的展示文本。生成中、待重新生成、条件/文字限制未校验的方案不能预览。

预览在十分钟内允许开始/重试尚未完成的计划写入。确认前在与领域服务共用的用户行锁内重新读取绑定内容，旧版本或内容变化必须重新预览。已经保存计划后的报告重试不受原预览超时影响。

## 持久性与部分失败

`controlled_tool_task` 持久保存原请求哈希、预览和每步真实结果。`user_id + request_id` 唯一；同键同请求回放原任务，同键不同请求拒绝。

每步使用独立事务。计划保存与该步完成回执在同一个事务提交，内部领域请求 ID 固定为 `harness-{taskId}-{stepIndex}`。后续回顾失败时保留已提交计划及回执，任务返回 `partial_failed`，不会伪称整个任务完成；恢复只执行尚未成功的步骤。

结果状态包括 `awaiting_confirmation`、`running`、`completed`、`partial_failed`、`failed`；`retryable` 表示是否可继续原任务，`errorCode` 区分过期、版本冲突、参数错误和临时执行错误。数据库不可用导致无法确认回执时，让客户端保留未知结果并查询原任务，不能新建一次保存。

新增迁移文件 `backend/db/migrations/V6_20__controlled_harness.sql` 以追加方式建表并登记迁移记录，已加入中央 manifest；本轮没有执行迁移。应用该迁移前不能宣称新增接口已可用。任务与回执不做自动删除，避免清理后把重试当作新写入。

## 小程序调用

`utils/controlled-harness.js` 导出 `createControlledHarness({ current })`，提供 `run({date, mealType, startDate, endDate})`、`recover()`、`state()`、`dispose()`。

页面应在已同步、无待处理写入、可确认的工作区调用 `run`，并用 `current` 绑定页面存活状态、账号、store 和日期餐次；切换目标或卸载时 dispose。utility 使用服务器 `summary` 打开 `wx.showModal`，只在用户确认后提交保存的 token。

状态包含 `status/taskId/requestId/task/report/message/retryable/target`。本地 `unknown` 表示传输结果不明；恢复首先查询原 taskId，若预览响应丢失则查询原 requestId，只有证明原任务不存在才重发相同预览请求。原任务未解决时不会换目标创建新保存。账号切换后丢弃迟到响应，也不会触发确认或覆盖新账号状态。

## 本子模块开发验证与限制

以下仅描述该子模块开发时的定向检查；整个修复轮次的集成结果和一次早期 Java 测试范围偏差见[最终验证摘要](../testing/2026-10-08-product-foundations-results.md)。

定名测试：

```sh
mvn -f backend/pom.xml -Dtest=ControlledToolHarnessServiceTest,ControlledToolHarnessControllerTest test
node --test tests/controlled-harness.test.js
```

覆盖工具/字段/身份拒绝、所有权、失效版本和内容、预览过期、V4 开关、计划与实际分离、重复键、进程重建后的部分失败恢复，以及回执保存失败时事务回滚与固定领域请求 ID。回滚测试使用受控测试事务管理器和内存 mapper，不替代真实 MySQL 事务测试。

本子模块开发阶段执行上述纯 Java 领域测试和 Node 文件；之后还运行了工作区页面的联合检查。未运行 Python、模型服务、真实/模拟模型相邻测试、数据库服务或迁移，也未进行微信原生/真机验收、部署、推送或合并。
