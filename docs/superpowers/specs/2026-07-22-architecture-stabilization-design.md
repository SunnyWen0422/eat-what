# EatWhat 架构稳定化设计

## 目标

在不增加新业务功能的前提下，修复现有功能边界，删除没有后端实现的前端能力，并把推荐、菜品和 AI 写入流程整理成可独立测试的模块。

## 范围

1. 小程序只暴露已经由 Java 后端实现的接口和页面。
2. 小程序 API 地址只有一个配置来源，页面不再直接拼接生产域名。
3. 推荐结果页把“缓存优先、后端刷新、本地降级”和响应转换移出 Page。
4. Java 将菜品查询、自定义菜品、推荐三个职责从 `DishService` 拆开。
5. Python 推荐服务保持只读数据库访问；AI 的“加入自定义菜品”意图返回结构化命令，由 Java 使用当前认证用户执行写入。
6. Java 到 Python 的地址通过部署配置注入，不在 Controller 中硬编码。
7. 增加跨端契约测试，防止前端再次调用不存在的后端接口。
8. 将进程内令牌替换为可跨实例验证的 HMAC 签名令牌，并为管理接口增加显式管理员授权。

## 明确删除

- 从 `app.json` 删除购物清单页面注册。
- 删除 `pages/shopping-list/` 页面文件。
- 删除 `utils/api.js` 中购物清单、旧 `/favorites`、未实现 `/recipes` 的占位封装。
- 删除关于页和功能文档中对购物清单、联系我们等未实现入口的介绍。

## 前端设计

`utils/config.js` 负责环境到 API 根地址的映射，`utils/api.js` 只通过 `getApiBaseUrl()` 获取地址。新增 `utils/recommendation-flow.js`，负责：

- 规范化 Java 推荐响应；
- 从全局或本地缓存选择菜品池；
- 执行缓存优先、后端优先和本地降级流程；
- 提供静默后端刷新能力。

Page 只保留加载状态、用户交互和 `setData`。

## Java 设计

- `DishQueryService`：查询、搜索、详情、轻量列表和批量查询。
- `CustomDishService`：强制绑定所有者，查询和删除用户自定义菜品。
- `RecommendationService`：推荐计划与单道替换；数据库查询保持在线程内执行，避免 MyBatis 连接跨公共线程池。
- `AiChatGateway`：封装 Python HTTP 调用及地址配置。
- `ChatApplicationService`：调用 AI、识别结构化命令，并通过 `CustomDishService` 写入。

Controller 使用构造器注入，只负责 HTTP 参数、认证上下文和响应映射。

## Python 设计

推荐服务可以读取菜品数据用于 RAG，但不再执行 `INSERT/UPDATE/DELETE`。当用户明确表达“加入我的菜谱”时，服务从最近一次 AI 回复中匹配菜品并返回：

```json
{
  "type": "CREATE_CUSTOM_DISH",
  "dish": { "name": "番茄炒蛋", "type": "veg", "cl": "...", "step": "..." }
}
```

Java 仅使用认证拦截器提供的用户 ID 执行命令；客户端提交的 `user_id` 不作为写入身份依据。

## 错误处理

- AI 不可用时 Java 返回 `503` 和统一的 `success=false` 响应。
- AI 命令写入失败时不返回“已保存”的误导文案。
- 游客尝试保存时返回登录提示，不执行写入。
- 推荐后端失败时继续使用现有本地算法降级。

## 认证与管理权限

- `TokenService` 生成包含用户 ID 和过期时间的 HMAC-SHA256 签名令牌，同一 `TOKEN_SECRET` 下可跨进程、跨实例验证。
- `AuthInterceptor` 是受保护接口的统一认证入口；聊天接口允许游客访问，但在携带有效令牌时仍解析真实用户身份。
- 管理接口只允许 `ADMIN_USER_IDS` 中的用户访问，前端隐藏入口也只对后端确认的管理员开放。

## 验证

- Node 测试验证页面注册、API 配置、接口族契约和推荐流程。
- JUnit 验证三个 Java 服务边界、Controller 依赖和 AI 命令写入所有权。
- JUnit 验证签名令牌跨实例校验、过期/篡改拒绝和管理员授权。
- Pytest 验证 Python 只返回动作、不直接写数据库。
- 最后运行 `scripts/test-all.ps1` 与 `scripts/verify.ps1`。
