# E18 预算内真实模型验收

入口沿用 `scripts/run_maturity_live.py` 与 `assistant_v4_provider_budget.py`，不新建或重置账本。执行前重读授权日期及 used/limit；本次初读为 2026-10-16 授权、16/20，最多剩 4 次 HTTP。失败和超时照计；一个语义场景可多次 HTTP，不能按场景扣一次。mock 原生服务不读取供应商凭据。

新增 `temporary` 语义场景：用户只给当前餐补充“少油”。文字尚未解释为可兑现条件时，不自动应用，也不鼓励盲重试，而是 needs_input，指向现有“修改本餐要求”/可用筛选入口，菜单、人数、长期偏好和日历/采购均保持。合法结构化临时筛选仍须走原授权执行器、硬约束和回执。`clarify` 验歧义目标必须澄清；已有 `shopping` 验保存餐目标/修订、明确确认、实际来源行、幂等回执及不伪造实吃。模型只输出建议，Java 校验目标、归属、版本、预览、确认与写入。

2026-10-17 本轮4次供应商HTTP已全部计入原账本，累计20/20。初次 temporary 样本 Python/schema 通过，但 Java 拒绝 raw requirements 变化后落为 failed/retryable，不能标成功；clarify 1次HTTP通过，shopping 2次HTTP通过，实际写入22条来源行且确认重放无重复。此后针对确定性失败补充 needs_input 反馈，保持原工作区文字/硬约束保护；新 JAR 的离线回包验证与旧 JAR 的真实模型样本分别记账，额度耗尽未真实复测新 JAR。没有把旧样本改写成新包通过。

```powershell
python scripts/run_maturity_live.py --config $ExperienceConfig --out $LiveEvidence --budget $ModelBudget --authorization-date $ModelAuthorizationDate --approved-live --cases temporary,clarify
# 仅在实际账本还有额度时，另建专属配置/输出执行 targeted shopping；不重置账本。
```

本地配置必须使用本次 HEAD、固定 JAR/后端指纹及 E17 固定 6665 道公开菜快照，providerMode 显式 live，ledger 指向原授权。完整 preflight 在输出创建前执行，owned_runtime 再查一次。供应商只读既有 `.env` 中三个必要字段，不输出原始密钥/提示词，不接收产品来源信封，不修改本机凭据。测试账号均为新隔离库中的合成身份。

实际结果与 providerHttpAttempts 见本任务仓库外报告；未跑或未通过的语义必须逐项保留。不以模型成功代替真实前端卡片、微信 SSO、手机操作或生产部署。旧模型样本不冒充当前源指纹的新证明。

原20/20账本封存后，只有用户明确追加的独立授权才可创建新的小额账本；这不是复制、迁移或重置原账本。本轮后续明确批准最多4次HTTP，新增账本limit=4/used=0，授权日期2026-10-17，authorizationRef与对应用户答复标识一致。入口必须同时显式传入 --approved-http-limit 4 和 --authorization-ref；类校验授权日期/ref/上限完全匹配，默认20不接受追加授权ref。失败计入，达到4后不得调用传输。未使用额度不自动重试或转作其他场景，手机MOCK栈结束后才启动独立LIVE栈。
