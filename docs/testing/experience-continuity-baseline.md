# E01：体验连续性前态与投影合同

2026-10-16，源码前态 `f1a90a52222d0ae460c424142ffc8ae80da28cb6`，分支 `codex/v4-meal-workspace-green-20261003`。本任务只新增展示投影与可重复夹具；页面消费、原生验收、真实用户验证及生产发布分别仍待后续任务。历史成熟度报告不是本次新增功能的验收结果。

## 冻结环境与指纹

Windows / PowerShell；Node `v24.15.0`（仓库要求24.x）。全部行为检查仅使用合成对象、内存存储及模拟HTTP边界，真实页面处理函数和工作区store运行。没有访问数据库、模型、生产服务或真实账号数据，没有修改运行配置。

|对象|本次读取的SHA256|限制|
|---|---|---|
|前态 `utils/meal-workspace-presentation.js`|`21da642adb9d476bb7fc36954db8265ce698e34fa7d51bbaa09941366595b798`|见上述源码SHA，可从Git复原|
|`utils/meal-journey-presentation.js`|`930eabee4e8236e2976daeb04378e20048ae4bc81db70047e15a63d66c7bd12b`|本任务字节未改，仍是主动作权威|
|现存 `backend/target/eatwhat-backend-1.0.0.jar`|`f552f99554e418daa4f9482b2043cbd3266a9c9e726db239dab6956ef13ce7a8`|只读文件指纹；未启动、未重建、未验证与源码配对；不是历史报告中的候选JAR|
|`project.config.json`|`1882caec07852599c37a96366927c8249825b522274caede0f1ee03e9e269b4c`|只读配置指纹；不代表运行服务配置或已发布小程序包|
|历史数据产物 `outputs/dish-replacement-20260718/manifest.json`|`709b1e797eebdb33cf129990ffcfee2bac8b1b9f57d52459e8f32ec2a0c6c8c5`|只标识现有本地产物，本次不导入、不清洗、不访问真实菜库|
|冻结输入/完整前态JSON|`cfa2dd995710f1d8ff140f76f67bb2d92c7b019efb1285f5cd642352166c5309`|本地 `.superpowers/sdd/2026-10-16-experience-continuity/task-1-before.json`；关键夹具在下文及测试中可复原|

没有产生或验证新的微信应用包，真实数据库版本为 **not-run**。夹具数据版本为 `E01-synthetic-v1`，当前目标 `2026-12-31/lunch`，保存目标 `2027-01-01/dinner`；单个合成菜ID 7、名称“青菜”，没有真实用户内容。

## 相同输入的前态

共同输入：`normalizeContext({date:'2026-12-31',mealType:'lunch',people:2})`；`draft={planVersion:3,dishes:[{id:7,name:'青菜',type:'vegetable'}],history:[]}`；`status='draft'`、`syncStatus='synced'`、`canConfirm=true`、`saveState='unsaved'`、`savedTarget=null`。以下只列覆盖字段；未列字段使用共同输入。

|夹具/事件|覆盖输入|前态主动作 / recovery|新增menuState|
|---|---|---|---|
|空餐|`status:'empty',draft:{dishes:[]},canConfirm:false`|`onGenerate` / null|empty|
|草稿|无|`onConfirmPlan` / null|draft|
|处理中|`status:'generating'`|`onCancelTask` / busy|working|
|本餐已保存|`status:'planned',canConfirm:false,linkedPlan:{revision:1},saveState:'saved',savedTarget:当前目标`|`onViewRecipes` / null|saved|
|保存次日晚餐后继续修改午餐|`saveState:'changed',savedTarget:保存目标`|`onConfirmPlan` / null|changed|
|跨年保存回执，当前仍是可保存草稿|`saveState:'saved',savedTarget:保存目标`|`onConfirmPlan` / null|saved|
|冲突且忙碌|`syncStatus:'conflict',busy:true`|`onLoadLatest` / conflict|conflict|
|旧成功回执 + 新请求未知|`saveState:'saved',savedTarget:保存目标,pendingReceipts:[{kind:'assistant',state:'unknown',target:当前目标,label:'核对本餐请求'}]`|`onRecoverJourney` / unknown|recover|
|能力关闭，保留本地草稿|`workspaceEnabled:false,assistantAvailable:false,canConfirm:false`|`onGenerate` / null|draft|

以上九组前态均没有 `contextLabel/menuState/resultNotice`。同一输入投影后，去掉这三个字段，其余所有字段与冻结JSON逐项深度相等（9/9）。`menuState`描述显示状态，不能据此重新决定按钮可用性；跨年夹具仍保留既有 `onConfirmPlan`。

## 新增展示合同

`deriveWorkspacePresentation(value)`保留全部既有字段并增加：

- `contextLabel`：仅从当前 `context.date/mealType/people`生成完整年份、日期、餐次和有效人数，例如“2026年12月31日午餐 · 2人”。不从旧保存目标或系统今天补值；无有效目标时为“当前餐”。
- `menuState`：`empty|draft|saved|changed|working|recover|conflict`，直接消费 `deriveMealJourney.recovery` 的优先级：未知 → 冲突 → 忙碌 → 未应用 → 待确认 → 普通菜单/保存回执。待确认映射为draft。`saveState='changed'`或`status='plan_changed'`映射changed；saved仅由有效保存目标及现有saveState确认，不从菜品数量、采购或实吃状态推断。
- `resultNotice`：null或 `{kind,text,target,action}`。恢复提示绑定当前旅程动作和目标；旧保存目标仍保留在输入的 `savedTarget`，文案明确为“此前已保存”，不表示本次操作成功。正常保存/修改后未保存提示绑定实际保存目标及`onViewSavedMeal`；日期含年份。没有有效保存目标不生成成功回执。已有错误提示保留其类型与净化文案，并使用当前旅程动作。

没有新增存储字段或写请求，没有修改 `deriveMealJourney`、页面按钮、导航或模板。E04将消费该合同并合并重复提示；E01不宣称页面已完成反馈合并。

## 断言、结果与责任

具名场景位于 `tests/experience-state-contract.test.js`：

|场景|断言与归类|
|---|---|
|`saved target and current draft remain separate`|当前午餐标签与次日晚餐回执分别保留；原主动作仍保存当前草稿；投影不修改输入。新增合同|
|`unknown operation cannot become saved`|旧成功回执保留可查看的目标；新请求显示recover/warning且核对成为优先动作。新增合同|
|`repeated selected meal is a no-op`|执行实际页面处理函数；没有写请求、菜单和store不变。既有正确行为保留回归，初次即通过|

另有空餐、草稿、生成、已保存、修改、未应用/待确认、忙碌/冲突/未知优先级、离线、无关餐次回执、能力关闭及无效保存目标矩阵。

本次RED：17项中16项因新字段尚不存在而失败，1项既有无操作回归通过。GREEN：指定三文件49/49；全部前端离线测试1075/1075。命令：

```powershell
D:/node.exe --test tests/experience-state-contract.test.js tests/workspace-primary-action.test.js tests/experience-save-target.test.js
$tests = Get-ChildItem tests -Filter '*.test.js' -File | Select-Object -ExpandProperty FullName
D:/node.exe --test @tests
```

本地输出为 `.superpowers/sdd/2026-10-16-experience-continuity/task-1-{red,green,frontend}.log`、`task-1-{before,after}.json`、`task-1-report.md`。这些执行文件保留在忽略目录；本文件和测试是提交内可重复证据。

机器责任清单 `docs/superpowers/plans/2026-10-16-experience-continuity-coverage.json`：E01负责K09（恢复信息保持可投影）、K11（一个主动作、目标不漂移、重复餐次无写入），页面可见性由E04接续。K01–K32及现有验收case状态全部保留；K21不是E01责任，不在本任务改助手能力。Review Focus F01–F05的owner均不是E01，维持原责任任务与待验状态，不冒充本任务覆盖。

## 未验证边界

本任务的原生真机、真实服务/数据库、真实模型、真实用户、生产发布均为 **not-run**，没有新增截图或应用包证据。通用 `scripts/verify.ps1` 包含后端/服务测试；本任务按“不发数据库/模型请求”的执行范围没有运行该聚合脚本，由后续隔离服务验证单独记账。离线Node通过不代表Java/Python构建、原生布局或生产发布通过。
