# 独立网页公共菜品接口

## 当前状态与发布授权

独立网页只读取线上数据库的专用同源公开 GET API；个人菜、收藏、菜单、计划、实际饮食、采购和备份均留在浏览器本地。接口和网页调用代码已实现，但本轮没有连接真实数据库或生产 API。

服务端默认 `public-catalog.enabled=false`、`public-catalog.allowed-dish-ids=[]`。开发实现不等于批准披露菜品、启用接口或部署。现有 `is_published=1` 只表示旧推荐可见，不能代替匿名公开授权。具体 ID、原文、来源许可及质量事实必须经过单独发布确认后才能填入 allowlist。安全配置是：

```yaml
public-catalog:
  enabled: false
  allowed-dish-ids: []
```

列表最多 500 个唯一的正整数 ID，必须在 JavaScript 安全整数范围内。空值、重复、零、负数、越界和过长列表在配置绑定时拒绝；不会自动扩成全部旧已发布菜。没有迁移数据库、更新源菜或改变全局鉴权/CORS。

## HTTP 契约

已有 `/api` servlet 前缀下新增：

- `GET /api/public/catalog/dishes?page=1&pageSize=50&type=veg`
- `GET /api/public/catalog/dishes/{id}`

列表响应 `{list,total,page,pageSize}`。page 默认 1，范围 1–500；pageSize 默认 50，范围 1–100。type 只能为 meat、veg、soup、staple、dessert。keyword、重复参数以及其余查询字段均拒绝。详情 ID 必须是正安全整数，详情不接受查询参数。网页一次加载获准目录后在本地检索，不把个人检索词或忌口传给 API。

停用时返回 503 JSON；启用但空 allowlist 返回成功空列表；不存在、未放行或不安全的详情返回 404；参数无效返回 400。由普通 controller 请求处理的 HEAD、POST、PUT、PATCH、DELETE、OPTIONS 返回 405 和 `Allow: GET`；已有全局 CORS/反向代理可能先处理预检 OPTIONS，因此不能据此承诺所有网络预检都是 405。namespace 内由 controller 处理的响应带 `Cache-Control: no-store`，错误为通用 JSON，不包含内部异常详情。全部 handler 都不写数据。

## 数据库暴露边界

专用 mapper 的列表、计数和详情同时要求：

```sql
ID IN (explicit approved IDs)
AND user_id IS NULL
AND is_custom = 0
AND is_published = 1
```

空 allowlist 独立包含 `1 = 0`，NULL 标记排除。MyBatis 参数绑定，列表使用 SQL LIMIT/OFFSET 和稳定 ID 排序。service 再次检查来源和计数一致性，异常时不返回匿名计数或部分列表。不调用旧 unrestricted 菜品查询、私房菜服务、推荐或模型端点。

## DTO、质量状态与未知信息

公开 DTO 只保留 id/name/type/cl/fl/step/steps/tips/ingredientsAmounts/contentVersion，以及 quality 的 reviewStatus/basePeople/servingsStatus/stepStatus/timeStatus、issueCodes 和白名单原料事实。

不序列化 owner/user、发布/私房标记、时间戳、审核者、内部来源与证据、图片或营养值。原做法在界面以纯文本显示。contentVersion 是原菜内容指纹，不是整个菜库的事务版本，也不是内容审核证明。

质量 profile 只读取已通过公开与所有权检查的菜；必须匹配 dish ID 和当前原内容指纹。缺失、损坏、过期、不匹配或读取失败的 profile 降为 UNKNOWN，并丢弃 profile 的原料与基准人数。未知状态不提升成 VERIFIED。核验数量必须有已核验身份和数量、原料名、明确单位、有界正数量及相应审阅证据；核验基准人数额外限制为 1–50 整数。仅返回固定公开问题码 INFORMATION_INCOMPLETE，不返回内部 issue 文本。

不补造来源 URL、许可、标准原料 ID、菜谱 family、逐菜餐次证据或营养值。meat/veg 等是界面类别，不能保证素食或排除过敏原。未知/未解析原料在硬忌口筛选中保守排除，可能减少自动候选；不能把“不知道”当成“安全”。

## 网页传输与本地数据

`createSameOriginPublicCatalogTransport` 固定相对端点。创建对象不发请求；明确加载目录时才 GET，使用 `credentials: omit`、`mode: same-origin`、`redirect: error`、`cache: no-store`、Accept JSON 和 15 秒中止超时。仅传 page/pageSize/type。检查 HTTP 状态、重定向、JSON 类型、UTF-8 和流式 20 MiB 限制；provider 检查分页及 DTO，过滤所有非白名单字段。

失败产生 retryable 错误，由用户重新加载；没有自动重试。没有静态菜谱、测试菜或历史 18 道菜兜底；空真实结果保持为空。成功加载的目录可在当前会话内存中继续使用，不能作为永久权威目录缓存。个人历史快照不依赖公共目录成功。

网页与接口必须同 origin，通常经已有 `/api` 代理。网页不读取旧受保护 `/dishes`，不发 token、身份、偏好、忌口或个人记录。首次请求仍可能有普通服务器访问日志，不能把“个人数据本地”理解成访问网站完全不可观察。

## 尚未证明的内容

已有集中 backend unit/MockMvc 与 mapper 契约测试使用模拟数据库边界及 MyBatis 解析，只证明局部契约。当前发布检查读取源码，核对默认停用/空 allowlist/固定 GET 及禁用静态拷贝；不能证明 SQL 引擎、真实数据库隔离、生产 Nginx 路由或既有 API 无回归。

目录没有事务级 revision。列表与 count、连续分页间可以变化；发现重复 ID、数量或页数不一致会失败并给出可重试错误，不自动重试。相同总数下跨页内容编辑仍可能无法被发现。这是目前可靠性限制，发布前应验证数据更新策略或增加服务端快照契约。

真实公开菜数、可生成菜数、来源许可和 VERIFIED 覆盖仍未核实。按 [验收记录](verification.md) 与 [运行/回滚手册](release-runbook.md) 逐项补证；在单独许可和证据齐备前保持默认关闭。
