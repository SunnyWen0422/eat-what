# 吃什么 · 独立网页版 Implementation Plan

## 2026-10-09 用户确认的数据源更正（优先于下文旧数据源描述）

用户明确：菜品数据来自线上数据库；个人记录不存线上。网页版通过安全的只读菜品 API 获取线上数据，浏览器不直连数据库、不包含数据库凭据。收藏、自定义菜单、日历计划、实际饮食和采购清单等个人对象仍仅保存在当前浏览器 IndexedDB。免登录、与小程序个人数据独立、永久不用 AI 的要求不变。

此前文中“静态菜库作为正式数据源”“不读取任何线上菜品 API”“完全只请求静态资源”的表述已被本更正取代。已经审校的本地来源菜只保留为来源与开发证据，不得作为正式数据源或静默离线兜底。在线菜品仍需遵守公开状态、完整性、来源、未知用量和保守忌口规则；个人输入不得传给菜品接口。

实现前核实仓库中的读取端点、鉴权、公开状态与字段。优先复用已有匿名只读公开目录；若必须新增公开端点，只能按最小字段、公开系统菜筛选、分页与边界测试设计，不能放宽全局认证、泄露私房菜/用户字段或更改生产安全配置。任何需启用的新公开访问应先取得具体授权。未部署测试代码与个人本地功能可继续推进。线上接口不可用时明确显示加载失败/重试，不能伪装成本地正式菜库成功。


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付无登录、永久无 AI、个人数据仅在当前浏览器的独立吃饭工具，完成选餐、计划、采购、实际记录和回顾闭环。

**Architecture:** 新增独立 `web/` 静态SPA；规则/采购纯函数，IndexedDB仓储统一校验、revision与事务，菜库单独准入。先完成“手选→存计划→刷新恢复”，再补完整闭环。

**Tech Stack:** TypeScript、React、Vite、原生IndexedDB封装；Vitest/Testing Library/fake-indexeddb；Playwright及真机验收。执行时锁定相容稳定依赖、Node LTS及lockfile。

**Spec:** `docs/superpowers/specs/2026-10-09-eatwhat-independent-web-design.md`，v1.0，2026-10-09获批；本实施计划待审核。

## Global Constraints

- “不接入 AI 模型，现在和长期都不接入；不预留模型扩展路线。”无登录、云同步或私有API；菜品仅读获批公开API，个人业务数据仅本地，不改小程序及 PR #4/#5。
- “手机底部四个入口：**今天吃什么 / 菜谱 / 日历 / 我的**。”320px 起无横向溢出，正文≥16px、触控≥44px、支持200%缩放。
- 人数1–50、菜数1–20；默认2人晚餐一荤一素；超过8人先确认组合。
- 收藏权重2、普通1、最近7个本地日期实际吃过×0.5；每个开放生成槽位类型至少3个不同familyId，餐次亦需审核。
- 删除确认后保留回收站30天；下次打开清理，不承诺后台运行。
- 备份20 MiB、主记录20,000、字符串20,000字符、嵌套20层；原料结构数值大于0且≤1,000,000，未知为null。正常写入同限额。
- “首版只做**全量恢复替换**，不做复杂合并”；只在单个事务提交。无Service Worker、PWA或离线冷启动承诺。
- 默认本地图形，无热链、统计、远程字体；不可信内容纯文本显示。发布需单独授权；本轮仅计划，执行方式尚待选择。

## Review Focus

1. 恢复备份与其他标签旧表单并发：不覆盖新数据、保留输入（任务2/6）。
2. 午夜/夏令时/跨时区：历史本地日期不变，未来实际被拒，7/30天边界正确（任务3/4）。
3. 菜库删菜/来源删除/自定义改名：快照保留、失效引用标明、不升入自动池（任务1/4/5）。
4. 超限/危险导入或磁盘满：拒绝或回滚，不假成功、不删历史腾空间（任务2/6）。
5. 采购来源改变/锁定菜与新忌口冲突：不丢编辑，由用户明确决定（任务3/5）。

---

## 已核实依据与执行边界

- 目标 `SunnyWen0422/eat-what`，基线分支 `codex/v4-meal-workspace-green-20261003`，最新已知SHA `8bc8d8b028ebbfdab31f5a2ed03f515875c4701a`；执行时重新读head、审查新增差异。独立分支建议 `codex/independent-web-20261009`，草稿PR指向基线，不混入PR #4/#5。
- 当前目录仅文档、无产品remote；获批后在合适环境另建隔离worktree，不能复用其他任务工作树。只新增 `web/` 和指定文档；原12项交付物先从交付清单记录路径/哈希，未定位前不得改任何既有产物。
- 已核实本地 `recipe_migration/output/data.json`、`source/dishes/`、`provenance/acquisition_manifest.json`、`source/LICENSE`、`qa/` 可读（均相对 `recipe_migration/`）。来源commit `a2d45c6984dff9ee941da0e7c452f7965965d962`，Unlicense；执行时重验采集清单哈希。`recipe_db_v2/qa/conversion_summary.json` 载372主体/305候选/67未映射，全部未发布；只读参考，MySQL分类/ID不用作网页契约。
- 已读源码Nginx：根目录 `/var/www/chishenme`，另有 `/api/`、`/main`、`/health`、ACME；不证明线上配置。旧 `backend/static/main.html` 和测试菜不复用。
- 依赖/浏览器/远端读取若受网络限制，用已核实本地来源及官方连接器；仍阻塞则报告并换获准环境。不能换不可信镜像或把未运行测试写成通过，可继续独立工作。

## 文件结构与公共契约

产品路径除 `docs/` 外相对 `web/`，精确新增/修改路径见各任务。
- 根配置：package.json/package-lock.json/.nvmrc/tsconfig.json/vite.config.ts/index.html。
- src/domain：公共类型/校验/日期；catalog：可注入线上公开provider读取与事实归一化；data：仓储/迁移/存储状态。
- menu、history、shopping、backup：纯业务边界；ui：四导航与子页面；assets：本地图形。
- 生产构建不含旧静态菜库/content来源正文；历史阅读证据与构建留存于开发checkpoint，不作线上兜底。边界检查与发布包不写私有数据。
- test、e2e、playwright.config.ts：单测/浏览器测试；docs/independent-web：内容证据/验收/发布手册。
测试中的input/repo/page为本地setup变量，非额外跨任务接口。

### 类型约定（任务 1 定义，任务 2–6 扩充对象字段，名称不得另起）

`Meal = 'breakfast'|'lunch'|'dinner'|'snack'`；`DishType = 'meat'|'vegetable'|'staple'|'soup'|'breakfastSnack'`。`LocalDate` 是经校验的 YYYY-MM-DD，`UtcIso` 是 UTC ISO，`TimeZone` 是创建时 IANA 字符串；不要拿 `Date.toISOString().slice(0,10)` 算本地日期。

`Quantity = {kind:'exact',value:number,unit:string}|{kind:'range',min:number,max:number,unit:string}`。未知食材的数量字段为 null；不能用 0 假装未知。`Ingredient = {ingredientId:string|null,form:string,part:string|null,raw:string,quantity:Quantity|null,trust:'reviewed'|'unknown',compoundResolved:boolean}`。

`RecipeSnapshot = {recipeId:string,familyId:string,variantId:string|null,name:string,types:DishType[],ingredients:Ingredient[],steps:string[],source:{url:string|null,commit:string|null,license:string|null},catalogVersion:string|null,baseServings:number|null}`；其他字段依上述类型。自定义来源使用 null，不伪造来源/许可。`CatalogRecipe` 扩展快照，增加 `meals:Meal[]`、`reviewStatus:'VERIFIED'|'UNREVIEWED'|'UNKNOWN'|'BROWSE_ONLY'|'REJECTED'`、`generationEligible:boolean`、`reviewedAt:LocalDate|null`、`issues:string[]`、stepStatus/servingsStatus与明确的DB family回退/餐次约定标记。来源不存在则null，Snapshot可附真实`contentVersion:string|null`；catalogVersion保持null，不伪造目录revision。

`Slot = {id:string,type:DishType}`；`MealDraft = {id:'current',servings:number,meal:Meal,slots:Slot[],dishes:{slotId:string,recipe:RecipeSnapshot,locked:boolean}[],countsConfirmed:boolean,updatedAt:UtcIso,revision:number}`。

`PersonalData` 对应规格§5十个store：`meta/preferences/draft/customRecipes/favorites/menuTemplates/plans/actualMeals/shoppingLists/trash`。字段依规格表/快照；对象及全局revision随写事务推进。对象存requestId，meta存清空请求ID，trash存删除请求ID；先查幂等ID/相同负载再查revision，不能仅靠按钮防重。主记录计除meta外所有对象（含trash、singleton各1），快照内菜品不重复计但受字符串/深度/字节限额。

`Result<T> = {ok:true,value:T}|{ok:false,error:{code:ErrorCode,message:string}}`；`ErrorCode` 至少含 `INVALID/LIMIT/UNAVAILABLE/QUOTA/CONFLICT/DUPLICATE/FUTURE_DATE/BLOCKED/NEWER_SCHEMA/CATALOG/ABORTED`。界面不靠解析 message 控制逻辑。

任务1定义测试fixtures：`recipe(overrides?:Partial<CatalogRecipe>):CatalogRecipe`、`personalData():PersonalData`、`draft(overrides?:Partial<MealDraft>):MealDraft`；固定合法数据、时钟、ID，仅供测试。数据库注入IDBFactory/时钟/UUID；fake-indexeddb不能替代浏览器测试。

## Task 1A: 可复用网页基础与线上菜品契约

用户更正后取代原静态菜库实施要求。保留Node24/TypeScript/React/Vite、日期、个人空对象校验与测试fixture；正式菜品仅来自经批准的线上公开provider。当前没有具体端点实现或生产请求。

- PublicDish最小白名单：id/name/type、cl/fl/step/steps/tips/ingredientsAmounts文本、contentVersion及必要quality状态/原料字段。去除用户、审核者、内证、图像、营养值。页形状为`{list,total,page,pageSize}`。
- `createPublicCatalogProvider(transport:PublicCatalogTransport):PublicCatalogProvider`；transport只接page>=1、pageSize1–100、可选现有DB type，不发送个人字符串。内部最多读500行；不是已验证服务器容量。
- `normalizePublicDish(dish:PublicDish):Result<CatalogRecipe>`；`loadCatalog(provider?:PublicCatalogProvider):Promise<Result<Catalog>>`；`canGenerate(catalog,meal,type):boolean`。
- Catalog包含`origin:'online-provider'`、`version:null`、recipes、空alias/recipeAlias及meal/type池。成功全分页归一化后冻结登记；失败明确retryable，个人导入/克隆无法获得资格。
- ID=`eatwhat-db:<id>`；family回退同ID、variant=null。任务3须额外做名称归一去重。现有DB meat/veg/soup/staple/dessert精确映射；餐次是公开的本地类型约定而不是来源逐菜审核。
- VERIFIED不能由发布标记推定，生成还需VERIFIED步骤/身份及正文/类型完整。未知、未映射、browse-only只供可用的纯文本浏览。标准原料ID、alias和成分没有来源则保持未知；结构量/基准人数另过严格证据门。
- 生产build仅Vite且不复制public历史输出，禁止本地18道菜或fixture进入dist/兜底。旧源文、抽取、审计构建/测试安全归档为历史开发证据，来源永久链接见source-review。
- TDD覆盖provider失败无兜底、字段白名单、未知质量/数量、稳定ID、未开放类型池、克隆排除、构建边界。仅跑web suite/typecheck/build，禁止backend/model测试。

## Task 1B: 获批后接入最小公开菜品读取（当前等待授权）

先核实/批准匿名访问及具体allowlist，再单独实现/启用同源只读分页API。现有/dishes鉴权和私房菜访问规则不能放宽；现有published=1不是公开授权。API必须只放行已批准系统、非自定义、严格published=1行，最小DTO，保留未知质量。无数据库凭据、个人数据上传、写入或模型/推荐路径。尚无线上接口、公开范围或内容覆盖验收。

## Task 2: 原子仓储与首个可测页面闭环

**Files:** Create `src/data/{repository,migrations,storage-status}.ts`、`src/main.tsx`、`src/ui/{App,Today,Recipes,components}.tsx`、`src/ui/styles.css`、`test/repository.test.ts`、`test/vertical.test.tsx`、`e2e/vertical.spec.ts`、`playwright.config.ts`；Modify `src/domain/{types,validation}.ts`。

**Interfaces:**
- Consumes: 任务 1 的 Catalog、RecipeSnapshot、MealDraft、PersonalData 和校验。
- Produces: `openRepository(options:{factory:IDBFactory,now:()=>Date,uuid:()=>string}):Promise<Result<Repository>>`。`Repository.read():Promise<Result<PersonalData>>`；`Repository.commit(command:Command,expectedGlobalRevision:number,requestId:string):Promise<Result<CommitReceipt>>`；`Repository.subscribe(listener:(revision:number)=>void):()=>void`；`Repository.close():void`。
- `Command` 为判别联合：`saveDraft`、`savePreferences`、`savePlan`（含 expectedObjectRevision，新增为 null，替换需当前 revision）、后续个人对象 put/delete/restore、`replaceAll`、`clearAll`、`expireTrash`。所有命令只允许指定 store/字段，不暴露任意 SQL/脚本/外部 URL。`CommitReceipt={globalRevision:number,objectId:string|null,objectRevision:number|null,replayed:boolean}`。
- `probeStorage():Promise<StorageStatus>`；`StorageStatus` 含 read/write 能力、origin、estimate|null、persisted|null、错误；`requestPersistence():Promise<boolean>` 仅响应用户点击。

- [ ] **Step 1: 红灯测试** `test/repository.test.ts`：重复date/meal拒绝；requestId重试只一次；abort/quota后旧库深等；stale revision冲突。`vertical.test.tsx`：pending无成功提示、失败留输入、不可写仅临时手选。`e2e/vertical.spec.ts`：空库→手选→确认日期餐次→保存→reload计划存在、实际仍空。
```ts
const before = await repo.read();
const failed = await repo.commit(commandWithInjectedAbort, revision, 'request-abort');
expect(failed.ok).toBe(false);
expect(await repo.read()).toEqual(before);
```

- [ ] **Step 2: 运行红灯** `npm test -- --run test/repository.test.ts test/vertical.test.tsx`，预期行为FAIL。
- [ ] **Step 3: 实现仓储及最小页面**：DB=`eatwhat-web`，schemaVersion=1；计划date+meal、收藏recipeId、保存requestId唯一索引。事务内核对revision/限额/唯一性并更新meta，仅oncomplete报成功，不在事务中await网络。BroadcastChannel通知；不支持则focus读revision；冲突保留编辑，不自动覆盖。

- [ ] **Step 4: 升级与不可写路径**：补测blocked/versionchange、升级abort回滚、高schema只读导出、超限保存；浏览器补测双标签冲突/升级阻塞。新schema只读raw导出保留未知store，不降级/删库；破坏性迁移须导出+确认。v1不虚构旧版迁移支持。

- [ ] **Step 5: 运行绿灯** `npm test -- --run test/repository.test.ts test/vertical.test.tsx && npm run typecheck && npm run e2e -- e2e/vertical.spec.ts --project=chromium`；无浏览器则如实标未验证。
- [ ] **Step 6: 提交** `git add web && git commit -m "feat(web): persist plans with atomic revision checks"`。

**交付边界：** 首条可测闭环；不可写时临时操作，任务6补内存导出。

## Task 3: 本地配餐、替换与偏好规则

**Files:** Create `src/menu/rules.ts`、`test/rules.test.ts`；Modify `src/ui/Today.tsx`、`src/domain/types.ts`、`src/domain/dates.ts`。

**Interfaces:**
- Consumes: Catalog、MealDraft、preferences、actualMeals 的快照；不访问 DB/网络。
- Produces: `defaultSlots(servings:number,meal:Meal,vegetarian:boolean):Result<{slots:Slot[],requiresConfirmation:boolean}>`；`generateMeal(input:GenerateInput):Result<GenerationResult>`；`replaceSlot(input:GenerateInput,slotId:string):Result<GenerationResult>`。
- `GenerateInput={catalog:Catalog,draft:MealDraft,hardExclusions:string[],unresolvedExclusions:string[],favoriteIds:string[],actualMeals:ActualMeal[],today:LocalDate,seed:number}`；`GenerationResult={draft:MealDraft,missing:{slotId:string,reason:string}[],conflicts:{slotId:string,reason:string}[]}`。ActualMeal 字段遵循任务 4；只有 date 与 snapshots 用于最近饮食降权。

- [ ] **Step 1: 红灯测试** `rules.test.ts`：1/2人一荤一素，3–4两荤一素，5–6两荤两素，7–8三荤两素；1人荤槽允许审核豆制品，素食将荤槽换素槽；早餐一主食一辅助、加餐一项；9–50先确认；0/51人、0/21菜拒绝。固定seed可复现、无重复family；硬忌口/未知原料/不明复合料排除，未知忌口不假生效；不足返回部分/原因；权重2/1/近期×0.5，计划不降权。
```ts
expect(generateMeal(input)).toEqual(generateMeal(input)); // 相同 seed 和输入
```

- [ ] **Step 2: 运行红灯** `npm test -- --run test/rules.test.ts`，预期FAIL。
- [ ] **Step 3: 实现规则**：先验证/锁定冲突/硬过滤，再seeded无放回加权抽样；多类型菜仅占一槽。换菜只改目标槽，排除当前菜/其他family，无替代保留原菜；重生成保留合法锁定。未知忌口要求补全/移除或手选，不假标已生效；软偏好不改变硬约束。

- [ ] **Step 4: 交互红灯→实现**：测换菜不动其他槽、锁定冲突先解除/移除、无替代保留原菜；回访还原设置/草稿不重生成；手选警告及具体未知原料。每次有效编辑用仓储保存并反馈；>8人确认写入draft，人数/组合变更使其失效；放弃需确认。

- [ ] **Step 5: 运行绿灯** `npm test -- --run test/rules.test.ts test/vertical.test.tsx && npm run typecheck`。日期测试覆盖当天及前 6 日算最近 7 个本地日期、第 7 日排除、跨夏令时不差一天。
- [ ] **Step 6: 提交** `git add web && git commit -m "feat(web): generate explainable local meals"`。

## Task 4: 实际记录、日历、个人菜谱与回顾

**Files:** Create `src/history/{records,recap}.ts`、`src/ui/{Calendar,My}.tsx`、`test/records.test.ts`、`test/recap.test.ts`、`e2e/history.spec.ts`；Modify `src/domain/{types,validation}.ts`、`src/data/repository.ts`、`src/ui/{Recipes,Today,App}.tsx`。

**Interfaces:**
- Consumes: Repository.commit、RecipeSnapshot、LocalDate。
- Produces: `recordFromPlan(plan:Plan,selection:RecipeSnapshot[],date:LocalDate,meal:Meal,today:LocalDate):Result<ActualMealInput>`；`summarizeActuals(actuals:ActualMeal[],today:LocalDate,days:7|30):Recap`；`restoreTrash(entry:TrashEntry,data:PersonalData,target?:{date:LocalDate,meal:Meal}):Result<Command>`。
- `Plan={id,date,meal,servings,snapshots:RecipeSnapshot[],createdAt,updatedAt,timeZone,revision,requestId}`；`ActualMeal` 同通用身份/日期/时间字段，增加 snapshots、planId:string|null、note:string，无强制人数/克数；`ActualMealInput` 去除由仓储生成的 id/time/revision/requestId。
- `Recap={days:{date:LocalDate,status:'recorded'|'unrecorded',recordCount:number}[],dishCounts:{recipeId:string,count:number}[],mealCounts:Record<Meal,number>,categoryCounts:Partial<Record<DishType,number>>}`。同一 actual 中同 recipeId 出现一次；分类以快照当时分类计算，多标签分类注明可重叠、不得显示成互斥营养比例。

- [ ] **Step 1: 红灯测试** `records.test.ts`：未来实际拒绝/计划允许；来源修改不改历史；同计划再记录先提示，明确新增才新requestId；取消收藏不删历史、库删菜仍保留收藏；自定义缺食材仅手选；模板更新需新快照。`recap.test.ts`：只算实际、每记录同菜计一次、7/30日及跨时区、空日期unrecorded。
```ts
expect(summarizeActuals([], '2026-10-09', 7).days.every(d => d.status === 'unrecorded')).toBe(true);
```

- [ ] **Step 2: 运行红灯** `npm test -- --run test/records.test.ts test/recap.test.ts`，预期FAIL。
- [ ] **Step 3: 实现记录与个人对象**：计划/实际不同动作；同日同餐计划确认替换或取消，实际可多条。自定义名称必填，其他可空，仅手选；模板不是实际；收藏按recipeId去重。所有历史独立快照，修改来源不联动。

- [ ] **Step 4: 删除/恢复红灯→实现**：确认delete原子移trash，30×24小时后打开清理。恢复唯一键冲突另选日期/餐次或取消；删计划不级联，显示来源已删除。clearAll二次确认+导出提醒，只清本应用store并推进meta revision；测同源其他数据不变、取消零写入。

- [ ] **Step 5: 日历/回顾绿灯** `npm test -- --run test/records.test.ts test/recap.test.ts && npm run e2e -- e2e/history.spec.ts --project=chromium`：周列表/月选日/四餐，计划与实际文字区分；按计划记录可删改再确认；首次保存轻提示备份；重载保持，回顾不作营养判断。

- [ ] **Step 6: 提交** `git add web && git commit -m "feat(web): separate plans and actual meal history"`。

## Task 5: 可解释用量与不丢编辑的采购清单

**Files:** Create `src/shopping/{quantities,shopping}.ts`、`src/ui/Shopping.tsx`、`test/shopping.test.ts`、`e2e/shopping.spec.ts`；Modify `src/domain/{types,validation}.ts`、`src/data/repository.ts`、`src/ui/{Today,Calendar,My,App}.tsx`。

**Interfaces:**
- Consumes: RecipeSnapshot、Plan/MealDraft 和 Repository。
- Produces: `scaleIngredient(ingredient:Ingredient,baseServings:number|null,targetServings:number):ScaledIngredient`；`buildShopping(sources:ShoppingSource[]):ShoppingListInput`；`diffShopping(previous:ShoppingList,next:ShoppingListInput):ShoppingDiff`。
- `ScaledIngredient={ingredient:Ingredient,originalQuantity:Quantity|null,quantity:Quantity|null,baseServings:number|null,factor:number|null,reason:string|null}`；`ShoppingSource={kind:'plan'|'draft',id:string,revision:number|null,digest:string,snapshots:RecipeSnapshot[],servings:number}`。
- `ShoppingListInput={sources:ShoppingSource[],items:ShoppingItem[]}`；`ShoppingList` 加 id/revision/time/requestId。`ShoppingItem` 含 stable key、ingredientId/form/part、已知量、unknownEntries、完整来源片段、userQuantity:string|null、purchased:boolean、manual:boolean。`ShoppingDiff` 是 added/removed/changed 条目及旧手改/已购项列表，不自动迁移覆盖值。

- [ ] **Step 1: 红灯测试** `shopping.test.ts`：基准2→4，100g→200g、1–2→2–4；无基准不换算；kg/g、L/ml可合并，个/克、生/熟、不同部位不可；明确+未知并存，适量不换克数，原文/来源完整；实际记录不得作为采购来源。
```ts
const ingredient: Ingredient = {ingredientId:'rice',form:'raw',part:null,raw:'100g',quantity:{kind:'exact',value:100,unit:'g'},trust:'reviewed',compoundResolved:true};
expect(scaleIngredient(ingredient, 2, 4)).toMatchObject({quantity:{kind:'exact',value:200,unit:'g'},factor:2});
expect(scaleIngredient(ingredient, null, 4)).toMatchObject({quantity:ingredient.quantity,factor:null});
```

- [ ] **Step 2: 运行红灯** `npm test -- --run test/shopping.test.ts`，接口/行为 FAIL。
- [ ] **Step 3: 实现缩放/聚合**：仅审核ID、相同形态/部位与单位白名单合并，未知不用模糊名合并。区间端点相加，溢出拒绝；原量上限与缩放结果/手改文字分开校验，不能回写来源。保留可信状态、原文、未换算原因。

- [ ] **Step 4: 列表交互红灯→实现**：勾购/手改/手动项持久化。来源revision/digest变化仅标“来源已变更”；重生成先看差异，确认另存新版本，不套用或丢弃旧手改/已购，旧版保留；源删除快照仍可展开。测中断无半写、冲突留输入。

- [ ] **Step 5: 运行绿灯** `npm test -- --run test/shopping.test.ts && npm run e2e -- e2e/shopping.spec.ts --project=chromium`。端到端覆盖“选择计划→合计+待确认→手改→改计划→差异→取消仍原样/确认有新版本”。
- [ ] **Step 6: 提交** `git add web && git commit -m "feat(web): add traceable shopping lists"`。

## Task 6: 严格备份验证与跨标签原子恢复

**Files:** Create `src/backup/backup.ts`、`src/ui/DataManagement.tsx`、`test/backup.test.ts`、`e2e/backup.spec.ts`；Modify `src/domain/validation.ts`、`src/data/{repository,migrations,storage-status}.ts`、`src/ui/My.tsx`。

**Interfaces:**
- Consumes: PersonalData、校验、Repository.commit 的 replaceAll 和全局 revision。
- Produces: `exportBackup(data:PersonalData,context:BackupContext):Result<Blob>`；`parseBackup(file:Blob):Promise<Result<RestoreCandidate>>`；`restoreBackup(repo:Repository,candidate:RestoreCandidate,expectedGlobalRevision:number,requestId:string):Promise<Result<CommitReceipt>>`。
- `BackupContext={appVersion:string,catalogVersion:string,exportedAt:UtcIso,timeZone:TimeZone}`；完整格式另含 `format:'eatwhat-web-backup',schemaVersion:1,data:PersonalData`；`RestoreCandidate={data:PersonalData,context:BackupContext,counts:Record<string,number>,warnings:string[]}`，验证后的内存对象不能在确认后重新读可变文件。
- `exportRawSnapshot(stores:Record<string,unknown[]>,context:{schemaVersion:number,appVersion:string,exportedAt:UtcIso}):Blob` 专供未知新结构/超限异常库留存，显式 raw 格式不可由本版恢复；不能为了符合正常格式截断数据。普通 v1 导出与导入必须往返一致。

- [ ] **Step 1: 红灯测试** `backup.test.ts`：空/全库/trash/自定义往返相等（除提交meta）；20MiB/20,000记录/20,000字符/20层边界可接受，各+1拒绝；数量0/1,000,001/非有限拒绝；重复ID/未知字段/危险键/坏日期餐次/新版本拒绝；追溯plan失效允许并警告，其他必需引用缺失拒绝；HTML只作文本，任意媒体/非https来源拒绝，文件URL零请求。
```ts
expect(await parseBackup(new Blob(['{"__proto__":{"polluted":true}}']))).toMatchObject({ok:false});
```

- [ ] **Step 2: 运行红灯** `npm test -- --run test/backup.test.ts`，预期FAIL。
- [ ] **Step 3: 实现解析/导出**：先file.size，再字符串感知扫描限制嵌套、JSON.parse、严格字段/危险键/ID/引用校验。仅支持v1，未来迁移须显式注册并测试。UTF-8全量个人对象/快照、日期时间文件名，不含静态全库；提示饮食/忌口隐私。同限额用于平时写入，19,000条提示；异常库仍可raw完整导出。

- [ ] **Step 4: 确认与原子恢复**：选择→验证→时间/数量/替换影响→提供旧库导出→确认已备份或接受覆盖。预览捕获global revision，确认后不重读文件；全store单事务再核对revision，旧revision不可覆盖代次，导入对象revision统一更新。abort/quota/其他标签先写均保留旧库；未知版本不试写，导入标记不能授权正式菜库。

- [ ] **Step 5: 绿灯** `npm test -- --run test/backup.test.ts test/repository.test.ts && npm run e2e -- e2e/backup.spec.ts --project=chromium`：A导出→B恢复；取消/坏文件/事务失败B原样；C在预览时写入则恢复冲突，恢复后C旧表单亦冲突；断网可用、内存可导出。数据管理显示origin/可写/配额/持久化/最后写入/最近请求下载，未知如实标记；persist()仅用户点击，拒绝可继续；只称“已请求下载”。

- [ ] **Step 6: 提交** `git add web && git commit -m "feat(web): validate and atomically restore backups"`。

## Task 7: 完整响应式交互、可访问性与隐私门禁

**Files:** Modify `src/ui/{App,Today,Recipes,Calendar,My,Shopping,DataManagement,components}.tsx`、`src/ui/styles.css`、`src/main.tsx`；Create `src/assets/category-icons.svg`、 `test/ui.test.tsx`、`e2e/{journey,accessibility,network}.spec.ts`、`scripts/check-boundaries.ts`。

**Interfaces:**
- Consumes: 已定义业务与仓储接口；UI 不自行直接写 IndexedDB、不绕过验证。
- Produces: 完整四导航页面、采购/回顾/数据管理子页面；`checkBoundaries(root:string):Promise<{violations:string[]}>` 构建审计。导航仅非敏感固定路由，个人字段不进入 URL、日志或遥测。

- [ ] **Step 1: 编写红灯 UI/E2E 测试**：四导航与默认文案精确匹配规格；首页唯一主动作“保存到日历”，记录/采购为次级；名称/食材/分类/收藏筛选；详情含原文/步骤/来源/限制；未知忌口标未识别；导航及弹窗键盘操作、焦点返回、aria-live 保存状态。320/390/768/1440px 断言 document.scrollWidth 不超过 viewport；长菜名/长来源/200% 放大不遮挡操作。
```ts
await page.setViewportSize({width:320,height:800});
expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
```

- [ ] **Step 2: 运行红灯** `npm test -- --run test/ui.test.tsx && npm run e2e -- e2e/journey.spec.ts --project=chromium`，预期缺失行为FAIL。
- [ ] **Step 3: 完成界面**：手机单列/底导航，桌面双列/顶导航/max-width1200px；16px正文、44px触控。按钮加载/禁用/失败，取消不写、失败留输入；首次说明/备份轻提示依规格，无全屏引导或虚假记录。浅底深文绿色主操作，本地图形不冒充成品照。

- [ ] **Step 4: 安全/网络红灯→修复**：请求只允许同源版本静态资源，核心动作不触及API/模型/第三方/远程图片字体，个人内容不入URL/日志。审计禁wx、小程序service、模型SDK、HTML注入、SW；https外链安全打开，导入URL不自动读取。测菜库缺失/坏摘要重试、已加载页面断网可用、新origin空库。

- [ ] **Step 5: 运行绿灯** `npm test -- --run && npm run typecheck && npm run boundaries && npm run e2e -- e2e/journey.spec.ts e2e/accessibility.spec.ts e2e/network.spec.ts`。自动化覆盖 Chromium/Firefox/WebKit，报告实际可运行项目；读屏/触控/真实 Safari 另在任务 8 人工验收，不拿引擎名代替设备结果。
- [ ] **Step 6: 提交** `git add web && git commit -m "feat(web): complete accessible independent meal workspace"`。

## Task 8: 可回滚静态产物、全量验收与草稿 PR

**Files:** Create `scripts/package-release.ts`、`deploy/nginx-web.example.conf`、`test/release.test.ts`、`e2e/release.spec.ts`、`docs/independent-web/{verification,release-runbook}.md`；Modify `package.json`。不修改生效的 `backend/nginx-chishenme.conf`、`backend/static/` 或线上目录。

**Interfaces:**
- Consumes: Vite `web/dist/`、锁定 catalog 清单、许可、测试结果、原静态路由基线。
- Produces: `packageRelease(dist:string,releaseId:string):Promise<{directory:string,sha256:string}>`，输出 `web/release/<releaseId>/` 可上传目录与 SHA256 清单；运行手册与独立审查结果。

- [ ] **Step 1: 写失败门禁**：`web/test/release.test.ts` 检查缺许可/缺资源/资源摘要不符/私有依赖/未经审核候选时打包失败。`web/e2e/release.spec.ts` 在隔离 Nginx 或等价可验证预发布路由环境检查 `/`、固定网页路由、真实缺失资源 404；`/api/`、`/health`、证书验证与 `/main` 不被 SPA 返回 HTML。mock 只测路由优先级，不能充当真实 API 非回归结果。
```ts
await expect(packageRelease(distMissingLicense, 'test-release')).rejects.toThrow();
```

- [ ] **Step 2: 运行红灯** `npm test -- --run test/release.test.ts`，预期FAIL。
- [ ] **Step 3: 发布包/示例配置**：推荐根站，Vite base=`/`，固定hash路由如 `/#/recipes`，无个人参数。产物资源位于 `/web-assets/<releaseId>/` 且文件带哈希；HTML引用固定版本。推荐 `/var/www/chishenme-web/releases/<releaseId>/` + `current` 原子指针，保留旧资源，绝不覆盖repo的 `backend/static/`。仅静态规则示例；API/health/ACME保持优先及原策略，`/main` 默认保留旧 `/var/www/chishenme/main.html`。HTML重新验证、哈希资源immutable、缺资源/未知路由404，不广域SPA吞错。

- [ ] **Step 4: 全量验证**：`npm ci && npm run typecheck && npm test -- --run && npm run catalog:check && npm run boundaries && npm run build && npm run package:release && npm run e2e`。记Node/依赖/浏览器版本、命令、摘要。最新稳定Chrome/Edge/Firefox/macOS Safari/iOS Safari/Android Chrome真机清单：闭环、触控/键盘/读屏、200%、四视口、存储拒绝/配额/断网、多标签、搬家。Playwright WebKit不等于真实Safari；无设备或网络受阻记未执行，不得放行。

- [ ] **Step 5: 发布手册**：获发布许可后才核实域名/HTTPS/证书/备案、www数据与流量、旧同源脚本/CSP/响应头；www有数据先导出迁移再重定向至 `https://chishenme.icu`。备份有效配置/旧静态目录，预发布nginx -t、路由/API基线比较、切换/回滚并记证据。回滚只切资源不清库，旧app面对新schema只读。权限未知不阻塞编码，但不能部署；失败保留旧站。

- [ ] **Step 6: 独立整分支审查→草稿PR**：审查spec覆盖/数据损坏/内容准入/无AI及私有API/原交付物哈希；修复并重跑门禁。`git add web docs/independent-web docs/superpowers && git commit -m "chore(web): add release gates and verification evidence"`。有效授权下推独立分支，PR指向既定集成分支，附计划/规格/结果/未执行项/菜数/发布阻塞；不改PR #4/#5、不自动合并，真机/预发布门槛未过保持草稿。


**交付边界：** 源码、候选静态包、审查和草稿PR；全部上线门槛满足且单独授权后才部署。

## 规格覆盖与自审结果

§1/§7→任务1、7、8；§2→任务2、7；§3→任务2–4、6；§4→任务3、5；§5→公共契约及任务1–6；§6→任务2、4、6；§8→任务7、8；§9→所有测试及任务8设备验收；§10→执行边界。已逐节自审并修正跨标签恢复代次、异常库raw导出、采购编辑保护、未知忌口和限额；接口名称一致。命令和测试均是未来执行要求，本轮没有产品编码、安装、推送或部署。

## 待审核的执行方式

推荐“分任务实施 + 每项独立审查 + 最终整分支审查”：八个任务共享菜库/仓储/备份契约，及早发现保存或恢复错误更稳妥。也可选“本会话连续开发 + 最终一次独立审查”，上下文成本较少，但独立审查集中在末尾。

请审核计划并选执行方式；尚未替用户选择。最终菜数、真机可用性、发布权限/线上origin现状在各自关口核实，不凭空承诺，也不阻塞先写可测试源码。
