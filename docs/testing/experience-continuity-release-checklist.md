# 连续体验候选发布检查单

本单状态 DRAFT。候选打包不是生产授权，deploymentAllowed 始终 false。以下现场步骤只有用户另行授权目标与影响后才可执行；本次没有推送、部署或上传。

|项目|当前边界|
|---|---|
|代码、应用与证据身份|检查 release-manifest 文件哈希、subject 和 evidence-index；旧报告只能在相同组件字节证明下复用，报告内部绑定必须匹配|
|应用组合|小程序/Java/Python/网页配对；能力关闭、旧后端和无法联网时保留原有入口及准确错误提示|
|结构|只包含现有迁移；按实际目标结构准备，不盲跑旧版本迁移，不删用户行或重建业务库|
|原生与真机|开发工具限定观察；Android 未运行、iOS 不可用，不能签署物理设备验收|
|模型|20/20 与补充 4/4 已封存；澄清成功和临时过滤预算中断分别列明|
|用户研究|blocked，0 人/40 not_run；36/40 与严重错误阻断门不变|
|性能|当前候选须保留 2 用户模式 ×2 数据规模 ×3 并发 ×300 秒的实际结果；延迟未达不得改门或隐去退出 2|
|任务与整分支审阅|由控制器独立执行；未审阅不算验收通过|
|生产与小程序发布|未授权、未执行，分别记录，不能由本地候选替代|

后续授权上线时，先重新核对宝塔目标、SSH/服务端口、运行目录、配置变量、Python 入口、公开白名单和数据库结构。备份当前文件、配置和数据库，验证可恢复性；对切换后合法写入建立对账安排。禁止沿用旧机器端口或旧备份作为当前事实。

暂停受影响写入后执行实际需要的兼容增量，逐步保留回执；失败时按真实结构续跑，不承诺 DDL 整体事务回滚。成组切换 Java/Python，核对认证、餐次、草稿、确认/幂等、采购来源、缺价/实付 0、实吃和复制，再决定网页及小程序独立发布。

发生异常先关闭新增写入口，恢复配套服务与配置；保留新增表、列、索引和合法写入。恢复数据库前必须核对切换后新写入，不能直接反向 DDL 或删除用户内容。此前 38 表恢复演练仅为历史受限副本证据，不能替代最新生产备份验证。

## 证据 manifest 合同

输入 JSON 的 schemaVersion 为 1，entries 为列表。每项具备 kind、status、sourceSha、subjects、artifactFingerprint、report、reportSha256、limits。artifactFingerprint 为按 key 排序、紧凑 JSON 编码 subjects 后的 SHA256。report 指向本地 JSON 报告，该文件 evidenceBinding 必须与该项的 kind/status/sourceSha/artifactFingerprint/subjects 一致。报告文件 SHA256 必须相等，引用路径和完整报告不进入候选。

subjects 的组件键为 mini、web、java、python、schema、resources、config、data；它们由实际打包字节计算。性能还必须包含 config:名称 和 data:名称，manifest 的 externalSubjects 将这些名称映射到实际本地文件，仅哈希进入索引。每种证据必须具备对应最小组件范围，不能只绑定文档或源码 HEAD。

允许的 kind：regression、browser、static-release、performance、native、usability、review。允许的 status：verified、partial、blocked、not-run、failed、performance-miss。全部 required kind 均 verified 才显示 evidenceStatus=verified，仍然 DRAFT 且不得部署；任何缺项或不完整结果保持 partial。无 manifest 为 missing。
