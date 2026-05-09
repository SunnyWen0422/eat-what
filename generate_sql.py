#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将 Excel 数据生成为 SQL 导入文件"""

import pandas as pd
import json
import sys

EXCEL_FILE = r'C:\Users\sunbo\Documents\caipu_calorie_v3_optimized.xlsx'
SQL_FILE  = r'd:\吃什么\import_data.sql'

def esc(v):
    """转义 SQL 字符串"""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return 'NULL'
    s = str(v).replace("\\", "\\\\").replace("'", "''")
    return "'" + s + "'"

def main():
    print("读取 Excel...")
    df = pd.read_excel(EXCEL_FILE)
    print(f"  共 {len(df)} 行")

    # 清洗 difficulty
    def cvt_d(v):
        if pd.isna(v): return ''
        return {0: '简单', 1: '普通', 2: '困难'}.get(v, str(v))
    df['difficulty'] = df['difficulty'].apply(cvt_d)

    # 清洗 cook_time
    def cvt_t(v):
        if pd.isna(v): return ''
        try: return f"{int(v)}分钟"
        except: return str(v)
    df['cook_time'] = df['cook_time'].apply(cvt_t)

    # ingredients_amounts
    df['ingredients_amounts'] = df['ingredients_amounts'].fillna('')

    # steps
    df['steps'] = df['steps'].fillna('')

    # step_images → JSON数组
    def cvt_si(v):
        if pd.isna(v) or not v: return '[]'
        return json.dumps([str(v)], ensure_ascii=False)
    df['step_images'] = df['step_images'].apply(cvt_si)

    # tips
    df['tips'] = df['tips'].fillna('')

    # 烹饪方式 → methods
    if '烹饪方式' in df.columns:
        df['methods'] = df['烹饪方式'].fillna('')
    else:
        df['methods'] = df.get('methods', '').fillna('')

    # kcal
    df['kcal'] = df['kcal'].fillna(0).astype(int)

    print("生成 SQL...")
    lines = []
    lines.append("-- 菜品数据导入 SQL")
    lines.append("-- 自动生成，请勿手动修改")
    lines.append("")
    lines.append("USE food;")
    lines.append("")
    lines.append("-- 清空现有数据")
    lines.append("TRUNCATE TABLE food;")
    lines.append("")

    cols = ['id','name','type','tags','image','difficulty','cook_time',
             'ingredients_amounts','steps','step_images','tips','methods','kcal']

    ok = 0
    for _, row in df.iterrows():
        vals = []
        for c in cols:
            v = row.get(c)
            vals.append('NULL' if (v is None or (isinstance(v, float) and pd.isna(v))) else esc(v))

        sql = (f"INSERT INTO food (id,name,type,tags,image,difficulty,cook_time,"
               f"ingredients_amounts,steps,step_images,tips,methods,kcal) "
               f"VALUES ({','.join(vals)});")
        lines.append(sql)
        ok += 1

    with open(SQL_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"  完成！共生成 {ok} 条 INSERT 语句")
    print(f"  SQL 文件: {SQL_FILE}")
    print("")
    print("在服务器上执行：")
    print(f"  mysql -u root -p food < import_data.sql")

if __name__ == '__main__':
    main()
