# 新助手隔离验收

合同为 `assistant.v4.1`。新助手使用已有 V4 本餐工作区；Java 持有身份、版本、状态和写入，Python 只解释一轮模型输出。保存日历与采购分别预览、分别确认，保存计划不记为已吃。发布默认 `ASSISTANT_V4_ENABLED=false`，既有 V4 工作区开关不变。

固定中文场景在 `tests/fixtures/assistant-v4-evaluation.jsonl`：生成 8、指代／调整 8、日期／保存 8、采购 6、只读查询 4、歧义／拒绝／恢复 6。每个场景由 `scripts/assistant_v4_acceptance.py` 执行实际 HTTP、读取实际工作区和 SQL 业务状态；模型仅返回脚本化 completion 帧，不替代 Java 工具或数据库。

夹具的菜品编号是逻辑编号。运行时按已知合成名称严格查找真实 ID，保留 V4 迁移原有的六道早餐与初始化追加的十道菜，不假定十道菜从 ID 1 开始；额外三道验收菜只使用新的 ID，不覆盖原菜。

## 三种证据不可互相替代

1. `test_assistant_v4_http_flow.py` 默认执行无网络保护和预算测试；真实 HTTP 测试明确 SKIP。`verify.ps1 -Offline -SkipModelServiceTests` 仍发现并执行这些新助手 mock 测试。
2. 显式启动真实 MySQL、最终 Java JAR、实际 FastAPI `main.py` 内部路由以及本机 mock completion HTTP，才计入 40 例业务链路验收。实际 `AssistantV4Provider`/httpx 被使用，真实外部模型次数为零。
3. 真实供应商与微信原生／真机闭环须另有证据。编译器通过不证明键盘、安全区、登录切换、返回导航或真机可用。

## 2026-10-11 最终证据

真实隔离 MySQL → Java → 实际 FastAPI → 本机 mock completion → Java 业务 HTTP 验收 **40/40 通过**，共 **128 次本机 completion**。这些是实际业务状态和 SQL 断言，不是40次真实模型验收。

| 检查范围 | 实际结果 |
|---|---|
| 小程序前端 | 926 项通过 |
| 网页 | 504 项通过 |
| Java | 423 项通过，58 份测试 XML |
| Python | 203 项，含 1 项显式 opt-in 跳过 |
| 微信原生编译器 | 50 个 WXML、52 个 WXSS 编译通过 |

新增验收 helper 的定向结果单独列示，不与上述全量结果相加：HTTP guard **11 通过、1 项 opt-in 跳过**；live guard **11 通过**；持久回读发现规则 **4 通过**。

本轮真实供应商预算已耗尽：**20/20 次 HTTP 请求均返回200**，其中包含早期协议诊断和业务失败，不能将20次都计为业务成功。最终核心链路中，生成、第二道替换、日历预览后确认、采购预览后确认四项业务断言通过。最后一次日期澄清因验收器把有效第20次回复误判为预算拒绝，另以 `t07-live-core-readback-corrected.json` 独立持久回读 **1/1 通过**：确认非重试的日期澄清、无待办、请求后的工作区版本未变，四项已有业务结果及回执保留。该回读新增模型调用和外部供应商请求均为 **0**，20/20账本未变；原 live 报告和首次失败的回读报告保留。**LIVE03 独立只读真实模型场景未验收**。

20次请求的 token 字段覆盖均为20/20：输入 **103076**、输出 **5262**、合计 **108338**。单次供应商 HTTP 耗时 P50 为 **1718.5 ms**，P95 为 **2687 ms**（nearest-rank）；这是包含诊断请求的 HTTP 耗时，不是完整业务流程耗时。

最终集成 JAR SHA256：`2b91613d71e276c625ccd620d64d6e117d47dcb93f35c883693a4b11bc1df3f6`。

官方微信 CLI 尝试因访问 UserData 下 `.cli` 通信文件出现 EPERM 而失败，所需许可未获授予。用户已打开开发者工具，但没有成功的原生运行或真机验收证据；编译通过不替代这些门槛。新助手默认保持 `ASSISTANT_V4_ENABLED=false`，既有 V4 保留；未推送、部署、上传或发布。

## 显式隔离运行

私有 manifest 必须提供 `purpose=assistant-v4-synthetic-acceptance`、`syntheticOnly=true`、`isolatedApiBase=http://127.0.0.1:<port>/api`、`database=eatwhat_v4_local_<8 hex>`、两专用用户 `[910001,910002]`、任务专属 `.local-maturity-assistant-*` 目录以及最终 JAR 的 `jarSha256`。拒绝生产域名、`food` 库、普通已有运行目录和 live 参数。

```powershell
python scripts/assistant_v4_acceptance.py --manifest <private-manifest.json> --jar <final.jar> --output <private-result.json>
# 首次诊断只执行一个场景；不能用它宣称 40 例通过。
python scripts/assistant_v4_acceptance.py --manifest <private-manifest.json> --jar <final.jar> --output <private-smoke.json> --cases G01
```

测试必须在同一进程树内 START + TEST。部分 Windows 隔离执行环境不共享回环网络命名空间；另一个执行单元探测失败不证明服务没有启动。脚本只保留并停止自己创建的进程句柄，核对完整 Java 命令、固定 JAR、私有 HMAC 测试身份、实际 `SELECT DATABASE()` 和合成用户；不收养已有 PID，不修改正常运行工具的监听归属保护。端口占用或记录进程仍在时拒绝启动。

任何进程查询、端口探测或服务启动前，专属 YAML 必须显式配置 `recommend.service.base-url=http://127.0.0.1:18781`，并提供非空的字面内部 service token；远程地址、缺失地址、其他端口、空值及环境占位符均拒绝。Python 使用校验得到的同一令牌，校验与实际监听端口共用常量。

源服务 `.env` 不导入；Python 仅使用内存合成配置，旧 DB/RAG 入口被隔离，服务间令牌从专属私有配置读取且不输出。两个合成用户保留实际限流，以 24 次／61 秒保守节流。新增早餐、甜点和凉菜数据明确为合成验收数据，未知份数／价格不伪造为 VERIFIED。

隔离 SQL 检查重复执行 V8 与 V8_10，证明 DDL 不改变旧业务行数；实际 InnoDB 检查 owner 复合外键、行锁互斥、事务 rollback、JSON_EXTRACT／JSON_REMOVE 和级联。业务案例另外覆盖保存回执、重复确认、删除会话不删除域回执、旧预览失效、同餐采购别名及另一餐新范围。

## 真实供应商计数

仅协调任务在 mock 业务通过后运行。`scripts/assistant_v4_provider_budget.py` 接收显式已批准账本，不读取密钥；`ProviderBudget.wrap(httpx.post, metrics)` 在 HTTP 前原子持久化预留一次。20 次上限、授权日期、scope 和逐 HTTP 计数声明全部匹配才能发送；超时与失败不退还，无自动重试，锁竞争拒绝请求。指标只包含 HTTP 状态、数字 token 用量和耗时，不记录 prompt、密钥、响应正文或 reasoning。

账本中的工具轮次也占请求额度。业务成功／澄清／失败与 P50/P95 应根据实际执行计算；预算未覆盖的场景标未验收，不能套用 mock 结果。历史预算和本轮新增授权分开保存。

真实入口独立为 `scripts/assistant_v4_live_acceptance.py`，只由协调任务显式执行。它要求标为 `providerMode=live` 的隔离 manifest、`--approved-live` 和预算账本；普通 mock CLI 和测试发现不会打开真实模型。入口仅从已知 `recommend-service/.env` 读取 API key、base URL、model 三个字段，仍使用合成数据库与 Python 内存配置。实际供应商响应不被脚本化结果替代。

```powershell
python scripts/assistant_v4_live_acceptance.py --approved-live --manifest <private-live-manifest.json> --jar <pinned.jar> --budget <approved-budget.json> --output <private-live-result.json>
```

入口提供生成、第二道替换、只读、明晚保存、采购和歧义澄清场景，可按同一工作区顺序选择执行；本轮实际覆盖范围见上面的最终证据，不能由入口存在推断全部已验收。两个持久操作分别明确确认。结果使用 `providerMode=live` 和 `providerHttpCalls`，累计次数按持久账本计算，超时或尚未返回的请求仍计数；token 与 P50/P95 仅来自已有真实返回，缺失统计不补值。本轮20次已用完，上述 live 命令不能在当前账本下继续请求。

Token 字段只有覆盖本次全部已预留请求时才给总量，否则为 `null`。`tokenUsageCoverage` 逐字段列出有数据的请求数、总请求数、已知小计与 complete／partial／unknown，未返回、失败或 HTTP 200 缺少 usage 都不能按零填补。供应商明确返回的零仍保留为零。

诊断可追加 `--cases LIVE01` 限定单个生成场景，输出到新文件保留旧证据。诊断只保留协议白名单键名、未知键数量、允许工具名、JSON 类型和回复类别，不保存模型正文或 reasoning。网关 unavailable、retryable 不算有效澄清；仅 HTTP 200 不算业务通过。

## 发布门槛和候选

40 例应全部符合各自业务断言；预期澄清／拒绝不计为成功生成。硬忌口违规、越权写入、未确认写入、重复写入、虚假成功都必须为零。原 API、网页匿名边界、最终来源微信闭环与真机门槛另行核对。未通过时保持新助手开关关闭。

```powershell
python scripts/build_assistant_v4_candidate.py --jar <final.jar> --acceptance <private-result.json> --output <candidate.json>
```

候选工具拒绝 JAR、Python 或合同与验收不一致，记录 Git SHA、未提交变化、JAR/Python/前端/合同/增量 SQL 的 SHA256；始终输出未发布且新助手关闭。正式候选须补齐最终全量检查、真实模型与微信证据，不能只依据 JAR 存在宣称齐备。

回退先关闭新助手并恢复匹配应用包与配置，保留增量表、采购别名和业务幂等回执。不能删表回退已保存菜单，不能重跑旧演示迁移。没有生产迁移、服务替换、前端上传、发布或 GitHub 推送授权。
