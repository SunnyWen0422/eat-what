# E17：跨流程故障与真实数据服务验收

2026-10-17，本地验收完成：**J01–J12 的分层合同12/12、四写路径故障20/20、既有数据库场景22/22**。这些数字分别属于服务HTTP/真实MySQL、页面代码隔离边界和桌面浏览器证据；**微信原生/物理设备为 not-run**。本任务只增加验收入口、合同、测试和文档，没有修改产品实现、迁移、数据质量、依赖或线上配置，没有推送、部署或外部模型请求。

## 安全入口与可复现命令

`scripts/run_experience_acceptance.py` 必须同时提供 `--config/--cases/--out/--stage database|journey`。复用 `maturity_runtime` 的严格字段、mock供应商、字面回环地址、专属数据库名称、全新仓库外目录、HEAD/JAR/构建源码/数据校验及自身Popen所有权规则。不得使用旧实例、生产配置或接管端口。`utils/config.js` 仍指向生产，runner不导入它；页面回归明确替换HTTP和平台边界，浏览器只允许自身回环静态资源并拦截API/外部图片/其他网络与WebSocket。

配置和数据库凭据留在仓库外；报告只写源/包/数据/配置摘要、专属库名称、动态端口、合成账号类别和运行目录/manifest摘要。所有业务写入只进入本次新建MySQL及合成账号，原公开菜谱快照保持6,665条，不清洗或改写源文件。

```powershell
python -m unittest discover -s tests -p test_experience_acceptance_guards.py
python scripts/run_experience_acceptance.py --config $ExperienceConfig --cases scripts/acceptance/experience-continuity-cases.json --out $ServiceEvidence --stage journey
python scripts/run_maturity_acceptance.py --config $ExperienceConfig --stage database --out $DatabaseEvidence --maven $MavenExecutable --maven-repository $MavenRepository --rehearsal-backup $RehearsalBackup --rehearsal-receipt $RehearsalReceipt
```

`--stage database` 也可通过新入口调用既有数据库runner并生成相同字段的外层receipt；缺少R01时保持 `not-run`，不会将21/22改称全绿。源JSON是 `requirements_not_results`，全部初始 `not-run`；输出场景都有 `id/steps/assertions/sourceFingerprint/status/evidence/limits`，仅接受 `passed|failed|blocked|not-run|not-applicable`。

本次使用Python3.12、Node24.15.0、JDK21.0.4（Java目标8）、锁定Playwright1.64和本机Chromium。后端产品字节没有变化，沿用通过匹配receipt验证的E16候选，不重建无变化的运行包；新的Java IT在全新仓库外输出目录编译执行。Maven既有Connector/J坐标迁移warning仍存在，不能称输出完全无警告。

## 每个旅程的实际证明层

最终机器报告为仓库外 `work/experience-continuity-plan-20261016/worker-task17-journey-source-identity/report.json`；同目录包含各 `Jxx-pages.tap`、`J11-browser.json`、截图与私有运行日志。表内Node数量按旅程引用的测试文件计数，共用文件会重复运行，不代表不同的真实用户任务数量。

|旅程|服务/数据库证明|页面代码或浏览器证明|本次状态及限制|
|---|---|---|---|
|J01 首次生成保存|生成、保留、保存目标唯一；没有实吃写入|Node6项|passed；平台/HTTP为替身|
|J02 跨日换菜|跨日午餐目标、单菜更换仍保留锁定菜|Node19项|passed；未证明原生导航|
|J03 筛选选菜返回|本行不宣称真实HTTP交互|Node5项，真实页面/模块代码|passed；筛选/交接边界为隔离夹具|
|J04 复制取消/未知|编辑保存仅创建1份；来源下架后原请求仍返回原副本|Node12项，取消和重启恢复|passed；系统原生弹窗未验|
|J05 采购部分选择/撤销|餐次与食材来源持久化；实付0合法、缺参考价仍缺失|Node118项，来源选择/撤销/未知恢复|passed；无真实商店入口验收|
|J06 做法中断继续|本行不宣称Java能证明阅读位置|Node11项，真实阅读代码/版本隔离|passed；平台存储与viewport为替身|
|J07 助手部分成功|真实确认保存后采购版本冲突；JVM重启后原turn仍有保存receipt，采购未完成|Node19项，原对话恢复/剩余输入/交接|passed；模型由本机替身提供|
|J08 长期偏好明确保存|本行不宣称偏好HTTP事务已实测|Node26项，真实设置页/偏好store/交接|passed；取消、显式保存与账号边界在隔离HTTP中验证|
|J09 弱网恢复|原保存请求重启后可查；四路径的真实断连与重试见故障表|Node18项，实吃/复制未知请求恢复|passed；原生网络提示未验|
|J10 账号/API切换|其他账号不可读计划、助手历史；11类读取能力握手|Node28项，缓存/代次/账号/API隔离|passed；未登录真实微信账号|
|J11 网页重启/恢复|Java结果不用于证明IndexedDB|Chromium1项：关闭浏览器进程、同全新profile重启、取消恢复、真实IDB事务abort与同请求重试|passed；桌面浏览器、合成个人菜，非微信同步|
|J12 混合日历/删计划后实吃|真实删除计划后实吃revision/原快照逐值保持|Node36项，混合日/目标/读取优先|passed；未验真实设备日历手势|

## 四种写入的五类故障

日历、采购、实吃、复制各覆盖五项，共20项；每条receipt保留原 `requestId` 和持久身份摘要。提交前以**本次专属库临时BEFORE INSERT触发器的SIGNAL**造成真实Spring事务回滚，检查对象和该原请求回执均未出现，随后删除触发器；这不是产品测试接口或持久迁移。

提交后响应丢失使用仅监听回环的一次HTTP relay：上游200及响应读取完成后关闭客户端连接，客户端实际收到断连，再用完全相同的请求核对。断连、重复、JVM重启和409冲突均检查原对象数量及身份不变；检查日历目标/菜ID、实吃目标/快照、采购菜ID/餐次/行号/形态/原量、复制ID/内容。成功对象的**精确增量**分别为1条计划、6条本次所选采购食材、1条实吃、1份副本；每个原request的成功回执恰为1条，其他路径增量为0。采购6条是本次真实公开菜选择所得，并非固定产品数量。

真实MySQL IT为 **16/16、0失败/错误/跳过**：既有过滤分页Spring事务3、实吃事务8、任务取消/claim5。新加3项分别证明queued并发争抢仅一方成功、expired-running并发恢复仅一方成功，以及过时queued快照必须经expired分类回收、旧lease不能finish且终态不可再claim。沿用真实mapper和独立连接，无mock CAS或新增生产hook。

## R01：旧匿名备份的受限恢复

本次找到了原专属本机演练产生的合法成对文件：`.local-maturity-active/rehearsal-backup-da8090a6.sql` 与同目录 `restore-rehearsal.json`。原receipt为PASS，`backupFile`对应且SHA256匹配。沿用原有checksum/路径/schema/所有权防护，创建新schema及仅能写该schema的新账号恢复。

**R01 PASS**：38表、59,885行的全部row-multiset哈希逐表一致，新增4张空助手表，索引中断续跑及重放通过，业务行未变、原备份未变。原备份SHA256 `2717293a6e20517011c167215e0f084b277e5ad5381ae13ee85c455ba44d0495`；配对receipt SHA256 `cbd8d893c71227bbce0d4467a934c11bf9c068cd5cfa389a00a9be23dfc2dfd1`。这证明旧匿名本机备份的隔离恢复，不是新的生产导出、灾备切换或生产升级验收。

数据库机器报告 `worker-task17-database/report.json` 实际 **22/22**；`synthetic/transaction-java/surefire-reports/`分别记录3/8/5项IT。旧R01缺失时的21/22历史没有被覆盖或重新解释。

## 源码和证据绑定

服务配置校验的HEAD为 `dc91331b86d15424ad19cf8712150babbace7752`，运行包来源为E16已验证产品实现；本任务新增验收源码按下列文件摘要绑定，不能把旧HEAD当成本任务新增测试已存在的证明。本次提交保存这些验收文件，后续E20仍需按最终候选重新绑定。

|对象|SHA256|
|---|---|
|候选JAR|`276291871758bbeda4e4c202c9280e0af4803445886c0b1076b04ab17729c7e1`|
|构建产品源码指纹|`9cc86636083e25db5e47b5b8df990cd731664d67e697c20f6c28daf220770ee9`|
|公开6,665条固定数据|`2fd26f74c7fcec668265d45d2d1230769838855d9fe7e9db741e2f5f1624cab5`|
|本次私有配置|`5fcc03a98cff62ba1034e0b2a428855ef819f31630e7d568d89fe47efaab2315`|
|experience-continuity-cases.json|`67e3242525ccbbb4ee399f01fc50ddbd416adb1ca3cb5f8536072886552f66ca`|
|run_experience_acceptance.py|`fc27b4564c2cdc725855c397af62b4c3464439d7192c5fc9b06a77c7c64ccc55`|
|新增浏览器场景|`afb3b350c5095aae3e27c957982886ac29924b2846ce25ae395b057e3e19b19b`|
|任务取消/claim MySQL IT|`fadf1b3ab8a8c5cc41efbb424bd2cc11e280dd86f16c399dbf40c1d5e3d941af`|
|最终journey报告|`25eb91d362c694fa026b42b379a1aab633300e5654a3564c5bc6a694532b7834`|
|数据库22/22报告|`ba096ed35056e37f26c6d8586f508649812d8ff95a8cf83a4644291624a35abd`|

Guard测试6/6，既有maturity guard8/8、release-input5/5、网页readback/恢复相关 `web/test/ui.test.tsx` 30/30及网页typecheck通过；新合同先记录缺入口RED，再记录精确数量合同RED，已有正确业务回归没有人为制造失败。最初账号创建时机和浏览器导出后metadata合法变化导致的测试编排失败保留在本地日志，已修正，不记作产品缺陷。

E17机器责任为K11/K15/K16/K17/K21/K22/K27/K28/K30/K32。上述旅程/四路径/恢复覆盖对应目标、来源、幂等、分层记录、能力与归属。F03由真实部分成功+JVM重启和既有 `partial terminal task offers editable remaining request`页面测试共同覆盖；F04对应真实断连/重启，以及现有网页readback/原请求恢复测试。其余K01–K32及A/F设计未被放宽。

所有本次owned服务均由创建者停止，`cleanup.json`记录残留进程/服务线程为0。没有执行真实模型、物理Android/微信原生、真实用户、生产与新静态候选发布验收；分别留给E18/E19/E20，不能以本页通过数代替。按本次控制器边界只做适用检查，整版最终聚合验收留给E20。
