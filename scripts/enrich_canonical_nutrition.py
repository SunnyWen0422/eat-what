"""Offline, source-preserving nutrition enrichment for the canonical fixed catalog.

Only reviewed, exact identity/specification rules are applied. Official ZIP files
are parsed afresh; missing nutrients, densities, yields and amounts stay unknown.
The existing Java business calculator performs every calculation. No network,
database, application settings, credentials or model providers are used.
"""
from __future__ import annotations

import argparse
import collections
import copy
import csv
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NUTRIENTS = ("energyKcal", "proteinG", "fatG", "carbohydrateG", "fiberG", "sodiumMg")
TFDA_METRICS = {"熱量": ("energyKcal", "kcal"), "粗蛋白": ("proteinG", "g"),
                "粗脂肪": ("fatG", "g"), "總碳水化合物": ("carbohydrateG", "g"),
                "膳食纖維": ("fiberG", "g"), "鈉": ("sodiumMg", "mg")}
USDA_METRICS = {"1003": "proteinG", "1004": "fatG", "1005": "carbohydrateG",
                "1079": "fiberG", "1093": "sodiumMg"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def definition_sha(value):
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def load(path):
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, f"Duplicate JSON key: {key}")
            out[key] = value
        return out
    return json.loads(Path(path).read_text("utf-8"), object_pairs_hook=pairs,
                      parse_constant=lambda value: require(False, f"Nonfinite JSON: {value}"))


def save(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", "utf-8")


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def parse_tfda(path):
    records = {}
    with zipfile.ZipFile(path) as archive:
        names = [name for name in archive.namelist() if name.endswith(".csv")]
        require(len(names) == 1, "Expected one TFDA CSV")
        for row in csv.DictReader(io.TextIOWrapper(archive.open(names[0]), encoding="utf-8-sig")):
            key = row["整合編號"]
            record = records.setdefault(key, {"id": key, "name": row["樣品名稱"],
                "description": row["內容物描述"], "publisher": "衛生福利部食品藥物管理署",
                "archive": path.name, "nutrients": {}})
            require(record["name"] == row["樣品名稱"] and record["description"] == row["內容物描述"],
                    f"Conflicting TFDA identity {key}")
            if row["分析項"] not in TFDA_METRICS or not row["每100克含量"].strip():
                continue
            nutrient, unit = TFDA_METRICS[row["分析項"]]
            require(row["含量單位"] == unit, f"Wrong nutrient unit {key}")
            value = float(row["每100克含量"])
            require(nutrient not in record["nutrients"] or record["nutrients"][nutrient] == value,
                    f"Conflicting TFDA nutrient {key} {nutrient}")
            record["nutrients"][nutrient] = value
    return records


def parse_usda(path):
    with zipfile.ZipFile(path) as archive:
        def read(suffix):
            names = [name for name in archive.namelist() if name.endswith("/" + suffix)]
            require(len(names) == 1, f"Expected one USDA {suffix}")
            return csv.DictReader(io.TextIOWrapper(archive.open(names[0]), encoding="utf-8-sig"))
        units = {row["id"]: row["unit_name"].lower() for row in read("nutrient.csv")}
        require(all(units.get(key) == ("mg" if key == "1093" else "g") for key in USDA_METRICS),
                "USDA nutrient units changed")
        require(all(units.get(key) == "kcal" for key in ("1008", "2047", "2048")),
                "USDA energy units changed")
        records = {row["fdc_id"]: {"id": row["fdc_id"], "name": row["description"],
            "description": row["description"], "publisher": "USDA FoodData Central",
            "archive": path.name, "nutrients": {}, "energy": {}}
            for row in read("food.csv") if row["data_type"] in ("foundation_food", "sr_legacy_food")}
        for row in read("food_nutrient.csv"):
            if row["fdc_id"] not in records or not row["amount"]:
                continue
            record = records[row["fdc_id"]]
            nutrient = USDA_METRICS.get(row["nutrient_id"])
            if nutrient:
                value = float(row["amount"])
                require(nutrient not in record["nutrients"] or record["nutrients"][nutrient] == value,
                        f"Conflicting USDA nutrient {record['id']} {nutrient}")
                record["nutrients"][nutrient] = value
            if row["nutrient_id"] in ("2048", "2047", "1008"):
                record["energy"][row["nutrient_id"]] = float(row["amount"])
        for record in records.values():
            for key in ("2048", "2047", "1008"):
                if key in record["energy"]:
                    record["nutrients"]["energyKcal"] = record["energy"][key]
                    record["energyNutrientId"] = key
                    break
        return records


def parse_mext(path):
    """Read the official corrected workbook using its published component IDs.

    Parentheses are publisher estimates, retained explicitly. Tr, dashes and
    missing cells are never converted to zero. No estimates are made locally.
    """
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as archive:
        shared = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        # Phonetic rPh annotations are not part of the cell's displayed text.
        strings = ["".join(part.text or "" for part in
                           [*node.findall("s:t", ns), *node.findall("s:r/s:t", ns)])
                   for node in shared.findall("s:si", ns)]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        rows = []
        for row in sheet.findall("s:sheetData/s:row", ns):
            cells = {}
            for cell in row.findall("s:c", ns):
                column = re.sub(r"[0-9]", "", cell.attrib["r"])
                value = cell.find("s:v", ns)
                if value is None:
                    continue
                cells[column] = strings[int(value.text)] if cell.attrib.get("t") == "s" else value.text
            rows.append(cells)
    headers = next((row for row in rows if row.get("D") == "成分識別子"), None)
    expected = {"G": ("ENERC_KCAL", "energyKcal"), "J": ("PROT-", "proteinG"),
                "M": ("FAT-", "fatG"), "U": ("CHOCDF-", "carbohydrateG"),
                "S": ("FIB-", "fiberG"), "X": ("NA", "sodiumMg")}
    require(headers and all(headers.get(col) == key for col, (key, _) in expected.items()),
            "MEXT component identifiers changed")
    records = {}
    for row in rows:
        if not re.fullmatch(r"[0-9]{5}", row.get("B", "")):
            continue
        key = row["B"]
        require(key not in records, f"Duplicate MEXT food ID {key}")
        record = {"id": key, "name": row["D"], "description": row["D"] + "; " + row.get("BJ", ""),
            "publisher": "文部科学省 日本食品標準成分表（八訂）増補2023年・2026年3月27日訂正版",
            "archive": path.name, "nutrients": {}, "publishedEstimates": [], "rawNutrientCells": {}}
        for col, (_, nutrient) in expected.items():
            raw = row.get(col, "").strip()
            record["rawNutrientCells"][nutrient] = raw
            if re.fullmatch(r"\([0-9]+(?:\.[0-9]+)?\)", raw):
                record["publishedEstimates"].append(nutrient)
                raw = raw[1:-1]
            if re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", raw):
                record["nutrients"][nutrient] = float(raw)
        records[key] = record
    return records


def profile(catalog):
    """Profile all fields, including nested missingness, types, nulls and ranges."""
    fields = {}
    def visit(value, path):
        info = fields.setdefault(path, {"present": 0, "null": 0, "types": collections.Counter()})
        info["present"] += 1
        info["types"][type(value).__name__] += 1
        if value is None:
            info["null"] += 1
        elif isinstance(value, dict):
            for key, child in value.items():
                visit(child, path + "." + key)
        elif isinstance(value, list):
            for child in value:
                visit(child, path + "[]")
        elif isinstance(value, (float, int)) and not isinstance(value, bool):
            info["min"] = min(info.get("min", value), value)
            info["max"] = max(info.get("max", value), value)
    visit(catalog, "$ outer")
    for path, info in fields.items():
        if "." in path and not path.endswith("[]"):
            parent = path.rsplit(".", 1)[0]
            info["absent"] = fields[parent]["types"].get("dict", 0) - info["present"]
    definitions = {item["id"]: item for item in catalog["ingredients"]}
    frequencies = collections.Counter(line["ingredientId"] for recipe in catalog["recipes"]
                                      for line in recipe["ingredients"])
    reasons = collections.Counter()
    missing = collections.Counter()
    for recipe in catalog["recipes"]:
        lines = {line["id"]: line for line in recipe["ingredients"]}
        for reason in recipe["calculatedNutrition"].get("unknownReasons", []):
            reasons[reason["reason"]] += 1
            missing[(lines[reason["lineId"]]["ingredientId"], reason["reason"])] += 1
    duplicate_names = []
    by_name = collections.defaultdict(list)
    for item in catalog["ingredients"]:
        by_name[item["name"]].append(item["id"])
    for name, identifiers in by_name.items():
        if len(identifiers) > 1:
            duplicate_names.append({"name": name, "ids": identifiers})
    anomalies = []
    for item in catalog["ingredients"]:
        facts = item.get("nutritionPer100g")
        if facts:
            if set(facts) != set(NUTRIENTS) or any(not isinstance(v, (int, float)) or isinstance(v, bool)
                  or not math.isfinite(v) or v < 0 for v in facts.values()):
                anomalies.append({"ingredientId": item["id"], "kind": "invalidNutrition"})
            # Useful review signals only: conventional carbohydrate includes fiber,
            # and mixed analytical methods need not have a strict 100 g mass sum.
            if facts.get("energyKcal", 0) > 1000 or facts.get("sodiumMg", 0) > 100000:
                anomalies.append({"ingredientId": item["id"], "kind": "implausibleNutrientRange"})
    return {"recipes": len(catalog["recipes"]), "definitions": len(definitions),
        "complete": sum(r["calculatedNutrition"]["completeness"] == "complete" for r in catalog["recipes"]),
        "nutritionMissingDefinitions": sum(not item.get("nutritionPer100g") for item in definitions.values()),
        "unknownReasons": dict(reasons), "fields": fields,
        "duplicateRecipeIds": len(catalog["recipes"]) - len({r["id"] for r in catalog["recipes"]}),
        "duplicateIngredientIds": len(catalog["ingredients"]) - len(definitions),
        "duplicateIngredientNames": duplicate_names, "anomalies": anomalies,
        "ingredientFrequencies": dict(frequencies),
        "highFrequencyUnknown": [{"ingredientId": key[0], "name": definitions[key[0]]["name"],
            "reason": key[1], "lineCount": value} for key, value in missing.most_common()]}


def apply_rules(catalog, rules, records, archives):
    result = copy.deepcopy(catalog)
    definitions = {item["id"]: item for item in result["ingredients"]}
    changes = []
    used = set()
    for rule in rules["matches"]:
        iid = rule["ingredientId"]
        require(iid not in used, f"Duplicate mapping rule: {iid}")
        used.add(iid)
        item = definitions[iid]
        require(item["name"] == rule["expectedName"], f"Target identity drift: {iid}")
        require(item.get("nutritionPer100g") is None, f"Refusing to replace known nutrition: {iid}")
        require(definition_sha(item) == rule.get("expectedDefinitionSha256"),
                f"Target specification/provenance drift requires review: {iid}")
        require(bool(rule["equivalenceEvidence"]), f"Missing equivalence justification: {iid}")
        record = records[(rule["archive"], rule["sourceId"])]
        require(record["name"] == rule["expectedSourceName"], f"Source identity drift: {iid}")
        facts = record["nutrients"]
        require(not record.get("publishedEstimates") or rule.get("allowPublishedEstimates") is True,
                f"Publisher estimate requires explicit reviewed adoption: {iid}")
        require(set(facts) == set(NUTRIENTS), f"Incomplete official nutrients: {iid}")
        require(all(isinstance(v, (int, float)) and not isinstance(v, bool)
            and math.isfinite(v) and v >= 0 for v in facts.values()), f"Invalid official nutrients: {iid}")
        before = copy.deepcopy(item)
        item["nutritionPer100g"] = {key: facts[key] for key in NUTRIENTS}
        item["compositionSource"] = {**copy.deepcopy(item.get("compositionSource", {})),
            "sourceId": record["id"], "publisher": record["publisher"],
            "description": record["description"], "archive": record["archive"],
            "archiveSha256": archives[rule["archive"]]["sha256"],
            "referenceUrl": archives[rule["archive"]]["url"],
            "sourceSampleName": record["name"], "sourceComplete": True,
            "adoptionNote": "官方每100克食品类别参考值；非本品牌检测值。仅补同身份、规格与加工态营养；不推导用量、密度、采购率或过敏原。",
            "equivalenceEvidence": rule["equivalenceEvidence"],
            "enrichmentRuleVersion": rules["version"]}
        if record.get("publishedEstimates"):
            item["compositionSource"]["publisherEstimatedNutrients"] = record["publishedEstimates"]
            item["compositionSource"]["adoptionNote"] += "括号数值为文科省已发布推定值，并非本地补零或新推算；保留原单元格与字段标记供审计。"
        if archives[rule["archive"]].get("requiredAttribution"):
            item["compositionSource"]["requiredAttribution"] = archives[rule["archive"]]["requiredAttribution"]
        changes.append({"ingredientId": iid, "rule": rule, "before": before,
                        "after": copy.deepcopy(item), "sourceRecord": record})
    return result, changes


JAVA_BRIDGE = r'''
import com.eatwhat.service.CanonicalRecipeCalculator;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.io.*;
import java.util.*;
public final class OfflineNutritionBridge {
 public static void main(String[] args) throws Exception {
  ObjectMapper mapper=new ObjectMapper();
  JsonNode catalog=mapper.readTree(new File(args[0]));
  Map<String,JsonNode> definitions=new HashMap<>();
  for(JsonNode item:catalog.path("ingredients"))definitions.put(item.path("id").asText(),item);
  CanonicalRecipeCalculator calculator=new CanonicalRecipeCalculator();
  try(PrintWriter writer=new PrintWriter(new OutputStreamWriter(new FileOutputStream(args[1]),"UTF-8"))){
   for(JsonNode recipe:catalog.path("recipes")){
    ObjectNode output=mapper.createObjectNode(); output.set("recipeId",recipe.path("id"));
    output.set("nutrition",calculator.calculate(recipe,definitions,null).path("nutrition"));
    writer.println(mapper.writeValueAsString(output));
   }
  }
 }
}
'''


def compile_calculator(output, classpath=None):
    require(shutil.which("javac") and shutil.which("java"), "Local JDK required; no download performed")
    if classpath is None:
        base = Path.home() / ".m2/repository/com/fasterxml/jackson/core"
        jars = [base / artifact / "2.13.5" / f"{artifact}-2.13.5.jar"
                for artifact in ("jackson-core", "jackson-databind", "jackson-annotations")]
        require(all(path.is_file() for path in jars), "Supply --jackson-classpath with local Jackson JARs")
        classpath = os.pathsep.join(str(path) for path in jars)
    classes = output / "java-calculator"
    classes.mkdir(exist_ok=True)
    bridge = classes / "OfflineNutritionBridge.java"
    bridge.write_text(JAVA_BRIDGE, "utf-8")
    calculator = ROOT / "backend/src/main/java/com/eatwhat/service/CanonicalRecipeCalculator.java"
    subprocess.run(["javac", "-encoding", "UTF-8", "-cp", classpath, "-d", str(classes),
                    str(calculator), str(bridge)], check=True, capture_output=True, text=True)
    return os.pathsep.join((str(classes), classpath)), sha(calculator)


def recalculate(source, output, classpath):
    subprocess.run(["java", "-cp", classpath, "OfflineNutritionBridge", str(source), str(output)],
                   check=True, capture_output=True, text=True)
    rows = [json.loads(line) for line in output.read_text("utf-8").splitlines()]
    require(len(rows) == len({row["recipeId"] for row in rows}), "Duplicate calculator output")
    return {row["recipeId"]: row["nutrition"] for row in rows}


def assert_baseline(catalog, recalculated):
    for recipe in catalog["recipes"]:
        original, actual = recipe["calculatedNutrition"], recalculated[recipe["id"]]
        for key in ("completeness", "total", "unknownLineIds", "unknownReasons"):
            require(original[key] == actual[key], f"Baseline calculator mismatch: {recipe['id']} {key}")
        require(original["quantifiedSubtotal"]["total"] == actual["quantifiedSubtotal"]["total"],
                f"Baseline subtotal mismatch: {recipe['id']}")
        require(actual["perServing"] is None, "Implicit per-person nutrition is forbidden")


def assert_preservation(original, candidate):
    for before, after in zip(original["recipes"], candidate["recipes"]):
        require({k: v for k, v in before.items() if k != "calculatedNutrition"} ==
                {k: v for k, v in after.items() if k != "calculatedNutrition"},
                f"Recipe content changed: {before['id']}")
    require(len(original["recipes"]) == len(candidate["recipes"]), "Recipe count changed")
    require([i["id"] for i in original["ingredients"]] == [i["id"] for i in candidate["ingredients"]],
            "Ingredient identities changed")
    allowed = {"nutritionPer100g", "compositionSource"}
    for before, after in zip(original["ingredients"], candidate["ingredients"]):
        require({k: v for k, v in before.items() if k not in allowed} ==
                {k: v for k, v in after.items() if k not in allowed}, f"Ingredient semantics changed: {before['id']}")
    for key in original:
        if key == "sourceAttribution":
            require(all(candidate[key].get(k) == v for k, v in original[key].items()),
                    "Existing attribution changed")
            require(set(candidate[key]) - set(original[key]) <= {"nutritionEnrichment"},
                    "Unexpected attribution changes")
        elif key not in {"catalogRevision", "ingredients", "recipes", "sourceCatalogRevision"}:
            require(original[key] == candidate[key], f"Contract metadata changed: {key}")


def run(args):
    source, output = args.source.resolve(), args.output_dir.resolve()
    require(source != output and output not in source.parents, "Output must not contain original source")
    original_sha = sha(source)
    original = load(source)
    validator = module(ROOT / "scripts/canonical_catalog_import.py", "enrichment_validator")
    validator.validate_bundle(original)
    before = profile(original)
    output.mkdir(parents=True, exist_ok=True)
    save(output / "profile-before.json", before)
    rules = load(args.rules)
    archives, records = {}, {}
    for archive in rules["archives"]:
        path = (args.supplementary_reference_dir if archive.get("location") == "supplementary"
                else args.reference_dir) / archive["file"]
        digest = sha(path)
        require(digest == archive["sha256"], f"Official archive hash mismatch: {path.name}")
        archives[path.name] = {**archive, "path": str(path.resolve())}
        parser = {"tfda": parse_tfda, "usda": parse_usda, "mext": parse_mext}[archive["format"]]
        parsed = parser(path)
        for key, record in parsed.items():
            records[(path.name, key)] = record
    candidate, changes = apply_rules(original, rules, records, archives)
    candidate["sourceCatalogRevision"] = original["catalogRevision"]
    candidate["catalogRevision"] = args.revision
    candidate["sourceAttribution"]["nutritionEnrichment"] = {
        "rulesVersion": rules["version"], "referenceBasis": "Published official edible-food per-100g reference values",
        "sources": copy.deepcopy(rules["archives"])}
    provisional = output / "candidate-before-calculation.json"
    save(provisional, candidate)
    classpath, calculator_sha = compile_calculator(output, args.jackson_classpath)
    baseline = recalculate(source, output / "baseline-java-nutrition.jsonl", classpath)
    assert_baseline(original, baseline)
    calculated = recalculate(provisional, output / "candidate-java-nutrition.jsonl", classpath)
    # The established fixed-recipe dependency fingerprint already includes the
    # complete definitions/provenance; no business arithmetic is implemented here.
    import sys
    sys.path.insert(0, str(ROOT / "scripts"))
    fingerprint = module(ROOT / "scripts/prepare_catalog_v4.py", "enrichment_fingerprint").fingerprint
    definitions = {item["id"]: item for item in candidate["ingredients"]}
    projection = module(ROOT / "recommend-service/canonical_catalog.py", "enrichment_projection")
    improved, changed_recipes = [], []
    for recipe in candidate["recipes"]:
        nutrition = calculated[recipe["id"]]
        recipe["calculatedNutrition"] = {"ruleVersion": candidate["nutritionRuleVersion"],
            "dependencySha256": fingerprint(recipe, definitions, candidate["nutritionRuleVersion"]), **nutrition}
        projection.project_recipe(recipe, definitions, candidate)
        if baseline[recipe["id"]] != nutrition:
            changed_recipes.append(recipe["id"])
        if baseline[recipe["id"]]["completeness"] == "partial" and nutrition["completeness"] == "complete":
            improved.append(recipe["id"])
        require(not (baseline[recipe["id"]]["completeness"] == "complete" and nutrition["completeness"] != "complete"),
                "Existing complete recipe regressed")
    assert_preservation(original, candidate)
    validator.validate_bundle(candidate)
    after = profile(candidate)
    require(sha(source) == original_sha, "Original source changed during run")
    candidate_path = output / "runtime-catalog-enriched.json"
    save(candidate_path, candidate)
    save(output / "profile-after.json", after)
    changed_ids = {change["ingredientId"] for change in changes}
    excluded_evidence = {
        "soy-sauce-dark": "老抽不是TFDA淡色酱油或日式浓口/溜酱油；没有相同成品规格及可靠ml密度。",
        "chili-oil": "成品辣椒油的辣椒与油比例、含渣和盐分未知；不能用纯食用油替代。",
        "spice-thirteen": "十三香的组分及比例未确定；不使用五香粉、咖喱粉或单一香辛料近似。",
        "vinegar-aromatic": "TFDA香醋条目描述糖蜜、食盐、味精，不能证明等同目标中式成品香醋；ml密度也未知。",
        "wood-ear-rehydrated": "目标是已泡发沥干木耳；MEXT相似条目是ゆで（煮熟），TFDA鲜木耳不是泡发干木耳。",
        "shiitake-rehydrated": "已泡发干香菇不等同鲜香菇或煮熟香菇；不能推定复水倍率。",
        "konjac-hydrated": "MEXT精粉魔芋块脂肪字段为Tr（微量），不填0；生芋魔芋块又与目标未明原料不等同。",
        "recheck-g3-lemon-zest": "鲜外皮屑(zest)与USDA整层柠檬果皮(peel，含白瓤)规格不完全等同，撤销候选。",
        "identity-parsley-food": "仅确认欧芹食用类别，未明确鲜/干；不直接采用鲜欧芹数据。",
        "mustard-dried-pickled-desalted": "泡洗脱盐沥干梅干菜的含水/含盐状态与未脱盐的干制成品不同。",
        "tofu-sheet-pressed": "千张是压制豆腐片，MEXT Yuba是豆浆表面揭膜；同称豆皮不代表规格相同。",
        "buckwheat-noodle-dry": "MEXT干荞麦面条注明65%小麦粉与35%荞麦粉；目标未限定该比例，未采用。"}
    excluded = [{"ingredientId": item["id"], "name": item["name"],
        "lineCount": before["ingredientFrequencies"].get(item["id"], 0),
        "reason": excluded_evidence.get(item["id"], "No reviewed official match with equivalent identity, specification, processing state and six complete nutrients; no nearest-name substitution or invented nutrient/density.")}
        for item in original["ingredients"] if item.get("nutritionPer100g") is None and item["id"] not in changed_ids]
    audit = {"source": {"path": str(source), "sha256Before": original_sha, "sha256After": sha(source),
            "revision": original["catalogRevision"]},
        "candidate": {"path": str(candidate_path), "sha256": sha(candidate_path), "revision": candidate["catalogRevision"]},
        "contract": {"catalogContractVersion": 4, "quantityPolicy": "fixed-recipe-v1",
            "quantityBasis": "SPECIFIED_PRODUCT_INPUT", "calculationRuleVersion": candidate["nutritionRuleVersion"],
            "calculationImplementation": "existing Java CanonicalRecipeCalculator; unmodified source compiled offline",
            "calculatorSha256": calculator_sha, "rulesVersion": rules["version"], "rulesSha256": sha(args.rules)},
        "archives": archives, "before": {k: before[k] for k in ("recipes", "definitions", "complete", "nutritionMissingDefinitions", "unknownReasons")},
        "after": {k: after[k] for k in ("recipes", "definitions", "complete", "nutritionMissingDefinitions", "unknownReasons")},
        "baselineAllRecipesMatched": len(baseline), "candidateAllRecipesCalculated": len(calculated),
        "pythonProjectionValidated": len(candidate["recipes"]), "changedDefinitions": len(changes),
        "newCompleteRecipeIds": improved, "changedNutritionRecipeIds": changed_recipes,
        "unitConversionsAdded": 0, "invariants": {"originalBytesUnchanged": True, "recipeContentUnchanged": True,
            "idsOrderAmountsStepsUnchanged": True, "existingNutritionNotReplaced": True,
            "noCompleteToPartialRegression": True, "noInferredDensitiesYieldsAmounts": True,
            "noPartialTotal": True, "noImplicitPerPerson": True}, "changes": changes,
        "excludedUncertainMappings": excluded,
        "sourceRestrictions": [{"url": "https://www.cfs.gov.hk/sc_chi/nutrient/",
            "decision": "Not used: official NIIS terms restrict data to personal non-commercial use and reference."}],
        "publishedEstimateAdoptions": [{"ingredientId": change["ingredientId"],
            "nutrients": change["sourceRecord"]["publishedEstimates"]} for change in changes
            if change["sourceRecord"].get("publishedEstimates")]}
    save(output / "nutrition-audit.json", audit)
    manifest = {key: audit[key] for key in ("source", "candidate", "contract", "archives", "before", "after",
                                           "changedDefinitions", "unitConversionsAdded", "invariants")}
    save(output / "source-manifest.json", manifest)
    report = ["# 全量营养补全审计", "", f"原库：{before['recipes']} 道菜 / {before['definitions']} 个定义；营养完整 {before['complete']} 道。",
        f"候选：营养完整 {after['complete']} 道，新增 {len(improved)} 道；补全 {len(changes)} 个定义，影响 {len(changed_recipes)} 道营养计算。",
        f"仍缺营养定义 {after['nutritionMissingDefinitions']} 个，部分营养菜品 {after['recipes'] - after['complete']} 道。",
        "", "## 数据与计算证据", "", f"原件 SHA256：`{original_sha}`（运行前后相同）。",
        f"候选 SHA256：`{sha(candidate_path)}`。", f"候选版本：`{args.revision}`。",
        f"计算版本：`{candidate['nutritionRuleVersion']}`；现有 Java 计算源码 SHA256：`{calculator_sha}`。",
        "直接使用当前 Java 业务计算器，全量原库的完整状态、整菜营养、已知小计和缺失原因逐项相同；全量候选复算并通过 Python 真实读适配器与导入结构校验。",
        "原库缓存中的旧来源人数小计不作为个人摄入，候选缓存与当前 Java 对齐：未提供人数时每人字段为 null。",
        "所有 ID、原始材料行、用量、适量空值、可选开关、步骤及其他食谱字段逐项保持；已有已知营养没有替换。",
        "", "## 采用与排除", "",
        "只采用规则表中逐个核对过的官方同身份、同规格、同加工态每100克记录；六项字段齐全才采用，不补缺失项为零。样品参考值不是该品牌或这盘菜的检测值。",
        "官方压缩包直接重读、逐项检查单位与数值冲突并核对冻结 SHA256；每个映射保留原定义、采用后定义、原官方记录及等同性依据。",
        "MEXT括号数字是官方已发布的推定值，逐字段保留标记与原单元格；Tr（微量）、短横线和空格没有补零。碳水采用总碳水CHOCDF-，不是可利用碳水，钠采用mg而非食盐当量。",
        "没有新加密度、单件重量、采购率或用量。老抽不能换普通酱油，辣椒油不能换植物油，十三香不能换邻近香料；泡发/鲜、带骨壳/净肉、加工保留率不明均保留未知。",
        f"未采用的不确定映射 {len(excluded)} 个逐条保存在 nutrition-audit.json。香港食安中心NIIS因官方个人非商业用途限制，未进入候选。", "", "## 剩余原因（材料行原因数，可重叠）", ""]
    report.extend(f"- {key}: {value}" for key, value in after["unknownReasons"].items())
    report += ["", "## 来源", ""]
    report.extend(f"- {entry['publisher']}：{entry['url']}；冻结归档 {entry['file']}；SHA256 `{entry['sha256']}`。" for entry in rules["archives"])
    report += ["", "## 验证边界", "", "本地数据及实际业务计算器验证；未访问数据库、生产服务或外部模型，未部署。未声称所有食材均存在可安全采用的公开来源。"]
    (output / "nutrition-audit.md").write_text("\n".join(report) + "\n", "utf-8")
    provisional.unlink()  # Only this run's known intermediate; original never edited.
    print(json.dumps(manifest, ensure_ascii=False))
    return audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--reference-dir", type=Path, required=True)
    parser.add_argument("--supplementary-reference-dir", type=Path,
                        help="Directory containing separately downloaded public references")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--rules", type=Path, default=ROOT / "scripts/canonical-nutrition-matches.json")
    parser.add_argument("--revision", default="eatwhat-catalog-20261028-nutrition-enriched-1")
    parser.add_argument("--jackson-classpath")
    args = parser.parse_args()
    if args.supplementary_reference_dir is None:
        args.supplementary_reference_dir = args.output_dir / "reference"
    run(args)


if __name__ == "__main__":
    main()
