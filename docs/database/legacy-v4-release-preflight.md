# 旧 food 数据库到 V4：只生成发布前预检产物

`scripts/prepare_legacy_v4_release.py` 是离线准备工具。默认只读取明确传入的 JSON 结构快照和仓库中已登记、校验 SHA256 的迁移源，输出新的不可覆盖目录。它没有数据库连接创建、生产执行、上传、服务重启或模型调用入口。

此工具解决旧线上迁移血缘与新版迁移编号不同的问题。不能把 `V3__meal_workflow.sql`、`V4__meal_workspace.sql` 等整份文件直接重放到旧库；其中包含其他场景的迁移步骤与六道早餐演示菜。本工具只选取经过清单校验的目标 `CREATE TABLE` 片段及明确的六个新增字段，不执行或输出演示菜、旧账本更新、原菜库替换。

## 输入与命令

使用已保存在本地的结构快照生成新目录：

```powershell
python scripts/prepare_legacy_v4_release.py --schema-snapshot <完整结构快照.json> --output <新的候选目录>
```

`--schema-snapshot` 可重复传入，例如较早的列快照和较晚的索引快照；每份输入都必须带时区明确的 `checkedAtUtc`、数据库身份、表清单和 `results`。各输入的数据库、血缘、修正数量、重叠结构证据必须一致。只包含 `DATA_TYPE` 的旧列快照不能证明长度、空值、默认值、索引前缀或外键；发现已存在目标对象而不能核实完整形状时，工具明确拒绝生成 SQL。

当前目标是 `food`，本机演练接受 `eatwhat_release_test_*`、`eatwhat_v4_test_*`、`eatwhat_quality_test_*` 专属库。不同数据库的快照不能混合。工具不会把本机副本快照当成最新线上状态；以后真正上线前必须重新采集完整线上结构，并重新准备和演练。

快照最低要求：

- 旧业务表存在，五个旧账本版本精确为 `V1__production_hardening`、`V2__admin_console`、`V3__calendar_sync`、`V4__custom_dish_receipts`、`V5__assistant_recipe_provenance`。
- `databaseCollation` 明确给出；`users.last_login_time` 已存在且为 `datetime`，不隐式创建。
- `results` 包含 `kind=shoppingPreflight`、`calculatedWithUnknownBase` 非负整数。数量不固定为 50，以此次快照为准；没有数量证据则拒绝。
- 两张已有质量表 `dish_quality_profile`、`dish_quality_revision` 必须有完整且一致的 `schemaContracts`，包括全部列、索引及空的外键清单。
- `recipe_records`、`shopping_request_log`、`user_preference` 的列清单必须存在；已存在新增字段要提供完整字段形状。
- 已存在的 15 张目标表必须提供完整列、索引、外键形状；同名异形、缺少元数据或多余约束均拒绝，不能靠 `CREATE IF NOT EXISTS` 掩盖。

## 本地演练的结构采集接口

调用方先创建、选定并负责自己的数据库连接，再调用：

```python
from prepare_legacy_v4_release import snapshot_from_connection, build_plan, prepare

snapshot = snapshot_from_connection(existing_owned_local_connection)
plan = build_plan([snapshot])
```

`snapshot_from_connection` 仅执行 7 组 `SELECT`，读取数据库身份、数据库默认排序规则、`information_schema` 的表/列/索引/外键、旧账本版本与指定采购状态数量。它不创建连接、不更改事务状态、不提交、不写数据库，也不返回用户行、菜谱内容、密码或连接配置。调用方应在结构稳定的本机专属副本中采集；并发 DDL 会造成快照失效，需要重新采集。

其规范化格式如下：

```json
{
  "database": "eatwhat_release_test_example",
  "databaseCollation": "utf8mb4_0900_ai_ci",
  "checkedAtUtc": "2026-10-10T03:00:00+00:00",
  "tables": [{"table": "meal_workspace", "engine": "InnoDB"}],
  "schemaContracts": {
    "meal_workspace": {
      "engine": "InnoDB",
      "collation": "utf8mb4_unicode_ci",
      "columns": {
        "id": {"columnType": "varchar(36)", "nullable": false, "default": null, "extra": "", "collation": "utf8mb4_unicode_ci"}
      },
      "indexes": [{"name": "PRIMARY", "unique": true, "columns": ["id"], "prefixLengths": [null], "orders": ["A"], "type": "BTREE"}],
      "foreignKeys": []
    }
  },
  "results": []
}
```

示例仅展示字段格式，省略了其他必需表、列、索引和血缘，不能直接作为可用输入。外键的完整字段为 `name/columns/targetTable/targetColumns/targetSchema/onDelete/onUpdate`；`targetSchema` 只能是 `CURRENT_DATABASE`，由采集器确认实际引用同一数据库后产生，跨库外键需要另行审阅。

## 输出与续跑

新目录包含：

| 文件 | 用途 |
| --- | --- |
| `legacy-to-v4.sql` | 只包含缺失的目标表、缺失字段及明确计数的采购状态修正 |
| `steps.json` | 各步骤对象、精确 SQL、预期影响数量 |
| `contracts.json` | 对应当前迁移源的完整目标表形状 |
| `preflight.json` | 数据库身份、输入时间/哈希、迁移源哈希、输出文件哈希、新增和跳过清单 |

对于完全匹配的已存在对象，准备器跳过对应 DDL。因此本机可演练“先应用部分 DDL、重新采样、再准备剩余步骤”；不能直接重跑旧 SQL 或假定同名对象可用。MySQL DDL 会隐式提交，输出文件本身不是执行器或回滚器。

采购修正仅将缺少基础人数却标为 `CALCULATED` 的记录改为 `NEEDS_ADJUSTMENT`，带 `expectedAffected` 供未来执行者重新确认；显式 `updated_at=updated_at` 保留原时间。数量、原文、单价、金额、勾选、人工覆盖都不改。数量为 0 时不生成数据更新。

原菜谱、用户与历史 ID 保留；不会凭空创建实际用餐，不修改 `schema_migrations`，不写价格。输出只含结构及汇总，输入绝对路径、私密配置位置和凭据不进入产物。

本机检查：

```powershell
python -m unittest discover -s tests -p test_legacy_v4_release.py
```

测试覆盖旧血缘、15 表/6 字段、质量表异形、部分 DDL 续跑、字段默认值、索引唯一性/前缀、外键规则/目标库、计数缺失、不可覆盖输出及采集器只读查询。通过这些检查不代表已经部署或证明当前线上结构。
