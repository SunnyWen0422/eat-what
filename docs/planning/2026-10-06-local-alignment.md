# 指定分支与本地开发对齐报告

核对日期：2026-10-06，Asia/Shanghai。本地源码目录为 `C:/Users/Administrator/Documents/Codex/2026-07-18/d-eatwhat/project`。

本地已切换并跟踪用户指定的 `codex/v4-meal-workspace-green-20261003`，HEAD 为 `c1525506035ca79f500d2665be0fbd01ea3d1ccd`。产品源码与此次获取的远端提交一致；本次新增文件仅为规划资料。本地旧进度完整归档，尚未适配到 V4 的功能列入后续任务，没有把旧实现强行混入目标分支。

## Git 比较和对齐结果

| 项目 | 对齐前 | 对齐后 |
|---|---|---|
| 分支 | `codex/main-integration-20260726` | `codex/v4-meal-workspace-green-20261003` |
| HEAD | `b8f9ce67956179d56837dd4dd6a9607df12ff4ce` | `c1525506035ca79f500d2665be0fbd01ea3d1ccd` |
| 共同祖先 | `a35e5f00d8c077c0c8996cf062e0a76b5bd9d551` | — |
| 与目标分叉 | 本地独有 6 个提交，目标独有 15 个提交 | ahead 0 / behind 0 |
| 未提交状态 | 36 个已跟踪文件修改，412 个未跟踪文件 | 旧状态归档；新规划文档未提交 |
| 提交树差异 | 689 文件，21,303 行增加、25,811 行删除 | 产品源码无差异 |
| 远端获取 | git fetch，并以 GitHub 分支接口核对 SHA | 两者一致 |

目标分支最新提交日期为 2026-10-05，内容是最终验证文档；其父 `173a148` 为最新产品代码提交。比较基于明确分支，不使用默认 main 代替。

本地六个独有提交如下，含两次构造器注入修复、助手菜单保存/目录缓存、草稿版本隔离/保存快照、最终响应预算/重试回显以及验收记录。这些是相对于目标分支的独有提交，不能一概称为“未推送提交”。

| 提交 | 主题 |
|---|---|
| `895a89a`、`a35c6e5` | Spring 多构造器注入 |
| `20e43d1` | 助手菜单保存和目录准备缓存 |
| `e134350` | 草稿修订隔离和保存快照 |
| `b5e446f` | 最终回复预算和重试回显 |
| `b8f9ce6` | 当时的验收记录 |

未提交内容共 448 个文件记录，其中 363 个属于 `outputs/`；其余 85 个源码/测试/文档文件中，27 个与目标同路径内容不同，58 个仅旧本地存在。这是文件存在/内容比较，不代表 58 项独立功能，也不证明相同语义没有在新文件中重写。

## 架构和功能差异

| 领域 | 旧本地进度 | 指定 V4 分支 | 对齐决策 |
|---|---|---|---|
| 导航 | 26 页、选菜/定制/助手/日历/我的 | 25 页、今天/菜谱/计划/我的 | 使用 V4，旧深链接兼容按现有适配验证 |
| 餐次状态 | 各入口草稿与隔离传递 | Java/MySQL 当前餐工作区，多个页面共用 | 使用 V4 权威工作区 |
| 日历和回顾 | 旧日历同步、来源与统计展示 | 独立 actual、计划墓碑、可信历史快照 | 以新口径为准，旧计划不当吃过 |
| 助手 | 流式回复、草稿修订、私有菜谱保存、多餐等旧实现 | V4 文本适配以工具返回真实菜品 ID 为主，四种只读菜品工具；旧多餐逐餐导入 | 把旧预算/版本安全规则转为契约；AI 创作与私有化能力需在 T13 另行评估，不能声称 V4 已等价实现 |
| 采购 | 来源汇总及未提交价格、实付扩展 | 版本化清单、来源/数量可信度、云端手动项和恢复 | 使用 V4 清单，价格实付在 T17 适配 |
| 语音 | 腾讯实时语音、会话接口和取消处理 | 无对应旧模块 | 保留归档，T18 接入新的同餐需求面板 |
| 界面 | 旧 CSS/组件和多次布局修复 | Token 源、模板、公共组件与 SVG/PNG 生成 | 使用 V4 管线；移植验收案例，不覆盖旧样式 |
| 菜系资料 | 本地加工规范、脚本和数据产物 | 不含此批未提交资料 | 保留原件，作为 T10 的离线审计输入 |
| 迁移 | V3 calendar_sync、V4 custom_dish_receipts、V5 assistant_recipe_provenance、未提交 V6 shopping_prices | V3 meal_workflow、V4 meal_workspace | A01 单独设计血缘桥接，禁止两套顺序混跑 |

另外核实：参考价格的旧代码有 `CALCULATED + PARSED + 非 userOverride` 等估算条件；旧测试覆盖 0 元实付与记账不自动勾选。语音文件存在录音所有权和取消逻辑。这些证明旧成果存在，不代表已适配 V4 或经过本次真实服务验收。

## 恢复材料

全部位于工作区外层的 [alignment-20261006](../../../work/alignment-20261006/)；没有上传远端。

| 材料 | 内容与验证 |
|---|---|
| `local-source-before-v4.zip` | 523 个跟踪文件和 412 个未跟踪文件的完整文件级备份，另含存在的本机配置；逐文件 SHA-256 校验与 zip 完整性检查通过 |
| `source-manifest.json` | 每个文件原始 SHA-256、大小、本地状态和目标比较 |
| `local-changes.patch` | 36 个跟踪文件的 binary patch |
| `local-history.bundle` | Git 全历史和 stash；`git bundle verify` 通过 |
| `preflight.json`、`pre-alignment-status.txt` | 原分支、提交、文件清单、比较与配置哈希 |
| `committed-differences.txt`、`local-only-commits.txt` | 提交树差异与六个独有提交 |

源码 zip 为 76,675,976 字节，SHA-256 为 `cc396c492497b0285fd54065ab9a37746ed7f6e50eb744196e3e693b54777630`。备份包含私有运行配置，仅用于本机恢复，不应提交、分享或作为发布包。

Git 中额外保留：

- 分支 `codex/archive-local-pre-v4-20261006` 指向旧 HEAD。
- 原开发分支仍存在。
- stash `a353f25e25bdbb512e2d59c0d63352d78418f061` 保存旧未提交内容，未 pop 或删除。
- 原有忽略文件留在原地，本次列出的 841 个可见忽略文件未清理；两个受权限限制的旧测试缓存目录未深入读取或修改。
- 本机私有配置对齐前后哈希一致，未以远端配置示例替换真实配置。

恢复旧状态应在单独的恢复目录/工作区使用旧分支及这个 stash，或解压源码备份后核对 manifest；不要把 stash 整包应用到 V4。本次不创建或执行恢复，以免覆盖当前基线或新规划文档。

## 本次实际验证

测试使用从目标 HEAD 导出的干净源码副本 `work/alignment-20261006/validation-tree`，不含本机 `.env`、私有 application.yml、旧 target 或会话库。验证后逐文件比较导出 zip，确认所有基线源文件未被测试改写。

| 检查 | 2026-10-06 本次结果 | 证据 |
|---|---|---|
| JSON、凭据标记、JS/Python 语法、迁移 manifest | 通过 | `verify.log` |
| Node 前端回归 | 184 通过，0 失败/取消/跳过 | `verify.log` 的实际摘要 |
| Python 回归 | 23 通过，0 错误/失败/跳过 | `python-tests.log` |
| Java 普通测试 | 58 通过，0 失败/错误/跳过，17 份新 XML | `validation-tree/backend/target/surefire-reports/` |
| Java 干净构建 | `mvn clean test package`，BUILD SUCCESS | `java-clean-test-package.log` |
| Java 交付字节码 | 所有主类 major version 52，符合 Java 8 目标 | `final-verification.json` |
| 基线与本机配置 | SHA/产品差异/配置哈希检查通过 | `final-verification.json` |

普通回归合计 **265 项通过**。Java 运行于本机 JDK 21.0.4，并验证产物 Java 8 字节码；这不等于在 Java 8 运行时完成了一轮部署测试。Node 为 24.15.0，Maven 为 3.9.11，Python 为本机 Codex 运行时 3.12.14。

原 `project/backend/target/eatwhat-backend-1.0.0.jar` 是 2026-09-23 的旧产物，已保留，不能当作本次 V4 构建。此次新包在隔离验证目录的 `backend/target/`。后续启动或发布应针对已审阅源码重新构建，并独立准备正确配置与数据环境。

统一脚本首次因 Python 缺少 CairoSVG 中断。按根因排查后，仅在本次工作目录安装 CairoSVG 2.9.1 等依赖，使用已有 bundled Cairo DLL，独立重跑全部 23 个 Python 用例通过。Java 沙箱运行因本地依赖 `AccessDeniedException` 失败；获准在沙箱外执行后，补齐缺失 Maven 测试依赖并干净构建通过。没有修改产品代码或删除测试来取得通过。

因此本次准确结论是“统一脚本前置检查和 Node 通过，后续 Python/Java 阶段以独立完整命令通过”，不是“统一脚本首次全绿”。[机器可读摘要](2026-10-06-validation.json)记录该区别；原始日志保留在恢复材料目录。

### 复现环境

在隔离源码副本中运行，路径按实际机器核对：

```powershell
$env:CODEX_PYTHON = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$env:PYTHONPATH = 'C:\Users\Administrator\Documents\Codex\2026-07-18\d-eatwhat\work\alignment-20261006\python-deps'
$cairoRuntime = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin'
$env:CAIROCFFI_DLL_DIRECTORIES = $cairoRuntime
$env:PATH = $cairoRuntime + ';' + $env:PATH
$env:MAVEN_ARGS = '-o -Dmaven.repo.local=C:\Users\Administrator\Documents\Codex\2026-07-18\d-eatwhat\.m2'
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

上述为补齐依赖后的复现方式，本次未再次重复完整驱动脚本；实际执行结果如上表。Java 的 sandbox 读取限制需使用本机正常权限，不能通过放开整个用户目录的 Git 信任或修改安全控制解决。

## 历史证据和本次未执行范围

仓库记录的 270 项包含历史普通回归 265 加隔离 MySQL 4 和业务 HTTP 1。此次只重新执行普通 265；MySQL、业务 HTTP、双 JVM 恢复、真实模型、微信原生编译/运行、双设备和生产发布都未重新执行。Java 普通测试中的本机 HTTP 传输小测试不等于三餐业务 HTTP 集成。

V4 两端默认开关仍关闭，API 默认地址仍是原项目地址；这不构成测试环境。此次没有向该 API 发业务请求，没有访问生产服务、运行数据库迁移、上传小程序或提交/推送 GitHub。

## 后续开发裁定

1. 以当前 `project` 中的 V4 为开发基线，使用[总方案](2026-10-06-development-roadmap.md)和[首批计划](../superpowers/plans/2026-10-06-v4-foundation-and-experience.md)。
2. 先修复环境可复现性、文档差异和迁移/兼容缺口，再修改当前餐体验。
3. 价格/实付、语音和旧助手行为按契约移植；没有适配验收前不宣称旧功能已进入 V4。
4. 此次新增规划文档保留为本地未提交文件，便于审阅；后续功能尚未开始实施。
