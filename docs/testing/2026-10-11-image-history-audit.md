# 图片调用历史与有限预加载核对

核对日期：2026-10-11。基线为 `c010f02`，本记录同时说明本轮本地增量修复。未访问生产私人数据、未调用模型、未变更生产服务或微信安全设置。

## 图片调用方式

- `c010f02` 的 `utils/dish-image.js` 统一了原有封面处理，补充空白值和迟到失败事件处理，没有新增 HTTP 转 HTTPS 的约定。
- `eabcc05` 的 `compact-dish-row` 以及最早正式仓库提交 `28c21b0` 的详情、推荐结果代码，已将 HTTP 封面改为 HTTPS。最近的图片圆角与占位改动没有替换图片来源。
- 读取本地产品调研源导出的 `food_import.csv` 与本地正式发布产物 `catalog/recipes.csv`：各 6,665 行，封面字段均为 HTTPS，cp1.douguo.net 6,580 条、cp2.douguo.net 85 条、空白 0 条。这是文件核对，不是当前线上数据库全量核对。
- 详情的步骤图片是一个历史例外：`stepImagesFlat` / `allStepImages` 在 `stepImagesList` 的协议转换之前生成，WXML 使用前两个数组，实际地址保留原协议。旧版也如此。本轮没有改变该行为，不能仅凭这一点断言它就是用户此前“警告但能显示”的原因。

## 证书与显示状态的证据边界

已有本机和阿里云只读证据表明，抽查的 cp1、cp2 HTTPS 样本当时返回的证书域名与请求主机不匹配。此前隔离微信项目与本机正式项目均配置 `urlCheck:false`，该 cp1 样本仍触发图片加载失败；此观察不是本次开启安全校验引起。

证书样本不能替代所有真实图片、缓存、网络节点和设备的显示验收。源码原本支持有图优先与失败占位，合成夹具中的 `image:''` 也不代表线上数据缺图。此前抽样应表述为“确认这些样本当时有问题”，不能升级为“所有图片都不可用”。

本轮未通过 HTTP 降级、关闭 TLS 检查或强行替换域名处理图片；外部图片不影响选菜与查看文字做法。有图成功显示时保留圆角，缺图或实际加载失败时使用分类简笔画。

## 有限预加载缺图修复

定位到 `/dishes/lite` 的 `DishMapper.selectDishesLite` 没有查询 `IMAGE`。因此 `app.precacheDishes` 写入公共菜库缓存后，旧版缓存/离线推荐无从取得原本存在的封面地址。

本轮仅在该投影补充 `IMAGE AS image`。原有系统菜和已发布过滤、参数化类型/关键词、SQL LIMIT、服务端 500 默认值与 1,000 上限保持不变；没有添加步骤图片或其他大媒体字段，也不查询私人菜。

当前 V4 首页和结果使用 `meal-workspace-page`，候选查询与按 ID 查询已包含 `IMAGE`；菜谱浏览使用完整分页接口。故这个修复补齐旧版预加载路径，不能作为“V4 所有照片加载失败”的根因证明。

## 验证与限制

- Java 新增测试先在修复前复现 `lite` 缺少封面投影的失败，修复后 `CatalogQueryPerformanceTest` 7 项通过。测试核对真实 MyBatis BoundSql、保留有限/隐私查询契约，并核对查询结果通过 JSON `image` 字段交付。不是线上 MySQL 集成测试。
- 前端 `catalog-environment-cache.test.js` 10 项通过。新增测试使用实际 app 预加载、全局缓存、持久缓存、`getAllDishes` 处理与离线 flow，验证封面地址在这些边界不丢失；数据与传输为隔离夹具，不调用真实 API。
- 新的本机 HTTP/HTTPS 原生对照尚未完成：网络请求受到 Windows socket 10013 限制；官方 CLI 开启既有隔离项目时，被微信工具 `Default/.cli` 写权限 EPERM 阻止。退出码 0 不视为成功。
- 前端线上更新、小程序提交审核与正式发布继续暂停。

旧样本与原生证据位于工作区 `work/dish-images-20261010/` 和 `work/backend-refresh-20261011/image-certificate-result.json`。本轮 Java 定向检查使用独立输出 `work/image-history-audit-20261011/`，不覆盖被本地进程占用的运行包。
