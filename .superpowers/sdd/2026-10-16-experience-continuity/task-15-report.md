# E15 · 分段等待观测实施与验证

2026-10-17；基线 `f45b9b2d995aad75227d05e4d5353b12e8f50d3f`。本任务代码候选已完成、定向离线验证通过；真实服务等待、原生可见反馈和真机验收 **not-run**。没有生产、数据库、真实供应商、推送或发布操作。冻结简报中的 planned 是历史计划状态，不是本报告的执行事实。

## 真实调用点与指标口径

Java 使用现有 Micrometer `eatwhat.experience.duration` Timer 与 `eatwhat.experience.items` Summary，仅有固定 `stage/outcome` 两个标签。

| 阶段 | 接入位置 | 时间与计数含义 |
| --- | --- | --- |
| `candidate_scan` | `DishCandidateQueryService` 普通分页 count SQL、复杂排除事实批次、推荐事实批次 | 每次真实 mapper 读取耗时；事实批次计实际返回事实行数，含随后被排除的行。count SQL 只记耗时，items=0，不伪称数据库物理扫描行数。空批次也记录。 |
| `candidate_details` | 同服务的普通详情分页与按选中 ID 读取详情 | 每次真实详情 mapper 读取耗时与返回行数；没有扩大分页、排序、校验或缓存范围。 |
| `assistant_queue` | `AssistantV4TurnService.runTurn` 和 `MealWorkspaceTaskRunner.execute` 成功 claim 后 | 从持久化创建时间至成功 claim 返回；不是 claim→claim。V4 复用 long createdAt，本餐任务读取既有 created_at；没有新表/字段。恢复 running lease 不重记首次队列等待，失败 claim 不记样本。 |
| `task_execution` | 同两类 worker 的 try/finally | 成功 claim 返回至本次处理结束，含完成结果持久化；每次成功 claim 尝试一次上报。取消/丢弃结果为 cancel，running 恢复或受约束规则回退为 recover。 |
| `model_http` | `AssistantV4ModelGateway.step` 实际提交 Future 至解析结果/失败并取消未完成 Future | **Java→Python 整个调用包络**，含排队/传输/Python 准备/供应商处理/回传/解析。不是纯供应商时间；每次 HTTP 尝试 items=1。嵌套 SocketTimeoutException/TimeoutException 使用固定 timeout。 |
| `confirmation` | `MealWorkspaceService.mutate(confirm)`、当前 V4 `ShoppingAssistantToolAdapter.add`、legacy `AssistantActionService.execute` | 当前餐直接保存和 V4 calendar 共用 workspace 确认；V4 shopping 走现有 harness 事务；legacy 保留原 @Transactional。实际影响单位分别为菜品/食材/餐次数，不跨这些单位相加解释。 |

Python `assistant_v4_provider.py` 在同步入口和 FastAPI lifespan 使用的 `ManagedV4Provider` 都记录固定 `stage=provider_http` 日志，包含固定 outcome、duration_ms、count=1。它测 **Python 供应商适配器 HTTP 生命周期**，独立于 Java 网关；不是额外一轮模型调用。同步入口包含原有 asyncio/client 收尾，异步入口保留共享客户端和 active 集合。日志通过现有应用 logging 配置采集，没有正文、工具参数、模型名称、URL、身份、请求编号、供应商错误或密钥标签。

所有新结果只输出 `success/error/timeout/cancel/recover`。旧固定调用值兼容映射为 failed/rejected/unknown/busy→error、cancelled→cancel、degraded→recover；其他值和动态 stage 继续拒绝。保留 request/quality/media 原固定 stage，避免既有质量降级路径被新白名单破坏。

## 事务、安全与行为保留

- 成功确认只有真实提交以后才上报：已有外层事务时注册 afterCompletion；workspace 自己拥有 TransactionTemplate 时等待 execute 成功返回。提交异常、外层回滚、未知提交状态均不会记 success。没有改变事务边界、锁、幂等回执、版本、归属或确认校验。
- 指标注册、Timer、Summary、观测 sink 和 Python logging handler 的 RuntimeException/Exception 均不能改变业务结果。业务异常仍沿原路径传播；没有新增重试。指标是尽力上报，不提供跨进程崩溃/导出失败的 exactly-once 持久保证。
- 本餐 finish 只把已完成事务的本地 task status 反馈给原 worker，识别被取消/替代后丢弃的结果；没有额外数据库读取或写入。createdAt 对 Jackson 隐藏，既有 task HTTP 形状保留。时间精度依从既有 created_at，不把毫秒单位宣称为新增的亚秒入队精度。
- 保留 bounded executor、队列满处理、scheduled 去重清理、Future 取消、硬 deadline、provider active 清理、生命周期和资源关闭。E10/E14 原请求恢复及 E11 授权事实格式化代码没有改动；相关 V4/保存回归保持通过。
- 机器清单 E15 责任项为 **K29**：当前 V4 优先，旧同步逻辑不扩展到 V4；普通分页、复杂排除与 legacy 兼容只做观测及回归。没有领取其他任务的 Review Focus 工作，没有做 E16 的性能优化、模式/依赖升级或数据库改动。

## RED、修正与 GREEN

证据目录：`C:/Users/Administrator/Documents/Codex/2026-07-18/d-eatwhat/work/experience-continuity-plan-20261016/worker-task15-evidence/`。

首次 Java RED：指定三类共 13 例，既有 9 例通过；新增 4 例出现 1 failure/3 errors。registry 抛错改变结果、新固定 outcome/task_execution 被拒绝、候选调用点缺 metrics 注入是实际缺失合同。首个队列测试同时发现复用了已注册 executor 的测试 registry，这一项是测试夹具错误，**不作为产品 RED 证据**；已改为独立 registry。Python 首次 3 例均因缺少实际供应商阶段入口报错，保存在 `python-red.log`。

另在仓库外 `worker-task15-red-baseline/` 解出不可变 BASE，仅加入 queue-only 离线测试并用独立 `worker-task15-red-replay-build/` 重放。它先确认真实基线 worker 已完成且去重有效，再断言生产调用点应产生 assistant_queue，缺失阶段即为具名 RED；见 `java-queue-baseline-red.log`。没有在正式仓库回退或改写源码。

该重放实测 **1 test / 1 assertion failure / 0 errors / 0 skipped，BUILD FAILURE**，断言为 `actual baseline production queue emits no stage ==> expected: not <null>`；因此队列 RED 不依赖最初错误的 fixture 注册方式。

最终 GREEN 覆盖三项指定命名场景：

| 场景 | 实际断言 |
| --- | --- |
| queue delay is separate from execution duration | 真实 V4 worker + 可控 clock + 持久化 store 替身：队列 800ms，执行 200ms；重复 enqueue/失去 claim 不多记。本餐 queued 创建时间→claim 为 600ms，执行 150ms；running 恢复没有 queue 样本，execution 为 recover。 |
| instrumentation failures cannot fail a valid response | registry 抛错；实际候选读取、V4 queue/execution、网关响应、workspace 保存/原回执重放、shopping 保存及回执，在 sink 抛错时仍有效。legacy 使用真实 Spring 事务拦截器，提交前无成功、提交失败只有 error。 |
| metrics labels cannot contain private values | Java meter 标签只有固定集合；兼容旧固定结果；拒绝私有 stage/outcome；Python 真实日志断言无 synthetic private prompt/body，超时/取消各一次，不重试；日志 handler 失败仍能返回。 |

中间两个 Java 测试断言修正分别是回执 JSON 重放的 Integer/Long Java 类型差异，以及测试重复使用已消耗绝对 deadline 的 StepInput；均保持真实契约，不修改业务行为绕过测试。

## 最终验证命令与结果

所有命令在正式 `project/` 中运行；先 dot-source `../work/experience-continuity-plan-20261016/verification_env.ps1`。Maven 使用 `-o`、`-Dmaven.repo.local=../.m2` 与全新仓库外 `-Deatwhat.build.directory=C:/Users/Administrator/Documents/Codex/2026-07-18/d-eatwhat/work/experience-continuity-plan-20261016/worker-task15-final-build`，避免历史 JaCoCo 数据。测试入口均先检查：Java 是 mapper/事务替身和 MockRestServiceServer/RestTemplate mock；Python isolated_service 禁止 DB/DNS/外部连接、替换 config，不读取 .env。没有启动服务或访问真实供应商。

| 命令/范围 | 结果 | 日志 |
| --- | --- | --- |
| `mvn -f backend/pom.xml -Dtest=ExperienceStageInstrumentationTest,ExperienceErrorContractTest,AssistantV4ModelGatewayTest,AssistantActionServiceTest,AssistantV4TurnServiceTest,AssistantCalendarActionTest,AssistantShoppingPreviewTest,WorkspaceTargetSaveTest,MealWorkspaceFallbackTest,CandidateScanEquivalenceTest,WorkspaceTaskCancellationTest test`（加上述隔离参数） | **160 passed，0 failed/error/skipped，exit 0** | `java-final.log` + final-build/surefire-reports |
| `mvn -f backend/pom.xml -DskipTests package`（同隔离参数） | BUILD SUCCESS，exit 0 | `java-package.log` |
| `python -m unittest discover -s tests -p test_experience_provider_metrics.py` | **5 passed，exit 0** | `python-final.log` |
| `python -m unittest discover -s tests -p test_provider_lifecycle.py` | **11 passed，exit 0** | `python-lifecycle.log` |
| `python -m unittest discover -s tests -p test_workspace_model_transport.py` | **2 passed，exit 0** | `python-transport.log` |
| Python compile(source) of provider + new tests（不 import） | 2 files compiled，exit 0 | `python-compilation.log` |
| `node --test tests/experience-save-target.test.js` | **22 passed，0 skipped，exit 0** | `node-save-target.log` |
| `git diff --check` | exit 0 | 执行记录 |

Java 数量明细：新阶段测试 13，安全错误合同 4，网关 5，legacy 确认 25，V4 turn 49，calendar 11，shopping 32，目标保存 9，回退 3，候选等价 5，取消 4，共 160。Python 共 18，Node 共 22。未运行全量 Java、DB IT 或 scripts/verify.ps1 总入口；按本轮分工，聚合验收留 E20。没有因消息切换重跑未变的小程序/网页全包或全浏览器矩阵。

Python final 日志还包含 asyncio debug 的 `Task ... test_metrics_failure_preserves_response_and_releases_capacity ... took 0.500 seconds` 诊断。该 case 的 mock client 立即返回，**没有有意的 sleep 或 0.500s mock 延迟**；测试上下文会执行隔离导入/初始化，但此次未做 profiling，不能精确归因这段调度占用。它没有导致测试失败，却意味着日志并非完全无诊断输出；不能据此推断真实 HTTP/供应商延迟。11 项 lifecycle 回归另有既有 0.5s 的故意供应商时限测试，两者不混称。

## 用户等待的本地记录与真实验证限制

新增测量使用真实页面 handler/store，HTTP 边界为明确的 20ms gate 替身；不运行服务。最终样本：tap→**setData 状态反馈** 0.198ms，tap→结果可用 29.1621ms。较早独立样本为 0.1347/35.547ms，只用于核对测量分段存在，不是性能比较或 p95。

`tapToVisibleFeedbackMs=null`、`nativeDisplay=not-run`。Node VM 不能证明像素已绘制，因此没有把状态反馈当作真实可见反馈；也没有把 mock gate 当作后端耗时。微信原生渲染/物理设备的 tap→可见反馈→真实结果 **not-run**；当前没有真实后端分段分布或用户样本，不能据此宣布最大瓶颈、达成性能门槛或推断真实服务链路质量。E16 必须采集合适的真实/明确隔离环境数据再选唯一瓶颈。

## 源码、配置、数据与构建指纹

完整文件清单、每项 SHA256、测试计数和日志 SHA256：仓库外 `worker-task15-evidence/worker-task15-fingerprints.json`。其 sourceFingerprint 只包含本任务 15 个源码/测试文件，不包含本报告自身。

- 源码/测试聚合 SHA256：`2da1599e99754d5d377ec3f6c33a2116dbc68fc1fc15fe60b6f45307c076d97c`。
- 合成 fixture 聚合 SHA256：`f38143ba59f8d0005e3b5f06b6e0e433086865d1d7833f18e8f2431ca26658fa`。包括 V4 store/turn、目标保存、calendar、shopping fixture；数据均为代码中静态合成输入，没有数据库快照/用户记录。
- `backend/pom.xml` SHA256：`a3148a1e94af5521ae89d759c71a8780c9366c09eb4d0c4718d40d37ff6ebea0`。
- Java 配置模板 SHA256：`e22af2062888542bae04f7b90632cee502ce9cd68133db3a1d164a17eec41aaa`；Python `.env.example` 模板：`fea45eaaa926076a873416f1ad615a2ceb76c9d7e3c6fa3e160d94da026cdefc`。没有读取私有配置或供应商凭据。
- 环境脚本 SHA256：`d0da3f1d5095448319ff427927e4324a3ccf7fe877b52a38bc0d433728f70923`；Windows / Node 24.15.0 / Python 3.12 / Maven 3.9.11 / JDK 21.0.4；读取最终 ExperienceMetrics.class major **52（Java 8）**。
- 独立 JAR：`C:/Users/Administrator/Documents/Codex/2026-07-18/d-eatwhat/work/experience-continuity-plan-20261016/worker-task15-final-build/eatwhat-backend-1.0.0.jar`；32,800,559 bytes；SHA256 `2ddb7b1fa8a8991e0edc2bfb899a53c16c1f4053fb5dcfd08a4e493cd925111c`。只生成本地包，没有运行或部署。

## 自审与交付

已对照完整 task-15-brief、E15 机器条目和 K29 自审：阶段由真实生产方法触发；队列与执行分开；Java 网关与 Python provider 分开；固定标签与兼容映射无私人维度；提交后成功、取消/回退、失败开放与资源行为有对应测试。未引入新依赖、数据库迁移、并发/重试扩容或盲目性能修改。

仅暂存本任务源码、测试与本报告，形成一个本地可审阅提交；独立全差异审阅由根控制器执行。真实服务/原生/真机测量尚未验收，不能把本地候选当作发布完成。
