# EatWhat 合并与后端接口/性能只读审查

日期：2026-10-14。代码基线：`2c7d810136942c6fb61fa1635c6b0af2cb870b87`。

本报告基于最终合并源码阅读、PR11 的 `60721c4..b534536` 差异、两项纯离线探针。未编辑产品源码、未访问生产、未连接真实数据库、未运行模型、未部署或压测。主审另行完成全量验证与 3 项 Chromium 回归，本报告不把这些转述为本审查独立执行。主审确认本地合并提交为 `2c7d810`。

## 结论

- PR11 三项修复没有发现新增阻断；可以与下面既有问题分开评价。
- 整体链路发现 1 项可确定的功能缺陷、1 项已由离线替身确认的事件循环阻塞、1 项代码可确定的数据库分页成本风险。
- 另有输入类型错误映射的较低优先级缺口，尚未通过 MockMvc 实际发请求验证。
- 无真实库执行计划、负载或运行服务测量，因此不能给吞吐量、P95/P99、容量、安全无漏洞或全面正确的保证。

## 1. P2：计划删除后的首次实吃记录陷入反复 409（既有功能缺陷）

定位：

- `backend/src/main/java/com/eatwhat/service/MealConsumptionService.java:89–92`
- `backend/src/main/java/com/eatwhat/mapper/RecipeRecordMapper.java:103–113`
- `utils/meal-workflow.js:14`
- `utils/meal-actual-entry.js:19,49,72`

触发：某日期/餐次先保存计划，然后删除计划；此餐尚无实际饮食记录；打开实际记录面板，手工填写吃过的菜并保存。

原因：计划使用软删除并递增版本。`slotRevisions` 返回删除后的非零版本，前端正确将其作为 `expectedPlanRevision` 发送；实际饮食服务仅从 `is_deleted=0` 的计划列表取计划，删除后得到 null，并在首次实吃写入时将其版本错误地视为 0。即使 `usePlan=false` 也进入冲突检查。重新读取仍拿到相同墓碑版本，无法解除冲突。

影响：用户正常删除计划后无法首次记录实际饮食；输入被保留，但“重新读取后再确认”会循环失败。不是数据丢失，也不是 PR11 引入。

离线探针：真实 `createMealActualEntry`，注入无网络 API，overview 为 `plans:[], consumptions:[], planRevisions:{'2026-10-06|dinner':2}`。保存、模拟 409、重新读取、再次保存，两次均发送：

```json
{"expectedPlanRevision":2,"expectedRevision":0,"usePlan":false}
```

最终 `inputRetained="外食面条"`、`needsReload=true`。后端拒绝原因由上述真实源码分支确定；未连接数据库执行后端服务。

建议：并发校验使用 `findSlot` 得到的槽位版本（包含墓碑），计划快照/按计划实吃仍使用活计划。补“删除计划→首次手工实吃”“读取后计划再次变化→409”“无计划历史→0版本可写”的服务回归。现有 `MealConsumptionServiceTest` 没有覆盖墓碑版本路径。

## 2. P2：旧同步聊天接口阻塞 Python 事件循环（既有性能缺陷）

定位：

- `recommend-service/main.py:82–85`：`async def chat_sync` 直接调用同步 `chat_handler.chat`。
- `recommend-service/chat_handler.py:172–193,205–209`：同步索引/检索及 `httpx.post(..., timeout=30)`。
- `backend/src/main/java/com/eatwhat/service/AiChatGateway.java:33–34,41`：Java 上游连接 5 秒、读取 30 秒。

触发：旧 `/chat/sync` 被调用，且检索或供应商 HTTP 请求尚未完成。不是新助手默认关闭导致的问题。当前小程序页面未发现 `sendChat` 调用点，但 Java/Python 旧接口仍存在，因此该问题的线上触发频率未确认。

影响：同步工作在 async 路由所在的事件循环线程执行，会延迟同一 worker 的其他异步工作，也可能影响健康响应/请求派发。Java 与供应商均使用约 30 秒读取期限，不能保证上游有余量接收 Python 降级结果。实际 worker 数和线上延迟没有测量。

纯离线验证：只从 `main.py` AST 提取真实 `chat_sync` 函数体，移除路由装饰器，注入 `chat_handler.chat` 替身。未导入应用、rag、配置、数据库、模型模块。替身同步暂停 120ms；另一个协程定时器计划 10ms 后触发，实际 120.32ms 才触发：

```json
{"probe":"real-chat-sync-route-event-loop-blocking","stub_block_ms":120,"ticker_due_ms":10,"ticker_observed_ms":120.32,"network":"none","application_imported":false}
```

建议：将路由改为同步 `def` 由框架线程池承接，或把整条调用链改为真正 await 的异步 I/O；同步检索仍需隔离执行。保留 Java 已有并发/频率控制，另行验证客户端超时与供应商截止时间的顺序，不用盲目增加重试解决。

## 3. P2：主菜库分页先全量加载完整候选（既有扩展性风险）

定位：

- `backend/src/main/java/com/eatwhat/controller/DishController.java:49–88`：小程序主列表入口。
- `backend/src/main/java/com/eatwhat/service/DishQueryService.java:40–47`：`Integer.MAX_VALUE` 取候选，再内存 `subList`。
- `backend/src/main/java/com/eatwhat/service/DishCandidateQueryService.java:42–56`：取完整 SQL 结果后再做排除条件过滤。
- `backend/src/main/java/com/eatwhat/mapper/DishMapper.java:126–155`：查询没有 `LIMIT`，包含 `STEPS`、`STEP_IMAGES`、用料等大字段。
- `backend/src/main/java/com/eatwhat/service/MealWorkspacePlanner.java:37–45`：规则候选也全量加载并排序，确认阶段再次校验同类候选。

触发：主列表按默认无条件查询，或系统菜库/个人菜数量增长；每次翻页重复查询。`pageSize<=100` 只约束响应条数，未约束数据库返回行数及 Java 分配。

影响：数据库传输、Java 内存/GC和筛选/排序成本随全部匹配菜数增长。不能据此断言当前线上已慢，不能把代码全量读取直接等同于已测得的 MySQL 全表扫描；实际索引选择需隔离数据的 EXPLAIN/测量。

建议：等价下推排除条件后用独立 count + SQL 分页；若复杂筛选难以下推，先以轻量 ID/筛选字段处理，最后仅批量读取本页完整内容。规则推荐可独立设计候选缓存/上限，不能随意截断破坏忌口和候选完整性。

已避免的误判：`/dishes/lite` 确有 SQL limit，公开网页目录也使用 count + SQL 分页；质量信息按最终页批量读取，不应把它们统称 N+1。`CatalogQueryPerformanceTest` 覆盖的正是这些已有优化，未证明主列表 SQL 分页。

## 4. P3：类型绑定错误可能被通用处理器映射为 500（静态确认路径，待 HTTP 回归）

定位：`DishController.java:59–60,216` 与 `GlobalExceptionHandler.java:30–65`。

触发：例如已认证请求 `/dishes?page=abc` 或 `/dishes/lite?limit=abc`。Spring 参数转换抛出类型不匹配异常，当前处理器没有专门映射该异常，而有 `@ExceptionHandler(Exception.class)` 返回 500。普通非法数字应作为 400 客户端输入错误。

影响：错误监控/重试分类不准确；不涉及越权或数据写入。本轮未用 MockMvc 发该请求，因此应在修复前补一条确切 HTTP 复现。

建议：为类型不匹配和相关绑定异常增加固定、安全的 400 响应，并覆盖列表分页和路径 ID 的非数字输入。

## PR11 三项复核

1. `web/src/ui/App.tsx:250–267` 对人数、餐次、槽位和素食的实际值判等；完全不变时不更新槽位、不写草稿。`Today.tsx:54` 在入口也挡住重复当前餐次。新增测试包含自定义 slot、模板 slot、锁定与未锁定及重开仓库。
2. `web/src/ui/Shopping.tsx:14–16,40` 在显示和表单标签中补充形态/部位，保存仍按不可混淆的 item.key。未修改计算、合并身份、持久化结构。
3. `web/src/ui/components.tsx:6–10` 统一对象类型名，`My.tsx:27` 和 `PersonalActions.tsx:131` 复用。原恢复唯一键冲突、确认和取消路径未变。

未发现 PR11 新增 P1/P2，也未发现需要撤销合并的理由。上述全局问题均来自 PR11 范围外既有代码。

## 实际审查覆盖与已有边界

- 认证入口：`WebMvcConfig`、`AuthInterceptor`、`TokenService`、`AdminAuthorizationService`。已观察 HMAC 校验、过期和禁用账号检查；私人路由注册认证，助手/聊天可选认证由具体写入口再拦截。
- 私人菜谱：`CustomDishService`、`PersonalDishMapper`、`PersonalRecipeWrites`。按服务端用户识别所有权；SQL 限定 owner；编辑/复制使用内容版本与幂等收据，锁定读。未发现这条路径的明确跨用户写入问题。
- 当前餐/日历/实吃：`MealWorkspaceService`、`MealPlanService`、`MealConsumptionService`、相关 mapper 和前端恢复 store。工作区确认重新校验菜品归属和方案版本；原 requestId 查询恢复，未知结果不静默换请求。发现第 1 项墓碑版本不一致。
- 旧助手确认：`AssistantController` 与 Python 路由。Java 重建用户身份，确认字段严格白名单，验证动作类型/版本/凭证/幂等键后才调用 Java 写服务。Python 旧路由主要依赖回环服务拓扑；内部 V4 路由另有非空服务令牌。未复核当前线上监听和反向代理配置，不能评价实时暴露范围。
- 新助手边界：`AssistantV4Controller`、`AssistantCapabilityService`、`AssistantV4TurnService`、`AssistantV4Store`、`AssistantV4ModelGateway`。观察到显式登录、能力注册、受限工具及来源校验、2 工作者+16 队列、最多每批4/总8次读取、HTTP最多2线程、单请求期限和禁止业务事务内调用模型。源码默认关闭是既定发布策略。
- 主餐后台任务：`MealWorkspaceTaskRunner`、`MealWorkspaceMapper`。2 工作者+8队列、每次最多8任务、租约条件认领；不是无界线程池。没有对峰值队列等待、租约重抢和长任务做真实负载验证。
- 查询与数据：主列表、轻量预加载、公开目录、质量批量关联、计划软删除版本、迁移索引声明。未执行实际数据库 EXPLAIN，没有将迁移声明当作线上索引已安装的证据。
- 配置/部署：`application.yml.example`、`utils/config.js`、`backend/deploy.sh`。秘密用环境变量，旧 deploy.sh 主动拒绝执行，小程序源 API 为线上地址是已知配置。本轮没有改配置、触碰生产或将本机服务运行等同于线上版本验收。

## 验证缺口与维护性判断

建议优先补第 1 项跨服务契约回归；随后在隔离库用真实代表性数据测量主列表和规则推荐查询计划/分配成本，再评估并发目标。旧同步聊天可用无供应商测试验证健康请求不被阻塞；不需要真实模型才能修复调度方式。

鉴权和幂等设计已有较完整的服务端边界与离线覆盖；维护成本集中在新旧助手并行、不同前端的数据域、各服务重复实现的版本/身份契约以及部分大体量、压缩排版文件。第 1 项说明单服务测试全绿并不能代替前后端字段语义一致性测试。建议维护性主观 7/10、状态恢复/数据保护设计 8/10、可扩展性能准备 6/10；这些是基于本次静态审查的解释性评分，不是生产 SLA 或实测性能分数，也不覆盖视觉评分。
