#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Excel 到 MySQL 数据导入脚本 v2（使用 pymysql）"""

import json
import os
import sys

import pandas as pd
import pymysql

DB_CONFIG = {
    'host': '127.0.0.1',
    'user': 'root',
    'password': os.environ.get('DB_PASSWORD', ''),
    'database': 'food',
    'charset': 'utf8mb4'
}

EXCEL_FILE = r'C:\Users\sunbo\Documents\caipu_calorie_v3_optimized.xlsx'

def clean_data(df):
    print("  清洗数据...")

    # difficulty: 数字转字符串
    if 'difficulty' in df.columns:
        def cvt(d):
            if pd.isna(d):
                return ''
            if d == 0:
                return '简单'
            if d == 1:
                return '普通'
            if d == 2:
                return '困难'
            return str(d)
        df['difficulty'] = df['difficulty'].apply(cvt)

    # cook_time: 加单位
    if 'cook_time' in df.columns:
        def cvt2(v):
            if pd.isna(v):
                return ''
            try:
                return f"{int(v)}分钟"
            except Exception:
                return str(v)
        df['cook_time'] = df['cook_time'].apply(cvt2)

    # 食材
    if 'ingredients_amounts' in df.columns:
        df['ingredients_amounts'] = df['ingredients_amounts'].fillna('')

    # 步骤
    if 'steps' in df.columns:
        df['steps'] = df['steps'].fillna('')

    # 步骤图片 → JSON数组
    if 'step_images' in df.columns:
        def cvt3(v):
            if pd.isna(v) or not v:
                return '[]'
            return json.dumps([str(v)], ensure_ascii=False)
        df['step_images'] = df['step_images'].apply(cvt3)

    # 小贴士
    if 'tips' in df.columns:
        df['tips'] = df['tips'].fillna('')

    # 烹饪方式 → methods
    if '烹饪方式' in df.columns:
        df['methods'] = df['烹饪方式'].fillna('')
    elif 'methods' not in df.columns:
        df['methods'] = ''

    # kcal
    if 'kcal' in df.columns:
        df['kcal'] = df['kcal'].fillna(0).astype(int)

    return df


def main():
    print("=" * 60)
    print("Excel → MySQL 数据导入工具（pymysql版）")
    print("=" * 60)

    # 1. 读取 Excel
    print("\n[1/3] 读取 Excel...")
    try:
        df = pd.read_excel(EXCEL_FILE)
        print(f"  OK，共 {len(df)} 行，列：{list(df.columns)[:5]}...")
    except Exception as e:
        print(f"  ERR: {e}")
        sys.exit(1)

    # 2. 清洗
    print("\n[2/3] 清洗数据...")
    df = clean_data(df)

    # 3. 连接数据库并写入
    print("\n[3/3] 写入数据库...")
    try:
        conn = pymysql.connect(**DB_CONFIG)
    except Exception as e:
        print(f"  ERR 连接失败: {e}")
        sys.exit(1)

    cursor = conn.cursor()

    # 清空表
    try:
        cursor.execute("TRUNCATE TABLE food")
        print("  OK，已清空 food 表")
    except Exception as e:
        print(f"  WARN 清空失败（可能无数据）: {e}")

    # 插入数据
    columns = ['id','name','type','tags','image','difficulty','cook_time',
               'ingredients_amounts','steps','step_images','tips','methods','kcal']
    available = [c for c in columns if c in df.columns]
    placeholders = ','.join(['%s'] * len(available))
    col_str = ','.join(available)
    sql = f"INSERT INTO food ({col_str}) VALUES ({placeholders})"

    ok = 0
    for _, row in df.iterrows():
        vals = []
        for c in available:
            v = row[c]
            vals.append(None if pd.isna(v) else v)
        try:
            cursor.execute(sql, vals)
            ok += 1
        except Exception as e:
            print(f"  ERR 插入失败 row id={row.get('id','?')}: {e}")
            break

    conn.commit()
    print(f"  OK，成功插入 {ok} 条数据")

    cursor.close()
    conn.close()
    print("\n" + "=" * 60)
    print("完成!")
    print("=" * 60)


if __name__ == '__main__':
    main()
