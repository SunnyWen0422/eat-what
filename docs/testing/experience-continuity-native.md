# E18 原生与无障碍验收

新增 `scripts/acceptance/experience-continuity-native.cjs`，强制 `--mode fixture|service`。默认字号为 1/1.3/2，默认请求宽度 390；`--width 320|390|430` 必须与 SDK 实测 `windowWidth` 一致才记录该宽度覆盖。没有通过 CSS 缩放、修改 systemInfo 或截图数制造通过率。

fixture 在新导出中屏蔽全部网络、真实存储及页面生命周期，只用于合成排版。service 由 `experience_continuity_native.py` 调用 E17 的完整 preflight 与 owned_runtime，创建新 MySQL、Java、Python、合成账号和固定公开菜库；生命周期保留。仅允许本次 literal loopback API，请求不得转向生产。原始 App 登录链路保留，但本地 `local-v4` 登录及测试签名身份不属于原始微信 SSO。手机自测的服务始终为 mock。

入口需要本机既有 Python、SDK 与官方 CLI 路径，通过 `--python/--sdk/--cli` 或对应 `CODEX_PYTHON/EATWHAT_NATIVE_SDK/EATWHAT_WECHAT_CLI` 提供；不自动安装。官方 CLI 仅开启当前新导出的 automation，固定端口被占用即拒绝，不接管原项目或关闭未知项目。service 每个字号使用全新导出，模块加载前固定 base-info 字号；完成后仅关闭已核验 runId 的本任务窗口。每次导出包含递归组件、源清单、override 后文件哈希与 appFingerprint；连接后再校验 runId/mode。输出目录必须全新且在仓库外。

```powershell
node scripts/acceptance/experience-continuity-native.cjs --mode fixture --out $NativeFixtureEvidence --python $Python --sdk $Sdk --cli $Cli --width 390
node scripts/acceptance/experience-continuity-native.cjs --mode service --config $ExperienceConfig --out $NativeServiceEvidence --python $Python --sdk $Sdk --cli $Cli --width 390
```

可用 `--cases recommend-filter,meal-cooking` 做定位；正式结果必须说明筛选范围。`--prepare-only` 仅导出，不产生测试通过。`--remote` 仅在 service 导出调用官方远程调试；二维码出现不代表手机已连接，连接也不代表手机可访问电脑回环服务。网络与合成身份必须额外验证，不能扩大安全设置。

结果登记全部 27 路由、6 管理页的管理员与普通角色，以及正常/加载/空/失败/权限/已完成/未保存/未知八状态。每个未运行项保留原因；不适用仅用于没有对应编辑或写入语义的页面。普通角色管理页只验权限边界，不注入管理员私有内容。`measured` 是几何检查，无内容/无测量为 blocked，小于 44 触控或 48 主按钮/横向超界为 failed；截图需要语义检查，不自动升级整页或状态为 passed。字号仅在冷启动前通过导出专用 base-info 适配器固定，不能在 onLoad 强制覆盖页面数据（Page 注册和管理权限快照会缓存初值）；原始生命周期继续执行，每个页面实际数据及 computed font-size 必须匹配请求字号。这只证明该字号下原生排版，不能代替产品随系统字号变化的真实响应和读屏验证。

E05 原生 chip 移除、E09 ui-card 插槽步骤锚点/食材弹层、E10 当前目标与历史回执、E13 系统返回与中文 IME 必须分别登记实际操作；已通过的 Node 行为合同不能代替原生或手机证明。A/F 设计源、照片与失败占位、14/18 圆角不由本工具修改。

人工清单见 [设备验收](../../scripts/acceptance/experience-continuity-device.md)。原生服务、夹具、实际 Android、实际 iOS、真实模型为独立结论。未具备的项保留 blocked/not-run，不声明 E18 全部通过。

本次最终指示为取消手机扫码、仅在开发者工具调试。已清理扫码专用 owned MOCK 栈，没有手机操作证据；保留官方二维码曾出现的历史观察，但该入口已停止。显式 --remote --remote-ui 仅提供人工官方入口的有界等待能力，不会默认启动；本次取消后未再使用该入口。

结果使用三个独立分母：主矩阵为 33 个路由/角色组合 ×3 宽度 ×3 字号，共 297 次页面观察；状态注册为每个路由/角色组合的八种状态，未实际触发仍为 not-run；具名交互按实际事件和观察分别记账。几何 measured、截图、状态注册及交互不能合成通过率。日志页的空态与确认清空后的完成态属于适用的本地 UI 状态。

使用 `--manual-confirm` 只为专门的 320/font2 副本取消用例保留人工确认窗口，其他版面采集不打开弹窗或等待无人操作。费用末项先滚到实际最大位置，测量最后按钮与当前页面固定底栏，再通过官方元素 tap 核对展开状态。每个路由重新读取真实宽高；主矩阵之后的局部修订只重验受影响页面，并用源资源哈希说明哪些旧观察仍适用，不能把旧 sourceSha 的全部观察改称最终 HEAD 通过。

远程模式仅生成官方调试二维码，导航栏明确“合成验收·助手替身”。连接后必须实测 Android 平台，并从该远程上下文向新 owned 服务读取签名合成账户；未成功即停止服务验收，不改网络安全项。通过读请求也只表示入口可用，中文输入法、系统返回、读屏等仍需用户实际观察。二维码或工具连接不能替代这些证据。

`--assistant-cards` 仅适用于 service：用公开菜和真实 MOCK 链路准备当前餐、已明确确认并实际落库的历史计划回执，以及另一日期/餐次的未确认预览。原生从现有历史入口加载，测量卡片、目标和确认控件滚达；不点击新预览的确认。历史准备的写入与新预览前后不变的 DB 数量分别记录，不能把预览称为保存成功。

高度证据单独判定。每页保留 SDK systemInfo、原生 getWindowInfo 的纯数值、selectViewport.boundingClientRect 三种原始读数；工具版本若缓存 Tab 高度而非 Tab 原生 viewport 更高，两者不一致即 height blocked。不能挑选较有利值，不能用 CSS 或截图像素推定高度，也不把旧主矩阵缓存的 windowHeight 追记成逐页实测。实际宽度、独立 computed 字号、原生 bbox 及末项相对底栏的位置仍可在其限定范围内登记；整页无遮挡和安全区结论保持未验收。

助手组件在本机官方 SDK 中暴露注册路径 `components/assistant-card/index`，选择器须转义斜杠；WXML 别名可能返回空集合。选待确认卡还须核对 active，历史已失活的预览不能替代当前预览。当前餐操作后直接测标题是否进入消息 viewport，不能要求滚动事件后仍保留临时 scroll-into-view 值。聊天输入框的显式 placeholder 字号已原生观察；其他表单仅使用共享 placeholder-class 的占位文字尚未逐一验证，不能据此宣称所有表单均跟随大字。
