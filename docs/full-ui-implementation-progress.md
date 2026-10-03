# Eat-What V4 深绿版实施与验收记录

> 更新 2026-10-03。对应已批准的 V4 主闭环与全量界面实施计划；沿用此前 V3 数据改造。本记录区分源码、自动验证、原生运行和发布。

## 当前结论

当前餐权威工作区、三餐规则、事务确认、采购/实际/回顾衔接、全量页面主题与公共控件已写入源码，两份 Markdown 已同步。V4 两端默认关闭，未 commit/push/发布。只有全部页面与内部功能的适用状态完成真机验收，才可宣布整体改造验收完成。

## 阶段状态

| 阶段 | 已交付与证据 | 剩余验收 |
|---|---|---|
| 0 固定基准 | branch/HEAD、tracked/untracked 可恢复快照、原46项回归；25页清单 | 已固定，不覆盖原改动 |
| 1 视觉基础 | 深绿单源 Token、15公共组件、36图标+4选中变体、5类SVG/PNG、25页字号/触控规范；资产联系图查看；原生编译 | 典型页面运行视觉重量及设备适配 |
| 2 后端工作区 | V4迁移、三契约、认证/归属/CAS/幂等、任务/租约、事务确认、早餐场景、事件和常用人数；隔离MySQL验证 | 真实Agent效果与限流 |
| 3 主闭环 | 今天/选菜/结果/助手共用工作区、草稿恢复/冲突/未知请求；三餐真实HTTP计划→采购→实际→回顾 | 原生页面端到端、两台真实设备恢复 |
| 4 全量迁移 | 个人/资料/收藏/自定义/偏好/筛选/同步/管理/日志/旧入口源码接入；25路由结构与绑定检查 | 逐页小功能、权限、异常、返回真机证据 |
| 5 发布验收 | 自动化、真实DB/HTTP、原生编译、审查修复、深绿基线和两份文档 | iOS/Android全状态、稳定基础库、早餐人工审阅；未发布 |

## 最新验证

最新验证（2026-10-03）：Node **36**、Python **13**、Java 普通回归 **35**，合计 **84**；另有真实 MySQL 事务 **4** 与本地 Spring Boot HTTP **1**，共 **89** 项，失败/错误/跳过均为 0。Java `test package`、JSON/JS/Python 语法、25 路由结构/事件、四份迁移 manifest 校验通过。官方编译器通过 **41 WXML / 43 WXSS**，135 个生成文件重建无变化，`git diff --check` 通过。

真实迁移/接口证据：`.mysql-test-data/v4-0a819a3bb9/result.json`；反馈 SQL：同目录 `feedback-metrics.json`（人工测试三餐场景，非生产接受率）；原生编译：`.mysql-test-data/native-v4/native-compile.json`；统一日志：`.mysql-test-data/final-verification.log`。可随代码审阅的汇总见 [验证记录](./v4-validation-evidence.json)。原始本机测试目录已忽略，不进入 Git/小程序包。 另有真实 JVM 崩溃/重启恢复检查通过，证据为 `.mysql-test-data/v4-0a819a3bb9/restart-evidence.json`（推进隔离 fixture 的租约年龄31秒，两个进程PID不同，版本1→2）。

**未执行：**开发者工具原生运行交互、iOS/Android 25 页全状态验收、两台真实设备恢复、真实模型效果/P95 测量、早餐产品审阅、稳定基础库固定。没有生产访问、推送或部署。

当前本机环境：Node 22.13.1、Python 3.13.2、JDK 8u202、Maven 3.6.3、MySQL 8.0 安装、官方 wcc/wcsc。私有数据库随机端口/目录/凭证，仅绑定回环，结束停止私有进程；未停止既有 MySQL80 服务、未使用业务库。

## 本轮审查与修复

- 旧通用 API 在网络退避后跨账号重试：每次发包重新检查原身份；Node VM 原触发路径红→绿。
- 原文字不变但结构化忌口移除：context PATCH 无条件清除文字理解标记，select/confirm 重新校验；新增精确回归。
- 原菜单名与新菜品配方混写：保存 reviewed 快照、确认时完整 FOR UPDATE 当前读。
- RR 并发窗口：真实双连接在 workspace snapshot 后编辑菜品；旧实现未拒绝（红），当前锁读检测变更（绿）。上述三项 Important 经独立只读审查复核关闭。
- 首次购物空 version：明确为0，真实三餐采购与回归通过。
- Spring Boot 首次完整启动暴露同名 health bean 与多构造器注入：保留健康名称，标注实际注入构造器，真实HTTP启动通过。
- 保守规则降级：仅已解释且上下文未变的限制可复用，锁和条件仍由 Planner 校验；未知要求进入 needs_input。非法 suggestedTarget 直接走 execute 回归，planner 不调用，保留原方案。
- HTTP IT 结束关闭 Spring context，避免缓存 scheduler 抢占手动事务 fixture 的租约；被测HTTP任务本身仍使用真实scheduler。

首轮与追加审查为限定范围，不把它描述为完整安全审计。实际完成统计用当前 actual，反馈SQL已经用三餐测试数据检查去重；不进行偏好训练。

- 按计划确认实际：使用服务端审核的计划菜名/分类快照，legacy兼容原查询；菜库修改后的单测红→绿及真实HTTP路径通过，独立复核未发现阻断。
- JVM恢复：两个真实Java进程，终止第一个后在第二个进程恢复持久化任务；隔离任务租约年龄推进31秒，新租约与新版本正确。

## 文件与复现

- [前后端详细设计](./eat-what-agent-fullstack-detailed-design.md)：架构、契约、25页/内部功能/状态、API、验收。
- [开发者改造说明](./eat-what-developer-change-guide.md)：现状、原因、流程、接手、启用与回滚。
- [机器可读验证汇总](./v4-validation-evidence.json)。
- `docs/baselines/`：外部两份文档的深绿实施副本，顶部明确采纳决策，原件只读。
- `scripts/verify.ps1`、`run_mysql_integration.py`、`check_native_compile.py`、`build_ui_assets.py`。

两份主文档同步到任务目录 `outputs/`，旧输出保留在 archive。当前API地址仍为原配置，测试/启用须选测试API并完成测试库迁移。回滚保留兼容V3/V4后端与数据；数据库恢复审核备份，不删除快照/回执。
