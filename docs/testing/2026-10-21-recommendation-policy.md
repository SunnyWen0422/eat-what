# 推荐策略实施记录

基线：`1454eb19ef7684e0630bf6f6ef143bb5ae1ffea5`，开始时现有工作分支干净。规格为用户确认的“合口味、能换新、不被收藏绑住”方案。以下结果对应本次基线之上的实现（验收时未提交），产品规则维护在[推荐策略](../recommendation-policy.md)。

范围：小程序、Java 推荐/工作区/行为记录、Python 助手协议；独立网页与生产环境不在本次实施范围。
保留：身份隔离、版本冲突、幂等、撤销、原请求恢复、保存计划与实际用餐分开。验证使用合成数据及隔离替身，不调用真实模型。

## 实施与验收

1. 概率选择、收藏独立性、软硬条件、持久轮换；验证固定种子模拟、类别耗尽、重复名称、明确限制。
2. 首页和助手共用服务端选菜；验证真实 Java/Python 序列化、上下文、动作校验及旧协议兼容。
3. 行为学习及清除入口；验证展示归一化、门槛、衰减、上限、去重、撤销、账号隔离。
4. 定向回归、后端打包、跨层与最终差异审阅；数据库使用新建私有实例，供应商、原生设备及上线验证分别列明限制。

## 状态约定

- 成功：工作区版本写入与轮换/反馈在同一事务完成，回执来自既有请求记录。
- 失败/取消/过期：未提交的推荐不消耗轮换；旧菜单及用户输入保留。
- 结果未知：使用原请求查询，不生成替代写入；同一请求重放不追加反馈。
- 并发/晚到响应：用户锁与工作区版本先校验，不接受旧结果。
- 部分完成：生成成功已记录轮换；后续日历/采购失败不重新生成，已完成动作保留。
- 退出/重启/换入口：服务端同账号、日期、餐次工作区保留轮换；撤销菜单不回滚已见菜品记录。

## 实施日志

- 使用正式仓库的现有干净分支；沿用本次批准方案，不另建重复审批计划。
- 初始参数按用户方案版本化；普通正向偏好与明确限制使用不同字段，旧客户端保留原字段含义。
- 两阶段均已实现：先完成收藏脱钩、概率抽选、本餐响应与工作区轮换，再接入类型明确的行为反馈及清除入口。
- 模型仅解释意图；自动生成/调整交给 Java 统一选菜。Java → Python ASGI → 模型替身 → Python 响应 → Java 校验和工作区动作采用真实序列化边界，没有用 Java/Python 两组孤立测试冒充贯通。
- 复审修复了：整餐时间可行性、跨类别同名候选、跨轮次剩余新菜、同名不同版本的偏好命中、保留菜离开候选范围、旧硬限制可见性、首次旧工作区助手替换、部分条件合并、反馈撤销版本关联和重新生效后的工作区归属。

## 验收结果

| 用户验收目标 | 证据与结果 |
| --- | --- |
| 收藏独立性 | `RecommendationFavoritesRegressionTest` 验证分数不变；私有 MySQL 的 `MealWorkspaceHttpIT` 使用真实收藏表、同候选/偏好/随机种子，仅改收藏，结果完全一致 |
| 100 道连续轮换 | 每次选择后通过真实 JSON 序列化重建工作区，前 100 次均不重复；第 101 次可进入下一轮 |
| 分类轮换及同名版本 | 不同类别独立耗尽，跨类别同名不能重复占位；一餐跨轮次优先剩余新菜；同名可用偏好版本不漏选，不让重复版本增加抽选机会 |
| 本餐响应 | 有可行新候选时回应至少一道；偏好已轮完时先换其他新菜并说明；明确限制仍优先，无法完成整餐的偏好不假装满足 |
| 概率与探索 | 20 道合成候选，10 道命中一类长期偏好，种子 17，独立抽选 6,000 次：偏好命中 3,266 次（54.43%），覆盖 20/20；不将该比例作为线上承诺 |
| 权重边界 | 同维度标签不叠加、当前偏好覆盖同类长期偏好、期望用时只计一次、未知中立、常见调味料不算主料、主动维度免受学习反向调整 |
| 计算量反例 | 50,000 道合成候选并带硬用时的策略测试通过，末次本机耗时约 0.854 秒；只说明该隔离用例，不代表线上端到端耗时 |
| 学习正确性 | 冷启动、9 次展示、仅 2 道菜、单日均中立；达到门槛后轻微生效；30 天衰减、90 天窗口、上下限和机会归一化通过 |
| 不应学习的行为 | 收藏事件被忽略，没有对应展示的采用不学习；重复事件不累加；整套换菜没有长期负反馈；只在成功单独替换后记录弱负反馈 |
| 清除与撤销 | 私有 MySQL 验证并发去重、事务回滚、撤销及重编号、反馈重新生效后关联新工作区；重置只清当前账号，重放旧重置不清后来反馈 |
| 页面状态 | 前端验证清除取消不发请求、未知结果重试复用 requestId、晚到账号响应隔离；收藏范围/旧硬条件可见，取消只在应用后写回 |
| 兼容与助手 | 旧请求硬筛选含义保留；协商后长期用时进入软条件；实时能力未确认不启用新语义；推荐不交给模型指定 ID，点名选择仍要求已读取的真实引用 |
| 成功与失败边界 | 成功发布轮换与反馈；重放/取消/晚到版本不重复消耗；首页解释局部修改不丢未改偏好或其他维度硬限制；既有原请求恢复回归通过 |

## 检查清单与数量

均为实际执行且无跳过的相关检查，不是全仓全量验收：

- Java 定向回归 **188 项通过**，其中策略 19、跨 Java/Python 边界 2、学习 5、工作区推荐集成 4；还覆盖助手动作/上下文/请求、工作区规则/服务/取消/调度、质量与证据。
- 前端 Node 定向回归 **54 项通过**：推荐策略/证据、工作区、助手上下文与设置、偏好/账户隔离及新增控件行为。
- Python 隔离回归 **39 项通过**：助手 step 33、balanced 协议 3、首页 workspace_agent 3。
- 全新私有 MySQL **8 项通过**：学习 3、工作区数据库 4、HTTP/收藏链路 1。独立数据目录、随机数据库与环回端口，只加载合成夹具；完成后只关闭本次创建的进程。未连接既有数据库。
- 变更 Python 编译、JavaScript 语法检查通过；迁移清单校验通过（13 个正式增量条目）；`git diff --check` 通过。
- 后端 `-DskipTests package` 成功。Java 运行环境曾输出一次启动环境的 `Access is denied.`，但本次实际 Maven 退出码为 0、XML 测试报告无失败且产物已生成，未把该提示误报为构建失败。
- 独立只读审阅通过，无未解决 Critical / Important 问题；审阅覆盖最终硬标签分组与反馈重激活关联修正。

## 复现入口

在正式仓库使用隔离运行环境，路径及本机依赖位置按实际设置；不要加载生产 `.env` 或使用真实供应商凭据。

```text
Java: mvn -f backend/pom.xml -Drecommendation.python=<隔离Python绝对路径>
      -Dtest=BalancedRecommendationPolicyTest,BalancedRecommendationBoundaryTest,AssistantWorkspaceActionTest,Recommendation*Test,MealWorkspace*Test,AssistantV4ContextTest,AssistantV4TurnServiceTest,WorkspaceQualityReadScopeTest,V4RankingContractTest,WorkspaceAgent*Test,WorkspaceTask*Test,ExperienceStageInstrumentationTest test
Node: node --test tests/recommendation-policy.test.js tests/recommendation-evidence.test.js tests/meal-workspace.test.js tests/assistant-context-summary.test.js tests/assistant-meal-settings.test.js tests/preference-scope.test.js tests/workspace-page.test.js tests/meal-feedback-preference-scope.test.js tests/recommendation-controls.test.js
Python: python -m unittest discover -s tests -p test_assistant_v4_step.py
        python -m unittest discover -s tests -p test_balanced_recommendation_contract.py
        python -m unittest discover -s tests -p test_workspace_agent.py
MySQL: python scripts/run_mysql_integration.py --mysqld <mysqld路径> --maven <Maven路径> [--maven-repository <专用缓存路径>]
```

`BalancedRecommendationBoundaryTest` 需要显式给出隔离 Python 路径；本次两个参数化用例均已执行，没有因缺少该参数而跳过。

源码证据：将本次 Git 变更及未跟踪文件中的非 `docs/` 文件按路径排序，逐个计算 SHA256，组成小写 `hash + 两个空格 + 相对路径 + LF` 清单，再对 UTF-8 清单计算 SHA256。62 个源代码/测试/迁移文件摘要为：

```text
566a74eb755f0e729cdda08bd55dc28fbac6f69a6a1c8e13ed037eb5222baf85
```

本机验证 JAR `eatwhat-backend-1.0.0.jar` SHA256：

```text
c51af7afb2aa327850957a4edcbf0377b8d46ef21949d2f7f5dd6fa869a52dfb
```

产物只用于本机验证，不包含在源码提交中；上述证据不证明线上正在运行该包。

## 未覆盖与发布前置条件

- 未调用真实模型，不宣称所有自然语言表达都已被正确解释；贯通验证使用受控模型响应。
- 未进行微信真机交互验收、线上容量测试或生产迁移/部署；独立网页未修改。
- 发布前必须先备份并应用 `V8_40`，再启动新 Java 服务；学习记录与定时清理依赖新表。Python 的 `balanced-v1` 能力也须先部署或协调切换，之后验证能力与共享工作区，再发布小程序。
- 以上验收在提交前完成；提交与推送结果以 Git 历史和对应远端分支确认为准，推送代码不代表已执行线上迁移或发布。
