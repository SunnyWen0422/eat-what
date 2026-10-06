# V4 与旧本地迁移血缘

本次只在新建隔离数据库应用当前清单。未读取或迁移生产数据库。旧源代码、私有配置和 Git 历史已有归档，见 [对齐报告](../planning/2026-10-06-local-alignment.md)。

| 血缘 | V3/V4/V5/V6 | 处理 |
|---|---|---|
| 当前 V4 | V3 meal_workflow，V4 meal_workspace，新增 V5 shopping_prices | V1–V4 原文件与 checksum 不变；新库按清单应用 |
| 旧本地 | V3 calendar_sync，V4 custom_dish_receipts，V5 assistant_recipe_provenance，V6 shopping_prices | 禁止按最高版本号继续执行当前脚本；须另行桥接 |
| 混合或未知 | 同号异名、未知版本、重复版本或 checksum 不符 | 停止；先脱敏导出并审计 |

`scripts/audit_schema_lineage.py` 没有数据库连接能力。输入 `migrations:[{version,checksum}]`、`tables` 和可选 `legacyObjects` 的脱敏 JSON，以及当前迁移清单；输出 lineage、safe、blockers、versions。新报告写入新路径。脚本只是记录血缘检查，不能代替真实列、索引、对象数量核验，也不能产生升级许可。

```powershell
python scripts/audit_schema_lineage.py --schema-json <脱敏结构.json> --manifest backend/db/migration-manifest.json --out <新报告.json>
```

| 旧行为/数据 | V4 权威对象 | 本次承接 |
|---|---|---|
| 助手候选与原配方 | 工作区草稿及服务端复核 | 不直接恢复旧会话写入；模型工具只读，Java 校验真实 ID、限制与菜数 |
| 日历计划/历史快照 | recipe_records 版本、meal_consumption 快照 | 当前餐确认与实吃分开；历史实际不跟随新配方变化 |
| 未知请求/回执 | 工作区及购物 mutation log | 继续使用原 requestId、原 payload、原版本；重放不重复写入 |
| 采购来源与勾选 | shopping_list / shopping_dish / shopping_item | V4 版本与来源保持；买过不等于吃过 |
| 旧价格 V6 | 当前 V4 新 V5 价格与 expense 表 | 移植表/业务契约，使用新血缘版本；禁止把旧 V6 或旧 V3/V4 原样叠加 |
| 实付 | 当前清单 ingredientKey | 食材汇总一次、0 有效、与参考价及勾选分开；失去清单来源后清理对应实付 |
| 语音 | 关闭的会话服务与不可用弹窗 | 用户明确暂缓服务落地与测试，不携入旧密钥 |

旧库桥接需要先核对真实 DDL/checksum 和各对象数量，再定义幂等转换与回滚：已有计划保留原快照；旧实际记录不能由计划推断；旧未知回执不能直接伪造成功；采购键按规格及手工身份映射；不能唯一映射的实付隔离并人工核对。重复执行不新增对象，部分失败能从审计标记继续，恢复演练使用副本。上述桥接尚未实施，不能声明现有旧库已可升级。

旧客户端仍可使用既有兼容接口。新 V4 工作区接口在服务端关闭时明确不可用；购物价格/实付先探测能力，404 退避且不阻断基本清单。当前本机例外已按用户要求开启，生产默认仍需独立发布配置。
