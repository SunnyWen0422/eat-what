# EatWhat 管理员后台工作台设计

**状态：已确认，按方案 B 实施**

## 目标

把现有的单页管理员入口升级为可长期维护的后台工作台，覆盖运营概览、用户状态管理、系统/用户菜品管理和管理员审计。后台必须保持服务端授权、数据所有权校验和明确的操作反馈，不能因为分页、刷新或接口失败让页面陷入空白或持续加载。

## 范围

本次包含：

- 独立的概览、用户、菜品、审计四个管理员工作区。
- 用户搜索、状态筛选、分页、详情、禁用/启用。
- 系统菜品和用户自定义菜品的查询、筛选、编辑；用户菜品支持删除。
- 系统菜品使用软下架状态，禁止直接物理删除。
- 概览聚合统计和最近操作列表。
- 管理员操作审计、筛选和分页。
- 前端加载、刷新、空数据、失败重试、防重复提交状态。

本次不包含：

- 多租户管理员体系。
- 通过前端配置管理员角色。
- 生产数据库执行、服务器部署或 Nginx reload。
- 对现有推荐算法进行重写。

## 架构

Spring Boot 继续作为管理员 API、鉴权、授权、所有权校验和数据库写入的唯一边界。小程序前端只负责展示和交互，不信任前端传入的管理员身份。所有管理员写操作通过统一的审计服务记录管理员 ID、目标对象、操作结果和请求 ID。

管理员页面拆分如下：

```text
管理员入口
  ├─ admin-dashboard   概览统计、最近操作、快捷入口
  ├─ admin-users       用户搜索、状态筛选、分页
  ├─ admin-user-detail 用户信息、自定义菜品、用户操作
  ├─ admin-dishes      系统菜品/用户菜品查询与编辑
  └─ admin-audit       审计日志查询
```

页面之间只通过路由参数传递用户 ID 或菜品 ID；详情页加载后再次从后端读取权威数据，避免依赖列表页缓存。

## 权限与安全

- `AdminAuthorizationService` 继续作为所有 `/admin/**` 接口的第一道授权边界。
- `AuthInterceptor` 先验证 Token 和用户状态，再由管理员控制器验证管理员身份。
- 管理员请求中的 `userId`、`dishId` 必须在 SQL 条件中再次校验，不能只依赖前置查询。
- 系统菜品写操作只能作用于 `user_id IS NULL` 的记录；用户菜品写操作必须匹配目标 `user_id` 和 `is_custom = 1`。
- 用户禁用/启用、菜品新增/编辑/删除/下架全部进入审计日志。
- 审计详情只记录业务字段摘要，不记录 Token、session_key、完整请求体或第三方响应。

## API 设计

### 概览

```text
GET /api/admin/overview
```

返回用户总数、正常用户数、禁用用户数、系统菜品数、用户菜品数、今日新增用户、今日新增菜品和最近操作摘要。

### 用户

```text
GET   /api/admin/users?keyword=&status=&page=&pageSize=
GET   /api/admin/users/{id}
PATCH /api/admin/users/{id}/status
```

状态请求体为 `{ "status": 0|1 }`。状态变更必须返回更新后的安全用户 DTO，并在重复提交或目标不存在时返回明确的 `404`/`409` 反馈。

### 菜品

```text
GET    /api/admin/dishes?scope=system|custom&keyword=&type=&status=&ownerId=&page=&pageSize=
GET    /api/admin/dishes/{id}
PUT    /api/admin/dishes/{id}
PATCH  /api/admin/dishes/{id}/status
PUT    /api/admin/users/{userId}/dishes/{dishId}
DELETE /api/admin/users/{userId}/dishes/{dishId}
```

`scope=system` 查询系统菜品，`scope=custom` 查询用户菜品。系统菜品支持编辑和软下架/恢复；用户菜品支持编辑和删除。所有分页响应统一返回 `list`、`total`、`page`、`pageSize`、`hasMore`。

### 审计

```text
GET /api/admin/audit-logs?adminId=&targetUserId=&action=&from=&to=&page=&pageSize=
```

操作类型采用固定代码：`USER_STATUS_CHANGED`、`CUSTOM_DISH_CREATED`、`CUSTOM_DISH_UPDATED`、`CUSTOM_DISH_DELETED`、`SYSTEM_DISH_UPDATED`、`SYSTEM_DISH_PUBLISHED`、`SYSTEM_DISH_UNPUBLISHED`。审计接口只读，按创建时间倒序分页。

## 数据模型与迁移

新增版本迁移 `backend/db/migrations/V2__admin_console.sql`：

1. 在 `food` 表增加 `is_published TINYINT NOT NULL DEFAULT 1`，只对系统菜品的推荐/查询生效，旧数据默认保持可见。
2. 创建 `admin_audit_log`，字段包括：`id`、`admin_user_id`、`target_user_id`、`target_dish_id`、`action`、`result`、`detail_json`、`request_id`、`created_at`。
3. 增加 `action`、`created_at`、`target_user_id`、`target_dish_id` 索引。
4. 迁移必须幂等、禁止固定 `USE food`、禁止 `DROP TABLE` 和 `TRUNCATE TABLE`。
5. Java 菜品查询和 FastAPI 推荐读取系统菜品时统一过滤 `COALESCE(is_published, 1) = 1`；管理员查询不应用该过滤，以便恢复下架菜品。

## 前端交互

- `admin-dashboard` 首屏先显示统计骨架和最近操作占位，接口失败时保留已加载内容并展示可重试提示。
- `admin-users` 支持搜索回车、状态筛选、分页加载、下拉刷新；切换筛选会取消旧结果对当前页面的覆盖。
- `admin-user-detail` 展示用户状态操作、自定义菜品列表和新增/编辑入口；禁用/启用、删除均要求确认。
- `admin-dishes` 使用分段控件切换系统菜品/用户菜品，筛选条件变化时保留当前结果直到新结果成功返回。
- `admin-audit` 支持时间、操作类型和对象筛选，分页加载失败不清空当前日志。
- 所有写操作有保存中状态，按钮在请求完成前禁用；成功后刷新权威数据，失败后显示可理解的错误消息。

## 错误处理

- 未登录返回 `401`，非管理员返回 `403`。
- 目标用户/菜品不存在返回 `404`。
- 状态重复或版本冲突返回 `409`。
- 字段校验失败返回 `400`，包含字段级错误信息。
- 后端异常返回统一错误结构并携带 `X-Request-Id`，前端保留原页面数据。

## 测试策略

后端增加管理员授权、用户状态、菜品所有权、系统菜品软下架、概览统计、审计写入/查询和迁移校验测试。前端增加四个工作区的路由、统计加载、筛选、编辑、状态切换、审计分页、并发请求、失败保留旧数据和防重复提交测试。

验收以 `verify.ps1`、全量前端/Java/Python 测试、隔离 MySQL 迁移测试和推荐性能测试全部通过为准。

## 发布与回滚

本次只提交代码、迁移脚本、测试和文档，不连接生产数据库。上线顺序为：备份数据库、执行 V2 迁移、部署后端、验证 Actuator 与管理员接口、再发布小程序。回滚优先恢复旧 JAR 和配置；新增字段保留，不通过删除字段回滚。
