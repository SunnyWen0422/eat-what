# 首批可信菜谱核验标准

每次运行 `scripts/build_catalog_quality.py` 写新目录。当前治理版本保留6,665道菜的ID，排除52条描述词伪材料，100道候选仍是 UNREVIEWED。生成代码中的统一克数不是原配方证据。

审阅者逐道核对原配方：材料身份和形态、来源原文与定位、基准人数、每项用量、步骤前后关系、时间来源、图片使用依据。允许份数/数量/营养保持未知。静态核验与实际做菜分别记录，未实做不得填 cookedAt。

审阅文件使用 JSONL，每条包含 `dishId`、当前候选的 `sourceHash`、`reviewStatus:"VERIFIED"`、`sourceRef`、`reviewer`、ISO `reviewedAt`、可空 `basePeople`、`stepStatus`、`imageRights`、`ingredientEvidence`。材料证据以有效材料名为键，值含 sourceRef；有真实数值时增加 quantityValue、unit、quantityEvidence，无数值保持 null。不允许凭习惯填写数字或用模型生成证据。

`stepStatus` 为 VERIFIED/UNKNOWN，`imageRights` 为 VERIFIED/UNKNOWN/REJECTED；日期、哈希、材料集合与正数量由校验器检查。这只是结构门禁，审阅者仍须对证据负责。提交核验记录时必须使用新数据包，不覆盖旧包。可换算量只在材料身份、数值、基准份数与单位全部可信时开放。

运行：`python scripts/validate_catalog_reviews.py --source-csv <原CSV> --reviews <审阅JSONL>`。通过后使用 `build_catalog_quality.py --reviews <文件>` 生成下一版本。首批按荤、素、汤、主食、甜品分层并选日常用途；人工另确认早餐资格与设备，不能仅靠菜名赋予人群或健康适用标签。
