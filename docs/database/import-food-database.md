# 导入 6,665 条菜品数据

目标数据库：MySQL 8.0。全量脚本已经包含以下内容：

- `food` 菜品表及索引
- 6,665 条系统菜品
- 推荐筛选所需的菜系、标签、烹饪分钟数元数据
- `user_preference` 用户偏好表
- 导入后的数量和菜系校验查询

## Workbench 导入

1. 先备份目标数据库；脚本会删除并重建目标库中的 `food` 表。
2. 在 MySQL Workbench 打开：
   `outputs/dish-replacement-20260718/eatwhat_food_database_mysql8.sql`
3. 确认连接使用 MySQL 8.0，并以 UTF-8 执行整个脚本。
4. 最后应看到以下结果：
   - 系统菜品：`6665`
   - 家常菜标签：`6035`
   - 川菜：`162`
   - 粤菜：`65`

## 命令行导入

```powershell
mysql --default-character-set=utf8mb4 -u root -p < outputs\dish-replacement-20260718\eatwhat_food_database_mysql8.sql
```

## 使用其他数据库名

脚本默认使用 `food`。如果目标库名不同，在项目根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build_food_database_sql.ps1 -DatabaseName eatwhat_dev
```

然后执行生成的 `outputs/dish-replacement-20260718/eatwhat_food_database_mysql8.sql`。

脚本只包含系统菜品，不包含任何用户自定义菜品、用户账号或收藏历史；这些业务表需要按项目的其他建表脚本单独初始化。
