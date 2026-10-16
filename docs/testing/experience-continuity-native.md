# E18 原生与无障碍验收

新增 `scripts/acceptance/experience-continuity-native.cjs`，强制 `--mode fixture|service`。默认字号为 1/1.3/2，默认请求宽度 390；`--width 320|390|430` 必须与 SDK 实测 `windowWidth` 一致才记录该宽度覆盖。没有通过 CSS 缩放、修改 systemInfo 或截图数制造通过率。

fixture 在新导出中屏蔽全部网络、真实存储及页面生命周期，只用于合成排版。service 由 `experience_continuity_native.py` 调用 E17 的完整 preflight 与 owned_runtime，创建新 MySQL、Java、Python、合成账号和固定公开菜库；生命周期保留。仅允许本次 literal loopback API，请求不得转向生产。原始 App 登录链路保留，但本地 `local-v4` 登录及测试签名身份不属于原始微信 SSO。手机自测的服务始终为 mock。

入口需要本机既有 Python、SDK 与官方 CLI 路径，通过 `--python/--sdk/--cli` 或对应 `CODEX_PYTHON/EATWHAT_NATIVE_SDK/EATWHAT_WECHAT_CLI` 提供；不自动安装。官方 CLI 仅开启当前新导出的 automation，固定端口被占用即拒绝，不接管原项目或关闭未知项目。每次导出包含递归组件、源清单、override 后文件哈希与 appFingerprint；连接后再校验 runId/mode。输出目录必须全新且在仓库外。

```powershell
node scripts/acceptance/experience-continuity-native.cjs --mode fixture --out $NativeFixtureEvidence --python $Python --sdk $Sdk --cli $Cli --width 390
node scripts/acceptance/experience-continuity-native.cjs --mode service --config $ExperienceConfig --out $NativeServiceEvidence --python $Python --sdk $Sdk --cli $Cli --width 390
```

可用 `--cases recommend-filter,meal-cooking` 做定位；正式结果必须说明筛选范围。`--prepare-only` 仅导出，不产生测试通过。`--remote` 仅在 service 导出调用官方远程调试；二维码出现不代表手机已连接，连接也不代表手机可访问电脑回环服务。网络与合成身份必须额外验证，不能扩大安全设置。

结果登记全部 27 路由、6 管理页的管理员与普通角色，以及正常/加载/空/失败/权限/已完成/未保存/未知八状态。每个未运行项保留原因；不适用仅用于没有对应编辑或写入语义的页面。普通角色管理页只验权限边界，不注入管理员私有内容。`measured` 是几何检查，无内容/无测量为 blocked，小于 44 触控或 48 主按钮/横向超界为 failed；截图需要语义检查，不自动升级整页或状态为 passed。字号通过导出专用 base-info 和 onLoad 的 fontScale 数据适配器注入（Page 注册会缓存初始 data），原始生命周期继续执行，每个页面实际数据必须匹配请求字号。这只证明该字号下原生排版，不能代替产品随系统字号变化的真实响应和读屏验证。

E05 原生 chip 移除、E09 ui-card 插槽步骤锚点/食材弹层、E10 当前目标与历史回执、E13 系统返回与中文 IME 必须分别登记实际操作；已通过的 Node 行为合同不能代替原生或手机证明。A/F 设计源、照片与失败占位、14/18 圆角不由本工具修改。

人工清单见 [设备验收](../../scripts/acceptance/experience-continuity-device.md)。原生服务、夹具、实际 Android、实际 iOS、真实模型为独立结论。未具备的项保留 blocked/not-run，不声明 E18 全部通过。
