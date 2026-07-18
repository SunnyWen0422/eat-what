#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""执行数据库迁移：为 food 表添加新字段"""

import os
import sys

import pymysql

DB_CONFIG = {
    'host': '127.0.0.1',
    'user': 'root',
    'password': os.environ.get('DB_PASSWORD', ''),
    'database': 'food',
    'charset': 'utf8mb4'
}

# 字段定义：(列名, 完整的ALTER语句)
COLUMN_DEFS = [
    ('tags',                "ALTER TABLE food ADD COLUMN tags VARCHAR(500) DEFAULT '' COMMENT '标签，逗号分隔'"),
    ('image',               "ALTER TABLE food ADD COLUMN image VARCHAR(500) DEFAULT '' COMMENT '菜品图片URL'"),
    ('difficulty',          "ALTER TABLE food ADD COLUMN difficulty VARCHAR(20) DEFAULT '' COMMENT '难度'"),
    ('cook_time',           "ALTER TABLE food ADD COLUMN cook_time VARCHAR(50) DEFAULT '' COMMENT '烹饪时间'"),
    ('ingredients_amounts', "ALTER TABLE food ADD COLUMN ingredients_amounts TEXT COMMENT '食材与用量'"),
    ('steps',               "ALTER TABLE food ADD COLUMN steps TEXT COMMENT '详细步骤'"),
    ('step_images',         "ALTER TABLE food ADD COLUMN step_images TEXT COMMENT '步骤图片URL'"),
    ('tips',                "ALTER TABLE food ADD COLUMN tips TEXT COMMENT '小贴士'"),
    ('methods',             "ALTER TABLE food ADD COLUMN methods VARCHAR(200) DEFAULT '' COMMENT '烹饪方法'"),
    ('kcal',               "ALTER TABLE food ADD COLUMN kcal INT DEFAULT 0 COMMENT '热量（千卡）'"),
]


def column_exists(cursor, db_name, table_name, column_name):
    """检查字段是否存在"""
    sql = (
        "SELECT COLUMN_NAME "
        "FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s"
    )
    cursor.execute(sql, (db_name, table_name, column_name))
    return cursor.fetchone() is not None


def main():
    print("=" * 60)
    print("执行数据库迁移")
    print("=" * 60)

    try:
        conn = pymysql.connect(**DB_CONFIG)
        print("[OK] 数据库连接成功")
    except Exception as e:
        print(f"[ERR] 数据库连接失败: {e}")
        sys.exit(1)

    cursor = conn.cursor()

    db_name = DB_CONFIG['database']
    table_name = 'food'

    print("\n[1/2] 添加新字段...")
    for i, (col_name, sql) in enumerate(COLUMN_DEFS, 1):
        if column_exists(cursor, db_name, table_name, col_name):
            print(f"  [SKIP] ({i}/{len(COLUMN_DEFS)}) 字段 '{col_name}' 已存在，跳过")
        else:
            try:
                cursor.execute(sql)
                print(f"  [OK] ({i}/{len(COLUMN_DEFS)}) 字段 '{col_name}' 添加成功")
            except Exception as e:
                print(f"  [ERR] ({i}/{len(COLUMN_DEFS)}) 添加字段 '{col_name}' 失败: {e}")

    conn.commit()
    print("\n[2/2] 验证表结构...")
    cursor.execute("DESC food")
    rows = cursor.fetchall()
    print(f"  [OK] food 表现在有 {len(rows)} 个字段")
    for row in rows:
        nullable = 'NULL' if row[2] == 'YES' else 'NOT NULL'
        print(f"    - {row[0]:25} {row[1]:20} {nullable}")

    cursor.close()
    conn.close()

    print("\n" + "=" * 60)
    print("[OK] 数据库迁移完成!")
    print("=" * 60)


if __name__ == '__main__':
    main()
