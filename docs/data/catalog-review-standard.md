# 首批可信菜谱核验标准

2026-10-15：新增全量只读审计入口：

~~~text
python scripts/build_catalog_quality.py --source-csv <原CSV或JSONL> --out <全新目录> --audit-only
~~~

输出audit.json、audit.md及最多100条分层review-decisions.jsonl。审计覆盖字段缺失、主键/同名/内容重复、数量与单位、伪材料、时间、图片语法、所有权及可判定的版本不一致；原值不改，候选均为UNKNOWN，不代表已核验配方。缺少来源历史时不声称时效或分布漂移已通过。

运行时单条损坏质量资料改为保留原菜阅读、撤销派生数量/份数资格；损坏内容仍纳入菜谱版本，旧预览必须重新核对。质量数据库整体不可用继续报错，不能将连接故障伪装成已核验事实。

每次运行 `scripts/build_catalog_quality.py` 写新目录。当前治理版本保留6,665道菜的ID，排除52条描述词伪材料，100道候选仍是 UNREVIEWED。生成代码中的统一克数不是原配方证据。

审阅者逐道核对原配方：材料身份和形态、来源原文与定位、基准人数、每项用量、步骤前后关系、时间来源、图片使用依据。允许份数/数量/营养保持未知。静态核验与实际做菜分别记录，未实做不得填 cookedAt。

审阅文件使用 JSONL，每条包含 `dishId`、当前候选的 `sourceHash`、`reviewStatus:"VERIFIED"`、`sourceRef`、`reviewer`、ISO `reviewedAt`、可空 `basePeople`、`stepStatus`、`imageRights`、`ingredientEvidence`。材料证据以有效材料名为键，值含 sourceRef；有真实数值时增加 quantityValue、unit、quantityEvidence，无数值保持 null。不允许凭习惯填写数字或用模型生成证据。

`stepStatus` 为 VERIFIED/UNKNOWN，`imageRights` 为 VERIFIED/UNKNOWN/REJECTED；日期、哈希、材料集合与正数量由校验器检查。这只是结构门禁，审阅者仍须对证据负责。提交核验记录时必须使用新数据包，不覆盖旧包。可换算量只在材料身份、数值、基准份数与单位全部可信时开放。

运行：`python scripts/validate_catalog_reviews.py --source-csv <原CSV> --reviews <审阅JSONL>`。通过后使用 `build_catalog_quality.py --reviews <文件>` 生成下一版本。首批按荤、素、汤、主食、甜品分层并选日常用途；人工另确认早餐资格与设备，不能仅靠菜名赋予人群或健康适用标签。
