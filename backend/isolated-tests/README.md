# 显式启用的隔离 MySQL 验证

此入口只编译主源码及 `../src/isolated-test/java`，不加载应用配置、不启动完整应用，不包含普通测试目录或模型/Agent测试。根 `backend/pom.xml` 不会发现这些 IT。请先阅读选中的测试，再执行。

测试会创建或删除合成表，必须使用**新建、任务独占、仅回环监听**的 MySQL 8 容器或独立原生实例与空数据库，不能使用已有、共享或生产数据库。使用临时随机凭据；不修改现有账户、权限或全局配置。不要把凭据、容器数据、构建输出提交到仓库。

## F1 实吃保存

- 新建数据库名 `eatwhat_actual_test_<小写字母数字随机后缀>`。
- `MEAL_ACTUAL_TEST_ENABLED=true`。
- `MEAL_ACTUAL_TEST_JDBC=jdbc:mysql://127.0.0.1:<临时端口>/<上述数据库>?allowPublicKeyRetrieval=true&useSSL=false&serverTimezone=UTC`。
- `MEAL_ACTUAL_TEST_PASSWORD`：该专属实例的随机root口令。
- 运行：`mvn -f backend/isolated-tests/pom.xml -Dtest=MealConsumptionMysqlIT -Djacoco.skip=true test`。

## F2 注解代理与缓存

- 准备任务独占实例及空数据库 `f2_aop_test`。
- `EATWHAT_F2_MYSQL_TEST=1`。
- `EATWHAT_F2_JDBC_URL=jdbc:mysql://127.0.0.1:<临时端口>/f2_aop_test?allowPublicKeyRetrieval=true&useSSL=false&serverTimezone=UTC`。
- `EATWHAT_F2_DB_PASSWORD`：该专属实例的随机root口令。
- 运行：`mvn -f backend/isolated-tests/pom.xml -Dtest=FilteredDishSpringTransactionIT -Djacoco.skip=true test`。

以上禁用TLS参数仅供任务专属回环实例，不适用于任何远端连接。可以通过 `-Dmaven.repo.local=<任务缓存>` 与 `-Deatwhat.build.directory=<任务输出>` 将依赖和产物放在隔离目录。只有依赖已缓存时才加 `-o`；不修改全局Maven设置。

完成后停止自己创建且核对过归属的实例。容器可清理自己的匿名卷；原生实例仅处理本任务专属目录，不能碰已有数据。临时凭据不持久化或在任务结束时清理。没有显式opt-in导致的跳过不算通过。测试数据为合成schema，不构成迁移、生产性能或完整部署验收。模型、mock模型、Agent验证仍须单独授权。

2026-10-15 整合补充：F2现在含复杂排除批次、普通COUNT+LIMIT两项事务快照测试；每项会重建专属f2_aop_test中的food与dish_quality_profile合成表。F1仍8项。此入口合计10项，必须确认数据库归属。生产数据、治理备份不在本入口测试范围内。
