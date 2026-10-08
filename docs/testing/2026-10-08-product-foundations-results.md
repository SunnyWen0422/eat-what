# EatWhat 个人产品基础能力验证摘要

日期：2026-10-08。基线：`a7b866d323686ca73ddec7bd446f6f7fd9e4e59b`。

本轮交付个人菜谱与可复用菜单、实际饮食报告框架、受控 Java 工具执行的首个组合流程，并修复收藏可见性和旧助手确认恢复。只作为独立修复分支的草稿 PR 交付；没有合并、部署、连接生产或执行数据库迁移。

## 实现范围

1. 收藏新增使用带可见性条件的原子 `INSERT SELECT`；列表、状态、ID 查询统一采用公开且已发布或本人拥有的规则。其他账号的私菜、下架公共菜与不存在菜返回一致的不可访问结果。旧失效收藏可清理。
2. 保留手工私房菜，新增数据库菜的私人副本；编辑和删除携带内容版本，创建/复制/菜单使用稳定请求键与持久回执。只改菜名或时长不丢失原食材、步骤及步骤图片；步骤改变才清除失效图片。
3. 命名菜单保存顺序、人数、公开或本人菜品及快照。应用时绑定日期餐次、菜单版本和菜谱内容，重新验证后进入现有餐食草稿与确认流程。编辑模板不改写已确认计划或实际历史。
4. 实际饮食回顾提供概览、明细、重复、类别、计划执行、完整度六块，以及报告身份、范围、时区、生成时间、来源指纹、计算版本和缺失标记。报告是即时计算的内容版本，`persisted=false`，不声称已经归档。
5. Java 工具目录先实现 `read_current_meal`、`confirm_current_meal`、`read_actual_diet_review`。工作区提供服务器预览、用户确认、保存计划后查看同周实际回顾的入口；已完成步骤持久记录，部分失败只恢复后续步骤。
6. 保留旧 `SAVE_CALENDAR` / `CREATE_CALENDAR`：严格绑定确认字段，按持久回执重放，Python 授权成功不再被视为 Java 已执行。无第一方确认入口的旧修改/删除动作引导到现有日历或清单页面。

范围边界：没有改写 Python 模型运行路径，没有为模型接入任意跨模块工具，也没有实现任意复杂多 Agent 工作流。当前工具执行器和组合流程是真实前后端能力，更多自然语言工具接入仍是后续工作。

## 安全和兼容决策

- 单账号产品仍保留不同登录身份间的资源隔离，以及同一账号多页面/重复请求的版本保护。
- 计划保存不表示已经吃过；未记录不表示没吃；无可信份量和营养来源时不输出营养评分或占位热量。
- 旧 statistics 的计划数字保留原义，显式标记 `basis=plan` 和弃用状态；无来源的占位热量改为 `null`。
- 旧手工新增不传 requestId 的兼容入口仍存在，其重试保护较弱；新前端全部使用稳定请求键。个人编辑和删除要求配套的新版本契约，上线必须协调前后端版本。
- 新迁移 `V6_10__personal_menus` 与 `V6_20__controlled_harness` 已列入中央 manifest 并核对校验和。它们只追加结构和登记记录；执行迁移需要另行授权。
- 回滚应用界面时保留菜单、历史快照、版本与回执，不通过删除这些记录来消除冲突。

## 独立复审和修复

独立审查覆盖收藏/旧确认边界、新领域后端，以及前端页面与跨模块交接。发现并修复：

- 旧确认版本 `1.0` / `1e0` 与整数文本比较造成误拒绝；现改为严格整数数值规范化。
- 复制菜仅改名称/时长会丢失 rich 文本与步骤图；现保留未变内容。
- 数值分钟变化或清空后详情仍展示旧时长；现同步/清理旧字段并优先数值显示。
- 菜谱变化后菜单编辑仍复用旧快照，造成连续版本冲突；现读取最新可见内容供明确确认，缺失项保留并提示替换。
- 未知写入结果遇到 401/403 会清空原键，可能重复创建；现继续保留原请求。
- 菜单解析迟到后覆盖已切换目标并跳转；现绑定页面可见性、账号与目标。
- 已保留菜改变菜单应用顺序；现恢复菜单保存顺序。
- 任务结果未知未持久化，重进后被误标为待确认；现在请求发出前和未知结果后都保留状态，收到真实服务器结果才清除。
- 新菜单控件缺少既有触控目标和 placeholder 类；已按原 UI 合同修复。

## 验证方法与限制

最终共享源码验证：Node 前端 314/314；明确白名单的 Java 非模型领域测试 133/133，并完成 Maven 打包；跳过指定模型模块的 Python 回归 44/44。三个数量是各自完整选择集，不重复加算定向子集。

Python 44 项包括收藏 SQL 隔离复现、迁移 manifest、WXML 结构、源码触控/placeholder/对比度和生成样式一致性等检查。该运行禁止数据库、HTTP/socket 连接与非白名单子进程，仅允许隔离字体检查所需的 Node 进程。静态检查覆盖 57 个 JSON、121 个 JavaScript、61 个 Python 文件；Python 只编译，不导入或执行模型模块。

Java 仅使用下列显式测试名单进行最终整合，未使用默认选择：

`FavoriteDishVisibilityTest,AssistantConfirmationTest,AssistantActionServiceTest,AssistantHistoryTest,DietReportFoundationTest,LegacyStatisticsBasisTest,LegacyStatisticsContractTest,DietReportControllerTest,DietReviewCalculatorTest,MealConsumptionServiceTest,V4ActualHistoryContractTest,PersonalRecipeFoundationTest,ControlledToolHarnessServiceTest,ControlledToolHarnessControllerTest,MealPlanServiceTest,WorkspacePlanSnapshotTest,ShoppingExpenseLifecycleTest,V4ShoppingExpenseTest,V4ShoppingContractTest,ShoppingListReliabilityTest,ShoppingMutationServiceTest,AvatarImageValidatorTest,UserAvatarServiceTest,LocalV4LoginServiceTest`

必须保留的范围记录：一次早期隔离快照使用了默认 Java 套件，运行 105 项，其中包括 Java Planner / HttpTransport / Fallback 的模型相邻模拟测试。这是测试范围偏差，不计作暂停项目的正式验收，也不把 105 项全部称为非模型测试。随后所有 Java 执行均改为明确白名单。没有执行 Python 模型服务测试或调用真实模型/付费供应商。

未完成的验证：真实 MySQL/MyBatis 并发与迁移执行、生产数据库数据质量、微信开发者工具及 iOS/Android 真机、完整 Windows PowerShell verify.ps1。SQLite SQL 适配复现和 Spring 测试事务管理器可证明限定行为，不能替代真实数据库。前端 VM 与源码可访问性检查不能替代原生布局、键盘和触控验收。

## 发布前仍需授权的事项

生产迁移、上线部署、合并 PR、破坏性历史处理、新付费供应商或新增敏感数据传输、安全及凭据设置变更，均不包含在本轮执行中。独立分支与草稿 PR 不代表已上线或可跳过这些验证。
