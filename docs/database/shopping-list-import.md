# 购物清单数据库导入说明

本功能新增表只用于购物清单和食材解析索引，不修改 `food.ingredients_amounts`。当前代码只生成结构与回填脚本，不会连接生产数据库。

## 隔离环境

1. 创建临时 MySQL 8.0 数据库，并确认连接端口不是生产端口。
2. 执行 `backend/shopping_list_schema.sql`。
3. 使用 `scripts/backfill_shopping_ingredients.py` 生成 `dish_ingredient.sql`、候选目录 CSV 和审计报告。
4. 执行 `scripts/audit_shopping_ingredients.py`，审计报告通过后再执行生成的 SQL。

```powershell
mysql -h 127.0.0.1 -P 3307 -u <user> -p <database> < backend/shopping_list_schema.sql
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/backfill_shopping_ingredients.py --input outputs/dish-replacement-20260718/food_import.csv --output-dir outputs/shopping-list-backfill
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/audit_shopping_ingredients.py --input-dir outputs/shopping-list-backfill
mysql -h 127.0.0.1 -P 3307 -u <user> -p <database> < outputs/shopping-list-backfill/dish_ingredient.sql
```

## 数据规则

- `fl` 中的“2名成年人总量+15%冗余”只记录为审计信息；`ingredients_amounts` 已包含冗余，服务端不再次加成。
- `shopping_dish` 是菜品来源隔离边界；不同菜品的同名食材不得写入同一个分组。
- `purchaseSummary` 是查询时派生的辅助视图，不单独建表，也不能覆盖按菜品保存的 `shopping_item`。
- 回填失败的项目保留原文和 `NEEDS_ADJUSTMENT` 状态，不静默删除。

生产迁移必须先备份 `food` 和用户表、审阅审计报告并由人工批准；本功能不会自动执行生产迁移。
