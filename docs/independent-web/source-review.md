# 网页端菜品来源与契约边界

## 当前有效方向：线上菜品，个人记录仅本地

2026-10-09用户更正后，菜品来自线上数据库的安全只读公开API。个人收藏、菜单、计划、实际饮食、采购及自定义菜仍仅保存在当前浏览器。当前已实现专用公共GET接口（默认关闭且空allowlist）、网页传输、个人本地数据与四页闭环。没有启用或请求生产端点，没有核实线上菜谱数量、公开许可或质量覆盖。

现有仓库/dishes读取需要登录，可含用户私房菜，不适合匿名网页直接调用。专用最小公共读取已实现；启用接口、实际放行哪批系统菜、其来源许可与质量状态，须另获明确授权。现有isPublished=1不是匿名公开或内容核验授权。

## 已实现的可复用基础

- createPublicCatalogProvider接收注入transport，约束page/pageSize及可选现有type；provider本身无URL/fetch。网页另有固定同源GET transport，不带凭据或令牌。个人字符串/忌口/记录不得放进query，检索可在已读公开数据本地完成。
- 最小PublicDish仅保留id/name/type、原材料/份量/做法文本、contentVersion和必要quality事实；过滤owner、用户、审核者、内证、任意图片及营养值。服务器仍必须先验证公开allowlist/系统/非私房/已发布条件，前端过滤不能代替暴露控制。
- VERIFIED只取quality中的精确状态，且自动候选还需当前contentVersion、VERIFIED步骤、已识别原名及有效类型/正文。未知和browse-only记录保留安全纯文本浏览，不能凭发布标记提升。
- 数据库id生成eatwhat-db:<id>；schema无family/variant，family仅相同DB id回退，variant=null。不同DB id同名/近似菜可能重复，候选和菜单使用名称归一去重并解释不足；不能据此认定不同DB菜已经过完整变体核验。
- DB meat/veg/soup/staple/dessert只映射至meat/vegetable/soup/staple/breakfastSnack；meat/veg/soup约定午晚餐，staple约定早餐/午餐/晚餐，dessert约定早餐/加餐。这是界面约定，不是逐菜餐次审核，也不是素食/过敏保证。
- 来源URL、commit、license、reviewedAt及catalog-wide版本缺失时保持null；contentVersion单独记录真实菜品版本，不能伪造全目录revision。未知基准人数/数量为null。
- 没有标准原料ID/alias表和成分表：ingredientId=null，aliases为空，compoundResolved=false。原名identityStatus=VERIFIED时trust可为reviewed，但不代表标准ID匹配或复合成分可排除。硬忌口仍须保守排除未匹配/未解析项。
- 只有VERIFIED整体质量+身份/数量状态及有界正数量/明确单位才保留exact结构量；有VERIFIED单一1–50人基准才保留baseServings。未核验数字不提升，区间不从字符串猜测。
- canGenerate仅对成功provider加载并冻结的Catalog开放，至少3个不同DB回退family。个人导入/自定义/复制标记不会取得正式候选资格。
- 全部分页完成并通过重复ID/数量/分页一致性检查后一次暴露；失败返回明确retryable错误，没有18道本地菜/空假成功/静态兜底。没有服务端目录revision，跨页同总数但发生编辑的全目录一致性尚无法保证，须在后续API契约确定。
- npm run build构建Vite，publicDir=false，dist不含历史审计菜谱、fixture或私有端点绑定。候选打包另附实际运行时依赖许可与SHA256清单。UI/存储闭环已有自动化单元覆盖；真实浏览器、线上API和发布验收仍未执行。

## 历史来源阅读证据（已撤离产品源目录）

以下是用户更正前的assistant source review，不是人类食品安全专家审核、过敏安全认证或正式线上菜库。完整原文/抽取/哈希/旧构建与测试已安全留存作历史证据，不进入web生产源目录或dist。原始外部整理库保持只读未修改。

- [固定HowToCook来源](https://github.com/Anduin2017/HowToCook/tree/a2d45c6984dff9ee941da0e7c452f7965965d962)；[Unlicense](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/LICENSE)。
- 原整理372主体；396/396采集文件的字节数、SHA-256和Git blob重验一致；35篇完整原文阅读后18曾通过历史静态准入、17隔离。这个数量不代表线上DB公开菜数或VERIFIED覆盖。
- 完整采集清单SHA-256：adca727556a69e3782091b122ee3150b7e0cdc69a3b01b0e311837b27fec518f；原整理JSON SHA-256：ddc603b10fd7a35dcf9f558f3ca673f10d838edcfbbd37b7a59f35a5ac37a502。
- 未把源描述的热量/疗效或外链图片用作产品事实。未知量、含肉素菜、复合调料、步骤/单位冲突与危险措辞保守记录，没有自动改写掩盖。

历史阅读的18道来源链接：

- [可乐鸡翅](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/meat_dish/可乐鸡翅.md)：历史阅读证据，非当前运行时数据。
- [简易红烧肉](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/meat_dish/红烧肉/简易红烧肉.md)：历史阅读证据，非当前运行时数据。
- [土豆炖排骨](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/meat_dish/土豆炖排骨/土豆炖排骨.md)：历史阅读证据，非当前运行时数据。
- [白菜猪肉炖粉条](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/meat_dish/白菜猪肉炖粉条.md)：历史阅读证据，非当前运行时数据。
- [蒜苔炒肉末](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/meat_dish/蒜苔炒肉末.md)：历史阅读证据，非当前运行时数据。
- [炒青菜](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/vegetable_dish/炒青菜.md)：历史阅读证据，非当前运行时数据。
- [清炒花菜](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/vegetable_dish/清炒花菜.md)：历史阅读证据，非当前运行时数据。
- [清蒸南瓜](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/vegetable_dish/清蒸南瓜.md)：历史阅读证据，非当前运行时数据。
- [酸辣土豆丝](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/vegetable_dish/酸辣土豆丝.md)：历史阅读证据，非当前运行时数据。
- [虎皮青椒](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/vegetable_dish/虎皮青椒/虎皮青椒.md)：历史阅读证据，非当前运行时数据。
- [凉拌豆腐](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/vegetable_dish/凉拌豆腐.md)：历史阅读证据，非当前运行时数据。
- [玉米排骨汤](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/soup/玉米排骨汤/玉米排骨汤.md)：历史阅读证据，非当前运行时数据。
- [金针菇汤](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/soup/金针菇汤.md)：历史阅读证据，非当前运行时数据。
- [奶油蘑菇汤](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/soup/奶油蘑菇汤.md)：历史阅读证据，非当前运行时数据。
- [电饭煲蒸米饭](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/staple/米饭/电饭煲蒸米饭.md)：历史阅读证据，非当前运行时数据。
- [水煮玉米](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/breakfast/水煮玉米.md)：历史阅读证据，非当前运行时数据。
- [桂圆红枣粥](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/breakfast/桂圆红枣粥.md)：历史阅读证据，非当前运行时数据。
- [吐司果酱](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/breakfast/吐司果酱.md)：历史阅读证据，非当前运行时数据。

历史隔离记录：

- [啤酒鸭](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/meat_dish/啤酒鸭/啤酒鸭.md)：操作2“大火待油烧开”是未决危险加热措辞，暂停公开，不用改写掩盖。
- [手撕包菜](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/vegetable_dish/手撕包菜/手撕包菜.md)：原文明确含五花肉和鸡精，不能作素菜；计算有生抽而操作重复料酒/未清楚使用生抽，完整性问题未决。
- [南派红烧肉](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/meat_dish/红烧肉/南派红烧肉.md)：操作依赖独立糖色教程，尚未完整审阅依赖内容，不能声称完整准入。
- [西红柿土豆炖牛肉](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/meat_dish/西红柿土豆炖牛肉/西红柿土豆炖牛肉.md)：高压锅步骤没有明示泄压开盖操作，本次不作安全改写，暂不公开。
- [萝卜炖羊排](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/meat_dish/萝卜炖羊排.md)：第一次明确泄压，第二次上汽后最终关火盛盘未明确泄压，暂待进一步安全复核。
- [蒜蓉炒芹菜](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/vegetable_dish/蒜蓉炒芹菜/蒜蓉炒芹菜.md)：主原料猪油，不能按目录或名字作素菜；需单独审核植物油变体才可能作素菜。
- [脆皮豆腐](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/vegetable_dish/脆皮豆腐.md)：原料有鸡蛋、蚝油，不能凭豆腐名字作素菜；需另行确定完整类型与复合调料。
- [葱煎豆腐](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/vegetable_dish/葱煎豆腐.md)：含鸡精，不能假定素食；豆腐0.8向上取整的块数没有块的基准，不推算克重。
- [葱油拌面](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/staple/葱油拌面.md)：基础酱汁3–4份与每份面条用量并存，需单独标明批量/份量归属再进入采购；冷藏“一段时间”未明。
- [蛋炒饭](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/staple/蛋炒饭.md)：隔夜冷饭储存条件未明确，操作又要求锅冒烟，暂不公开，不用自动修文。
- [汤面](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/staple/汤面.md)：开放生熟肉/鱼虾/蛋及任意菜组合，不够明确主原料和变体归属，无法进入本次生成池；泛化加热亦待复核。
- [烙饼](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/staple/烙饼/烙饼.md)：依赖独立油酥教程，未完整审阅该依赖，不以链接替代完整步骤。
- [紫菜蛋花汤](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/soup/紫菜蛋花汤.md)：可选虾仁必备项没有明确对应操作，蛋液又有熄火半分钟提示，本次暂待完整性/安全复核。
- [西红柿鸡蛋汤](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/soup/西红柿鸡蛋汤.md)：油冒烟步骤与短时间蛋液处理需进一步复核，暂不公开。
- [勾芡香菇汤](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/soup/勾芡香菇汤/勾芡香菇汤.md)：最后步骤“加入3g盐、3g”缺少调料名，完整性未通过。
- [牛奶燕麦](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/breakfast/牛奶燕麦.md)：鸡蛋每面煎20秒未明确熟透，快速/常规/鸡蛋多分支需进一步复核，未自动删蛋掩盖。
- [蒸花卷](https://github.com/Anduin2017/HowToCook/blob/a2d45c6984dff9ee941da0e7c452f7965965d962/dishes/breakfast/蒸花卷.md)：操作要求开盖用手感受表面温度，未决烫伤风险措辞，暂停公开。

## 下一关

源码与静态候选可继续独立审查和本地验收。公共端点默认关闭；具体公开菜范围、来源许可、生产数据读取与接口启用仍待单独授权。不得改全局鉴权/CORS、发模型请求或把旧静态菜作为线上接口失败兜底。完整剩余关口见[验收记录](verification.md)和[运行手册](release-runbook.md)。
