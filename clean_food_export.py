#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Clean and profile food_export.csv without mutating the source file."""

from __future__ import annotations

import argparse
import csv
import re
import unicodedata
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse


SOURCE_COLUMNS = [
    "ID",
    "菜名",
    "类型",
    "材料",
    "标签",
    "图片",
    "难度",
    "时间",
    "热量千卡",
    "方法",
    "步骤",
]

HUMAN_COLUMNS = SOURCE_COLUMNS + ["烹饪分钟", "步骤数", "质量标记"]

MYSQL_COLUMNS = [
    "id",
    "name",
    "type",
    "cl",
    "fl",
    "step",
    "tags",
    "image",
    "difficulty",
    "cook_time",
    "ingredients_amounts",
    "steps",
    "step_images",
    "tips",
    "methods",
    "kcal",
]

VALID_TYPES = {"meat", "veg", "staple", "soup", "dessert"}
VALID_DIFFICULTIES = {"简单", "普通", "困难"}
DIFFICULTY_CODE_MAP = {"0": "简单", "1": "普通", "2": "困难"}
SUSPICIOUS_METHOD_VALUES = VALID_DIFFICULTIES | {"3"}

KNOWN_METHODS = [
    "白灼",
    "糖醋",
    "红烧",
    "凉拌",
    "油炸",
    "酱爆",
    "生吃",
    "刺身",
    "微波",
    "炒",
    "煮",
    "炸",
    "蒸",
    "煎",
    "烤",
    "炖",
    "煲",
    "酱",
    "焖",
    "烙",
    "汆",
    "卤",
    "煨",
    "烘",
    "焗",
    "拌",
]

TAG_SPLIT_RE = re.compile(r"[,，;；|]+")
SPACE_RE = re.compile(r"[ \t\r\n\f\v\u3000]+")
STEP_SEPARATOR_RE = re.compile(r"\s*#{3,}\s*")
CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def read_text(path: Path) -> tuple[str, str]:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "gb18030", "gbk"):
        try:
            return raw.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace"), "utf-8-replace"


def normalize_text(value: str | None) -> str:
    if value is None:
        return ""
    text = unicodedata.normalize("NFKC", str(value))
    text = CONTROL_CHAR_RE.sub("", text)
    return SPACE_RE.sub(" ", text).strip()


def normalize_tags(raw_tags: str) -> str:
    seen: set[str] = set()
    tags: list[str] = []
    for tag in TAG_SPLIT_RE.split(normalize_text(raw_tags)):
        cleaned = normalize_text(tag)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            tags.append(cleaned)
    return ",".join(tags)


def normalize_steps(raw_steps: str) -> tuple[str, int]:
    text = normalize_text(raw_steps)
    text = STEP_SEPARATOR_RE.sub("###", text)
    text = text.strip("#").strip()
    if not text:
        return "", 0
    parts = [part.strip() for part in text.split("###") if part.strip()]
    return "###".join(parts), len(parts)


def parse_positive_int(raw_value: str) -> int | None:
    value = normalize_text(raw_value)
    if not value:
        return None
    digits = "".join(ch for ch in value if ch.isdigit())
    if not digits:
        return None
    return int(digits)


def parse_kcal(raw_value: str) -> int | None:
    value = normalize_text(raw_value).replace(",", "")
    if not value:
        return None
    try:
        number = int(float(value))
    except ValueError:
        return None
    return number if number >= 0 else None


def valid_image_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def has_image_extension(url: str) -> bool:
    path = urlparse(url).path.lower()
    return path.endswith((".jpg", ".jpeg", ".png", ".webp"))


def infer_method(tags: str, steps: str) -> str:
    searchable = f"{tags},{steps[:80]}"
    for method in KNOWN_METHODS:
        if method in searchable:
            return method
    return ""


def normalize_difficulty(raw_value: str, flags: list[str]) -> str:
    value = normalize_text(raw_value)
    if value in VALID_DIFFICULTIES:
        return value
    if value in DIFFICULTY_CODE_MAP:
        flags.append("DIFFICULTY_CODE_NORMALIZED")
        return DIFFICULTY_CODE_MAP[value]
    if value:
        flags.append(f"DIFFICULTY_UNKNOWN:{value}")
    else:
        flags.append("DIFFICULTY_MISSING")
    return "未知"


def clean_row(row: dict[str, str]) -> tuple[dict[str, str | int], dict[str, str | int]]:
    flags: list[str] = []

    raw_id = normalize_text(row.get("ID"))
    try:
        recipe_id = int(raw_id)
    except ValueError:
        recipe_id = 0
        flags.append("ID_INVALID")

    name = normalize_text(row.get("菜名"))
    if not name:
        flags.append("NAME_MISSING")

    recipe_type = normalize_text(row.get("类型"))
    if recipe_type not in VALID_TYPES:
        flags.append(f"TYPE_INVALID:{recipe_type or 'EMPTY'}")

    materials = normalize_text(row.get("材料"))
    if not materials:
        flags.append("MATERIALS_MISSING")

    tags = normalize_tags(row.get("标签", ""))
    if not tags:
        flags.append("TAGS_MISSING")

    image = normalize_text(row.get("图片"))
    if not valid_image_url(image):
        flags.append("IMAGE_URL_INVALID")
    elif not has_image_extension(image):
        flags.append("IMAGE_EXTENSION_SUSPICIOUS")

    difficulty = normalize_difficulty(row.get("难度", ""), flags)

    cook_minutes = parse_positive_int(row.get("时间", ""))
    if cook_minutes is None:
        cook_time = normalize_text(row.get("时间"))
        flags.append("COOK_TIME_INVALID")
    else:
        cook_time = f"{cook_minutes}分钟"
        if cook_minutes > 240:
            flags.append("COOK_TIME_OUTLIER")

    kcal = parse_kcal(row.get("热量千卡", ""))
    if kcal is None:
        kcal = 0
        flags.append("KCAL_INVALID")
    elif kcal == 0:
        flags.append("KCAL_ZERO_AS_UNKNOWN")
    elif kcal > 3000:
        flags.append("KCAL_OUTLIER_GT_3000")

    steps, step_count = normalize_steps(row.get("步骤", ""))
    if not steps:
        flags.append("STEPS_MISSING")
    elif len(steps) < 30:
        flags.append("STEPS_TOO_SHORT")
    if len(steps) >= 195:
        flags.append("STEPS_POSSIBLY_TRUNCATED")
    if step_count <= 1 and len(steps) >= 80:
        flags.append("STEPS_NOT_STRUCTURED")

    method = normalize_text(row.get("方法"))
    if (not method) or method in SUSPICIOUS_METHOD_VALUES:
        inferred_method = infer_method(tags, steps)
        if inferred_method:
            method = inferred_method
            flags.append("METHOD_INFERRED")
        else:
            method = "未知"
            flags.append("METHOD_UNKNOWN")

    flag_text = ";".join(flags)

    human_row: dict[str, str | int] = {
        "ID": recipe_id,
        "菜名": name,
        "类型": recipe_type,
        "材料": materials,
        "标签": tags,
        "图片": image,
        "难度": difficulty,
        "时间": cook_time,
        "热量千卡": kcal,
        "方法": method,
        "步骤": steps,
        "烹饪分钟": cook_minutes or "",
        "步骤数": step_count,
        "质量标记": flag_text,
    }

    mysql_row: dict[str, str | int] = {
        "id": recipe_id,
        "name": name,
        "type": recipe_type,
        "cl": "",
        "fl": "",
        "step": "",
        "tags": tags,
        "image": image,
        "difficulty": difficulty,
        "cook_time": cook_time,
        "ingredients_amounts": materials,
        "steps": steps,
        "step_images": "[]",
        "tips": "",
        "methods": method,
        "kcal": kcal,
    }
    return human_row, mysql_row


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str | int]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def build_report(
    source_path: Path,
    output_dir: Path,
    encoding: str,
    source_count: int,
    cleaned_rows: list[dict[str, str | int]],
    issues_rows: list[dict[str, str | int]],
) -> str:
    flag_counter: Counter[str] = Counter()
    type_counter = Counter(str(row["类型"]) for row in cleaned_rows)
    difficulty_counter = Counter(str(row["难度"]) for row in cleaned_rows)
    method_counter = Counter(str(row["方法"]) for row in cleaned_rows)

    for row in cleaned_rows:
        for flag in str(row["质量标记"]).split(";"):
            if flag:
                flag_counter[flag.split(":", 1)[0]] += 1

    id_values = [int(row["ID"]) for row in cleaned_rows if row["ID"]]
    id_gap_count = 0
    if id_values:
        id_set = set(id_values)
        id_gap_count = sum(1 for i in range(min(id_values), max(id_values) + 1) if i not in id_set)

    lines = [
        "# food_export.csv 数据质量报告",
        "",
        "## 概览",
        "",
        f"- 源文件: `{source_path}`",
        f"- 检测编码: `{encoding}`",
        f"- 原始行数: {source_count}",
        f"- 清洗后行数: {len(cleaned_rows)}",
        f"- 需复核行数: {len(issues_rows)}",
        f"- ID 缺口数: {id_gap_count}（不建议重排 ID，通常代表历史删除或筛选）",
        "",
        "## 主要问题",
        "",
    ]

    for flag, count in flag_counter.most_common():
        lines.append(f"- {flag}: {count}")

    lines.extend(
        [
            "",
            "## 枚举分布",
            "",
            f"- 类型: {dict(type_counter.most_common())}",
            f"- 难度: {dict(difficulty_counter.most_common())}",
            f"- 方法 Top 20: {dict(method_counter.most_common(20))}",
            "",
            "## 输出文件",
            "",
            f"- 清洗数据: `{output_dir / 'food_export_cleaned.csv'}`",
            f"- MySQL 导入版: `{output_dir / 'food_export_cleaned_mysql.csv'}`",
            f"- 问题明细: `{output_dir / 'food_export_issues.csv'}`",
            "",
            "## 建议",
            "",
            "- `材料` 字段全量缺失，应优先回到上游导出或爬取逻辑修复。",
            "- `热量千卡=0` 更像未知值，不应在推荐、排序或营养分析中当作真实 0 千卡。",
            "- `步骤` 大量接近 200 字，疑似源数据被截断，应回查数据库字段、导出 SQL 或原始采集文件。",
            "- `难度=3` 未做强行映射，已标记为未知，建议确认业务字典后再批量修正。",
            "- `方法=普通/简单/困难` 疑似字段串位，脚本会尝试从标签和步骤中推断，并保留质量标记。",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean food_export.csv and produce quality reports.")
    parser.add_argument("--input", default="food_export.csv", help="Source CSV path.")
    parser.add_argument("--output-dir", default="cleaned", help="Directory for cleaned outputs.")
    args = parser.parse_args()

    source_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    text, encoding = read_text(source_path)
    reader = csv.DictReader(text.splitlines())
    missing_columns = [column for column in SOURCE_COLUMNS if column not in (reader.fieldnames or [])]
    if missing_columns:
        raise ValueError(f"CSV 缺少必要列: {', '.join(missing_columns)}")

    human_rows: list[dict[str, str | int]] = []
    mysql_rows: list[dict[str, str | int]] = []
    for row in reader:
        human_row, mysql_row = clean_row(row)
        human_rows.append(human_row)
        mysql_rows.append(mysql_row)

    issues_rows = [row for row in human_rows if row["质量标记"]]

    write_csv(output_dir / "food_export_cleaned.csv", HUMAN_COLUMNS, human_rows)
    write_csv(output_dir / "food_export_cleaned_mysql.csv", MYSQL_COLUMNS, mysql_rows)
    write_csv(output_dir / "food_export_issues.csv", HUMAN_COLUMNS, issues_rows)

    report = build_report(source_path, output_dir, encoding, len(human_rows), human_rows, issues_rows)
    (output_dir / "food_export_quality_report.md").write_text(report, encoding="utf-8")

    print(f"OK source_rows={len(human_rows)} issue_rows={len(issues_rows)} output_dir={output_dir.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
