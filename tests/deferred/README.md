# 后续统一模型验收

用户在 2026-10-07 明确要求本轮先去除模型服务测试，功能开发完成后统一测试。因此本轮 `scripts/verify.ps1` 使用 `-SkipModelServiceTests`，模型服务相关模块不加载、不执行。

新增预算回归保存在 `local_model_budget_review.py`，不参与默认发现。本文件仅使用替身 HTTP 和临时 SQLite，也按用户最新要求暂缓重跑。已有模型相关测试源码保留，以便统一验收时恢复。

以后统一验收的内容：V4 与高级助手传输、失败回退与规则模式预算、额度耗尽后任务终结、取消/恢复、固定评测集，以及按届时明确预算进行的真实供应商联调。独立记录离线结果与真实服务结果。

恢复离线预算回归时显式使用：`python -m unittest discover -s tests/deferred -p local_model_budget_review.py -v`。真实请求需使用原计数器，不能重置额度。
