# 模型驱动 Agent 技术规范

版本：2.0.0

## 1. 全局规则加载

Runtime 每个任务加载 `agent.md`、`data-policy.md`、工具目录和规则版本。规则由开发者发布，运行时只读；任务记录 `policy_version` 和 `policy_hash`。

## 2. 任务模型

- `session_id`：连续对话。
- `task_id`：一次规划、查询、修改或解释任务。
- `parent_task_id`：引用上一任务。
- `plan_version`：当前任务方案版本。
- `idempotency_key`：同一客户端操作的稳定键。
- `preview_token`：确认写入时的服务器凭证。

同一会话只能有一个活动任务。重连和同一请求重试复用任务 ID；用户新输入、重新生成、换菜和修改人数创建新任务。

状态：`queued`、`understanding`、`querying`、`planning`、`validating`、`needs_input`、`awaiting_confirmation`、`completed`、`failed`、`cancelled`。

## 3. Runtime 限制

默认最多 8 轮模型工具循环、16 次工具调用、30 秒总时限；单工具失败最多重试一次；最终 JSON 最多修复一次。模型失败转规则降级，且保留用户输入和阶段事件。

## 4. 模型协议

模型请求包含全局规则、工具 JSON Schema、当前会话历史、授权用户上下文和已返回的工具结果。模型只能返回工具调用或最终 JSON，不输出自由格式操作指令。

最终 JSON 至少包含：`intent`、`need_clarification`、`reply`、`plan`、`actions`、`warnings`、`sources`。规划结果中的每个菜品必须带真实 `dish_id`；用户数据动作必须带 `requires_confirmation=true`。

## 5. 工具执行

Runtime 校验工具名称、参数类型、权限、调用次数和总时限。查询工具直接由服务端执行；转换工具可修改当前任务副本；写入工具没有确认上下文时必须拒绝。

工具结果发送给模型前应裁剪条数和字段。模型永远不获得 MySQL 连接、SQL 字符串或任意文件访问能力。

## 6. 结果校验

最终结果必须通过 JSON Schema、菜品来源、日期、餐次、人数、忌口、来源和动作白名单校验。失败时不得展示原始模型结果，优先补充查询，仍失败则降级或追问。
