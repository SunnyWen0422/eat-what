# 固定本餐评测

`tests/fixtures/workspace-evaluation.jsonl` 固定 10 类、60 条样本，数据版本为 `local-synthetic-v1`。范围包括食材排除、家常标签、整餐用时、目标切换、人数、歧义、库外菜、价格不可用、禁止自动写入及复合限制。

默认不访问 HTTP、不调用模型、不修改业务对象；离线通过表示样本结构合法，不代表模型理解通过。

```powershell
python scripts/evaluate_workspace.py --dry-run --out <私有报告路径>
python scripts/evaluate_workspace.py --execute --manifest .local-v4/runtime.json --max-model-requests 4 --case-id ingredient_exclusion-1 --out <私有报告路径>
```

真实执行仅允许已验证的隔离库和固定本机适配器，读取同一 `.local-v4/model-budget.json`。适配器在每次供应商请求前计数，失败亦计数，同时限制本次评测允许的调用量。传输结果未知时评测停止，不自动重试，也不把未知用量记成零。报告不输出凭据、完整模型响应或个人记录。

证据层是 Python 无状态提案接口：真实菜品 ID、目标及明确约束核对，不执行 Java 计划确认、购物或 actual 写入。Java 权威筛选、整餐预算和原生页面需要各自验收。本轮 60 条仅做结构校验，真实执行“不吃鸡蛋”1 条通过，3 次供应商请求，约 4.45 秒；累计预算 15/20。不得将 1 条通过率推广为整个产品质量。

来源数据为本地合成菜，官方费用未评测；其余真实样本尚未执行。关键 iOS/Android、大字、双设备和弱网仍留在原生矩阵。
