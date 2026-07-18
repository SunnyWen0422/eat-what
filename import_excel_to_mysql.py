#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Excel to MySQL Import Script
将 Excel 数据导入到 MySQL 的 food 表中
"""

import json
import os
import sys

import mysql.connector
import pandas as pd

# MySQL 数据库连接配置
DB_CONFIG = {
    'host': '127.0.0.1',
    'user': 'root',
    'password': os.environ.get('DB_PASSWORD', ''),
    'database': 'food',
    'charset': 'utf8mb4'
}

# Excel 文件路径
EXCEL_FILE = r'C:\Users\sunbo\Documents\caipu_calorie_v3_optimized.xlsx'

def connect_db():
    """连接到 MySQL 数据库"""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        print("✓ 数据库连接成功")
        return conn
    except Exception as e:
        print(f"✗ 数据库连接失败: {e}")
        sys.exit(1)

def read_excel(file_path):
    """读取 Excel 文件"""
    try:
        df = pd.read_excel(file_path)
        print(f"✓ 成功读取 Excel 文件: {file_path}")
        print(f"  数据行数: {len(df)}")
        print(f"  列名: {list(df.columns)}")
        return df
    except Exception as e:
        print(f"✗ 读取 Excel 文件失败: {e}")
        sys.exit(1)

def clean_data(df):
    """清洗数据"""
    print("\n  [清洗] 开始清洗数据...")
    
    # 处理 difficulty 字段（将数字转换为字符串）
    if 'difficulty' in df.columns:
        def convert_difficulty(val):
            if pd.isna(val):
                return ''
            if val == 0:
                return '简单'
            elif val == 1:
                return '普通'
            elif val == 2:
                return '困难'
            else:
                return str(val)
        df['difficulty'] = df['difficulty'].apply(convert_difficulty)
        print("  ✓ difficulty 字段已转换")
    
    # 处理 cook_time 字段（添加单位）
    if 'cook_time' in df.columns:
        def convert_cook_time(val):
            if pd.isna(val):
                return ''
            return f"{int(val)}分钟" if isinstance(val, (int, float)) else str(val)
        df['cook_time'] = df['cook_time'].apply(convert_cook_time)
        print("  ✓ cook_time 字段已转换")
    
    # 处理 ingredients_amounts 字段
    if 'ingredients_amounts' in df.columns:
        df['ingredients_amounts'] = df['ingredients_amounts'].fillna('')
        print("  ✓ ingredients_amounts 字段已清洗")
    
    # 处理 steps 字段
    if 'steps' in df.columns:
        df['steps'] = df['steps'].fillna('')
        print("  ✓ steps 字段已清洗")
    
    # 处理 step_images 字段（转换为 JSON 数组）
    if 'step_images' in df.columns:
        def convert_step_images(val):
            if pd.isna(val) or not val:
                return '[]'
            if isinstance(val, str):
                return json.dumps([val], ensure_ascii=False)
            return '[]'
        df['step_images'] = df['step_images'].apply(convert_step_images)
        print("  ✓ step_images 字段已转换")
    
    # 处理 tips 字段
    if 'tips' in df.columns:
        df['tips'] = df['tips'].fillna('')
        print("  ✓ tips 字段已清洗")
    
    # 处理 烹饪方式 字段（映射到 methods）
    if '烹饪方式' in df.columns:
        df['methods'] = df['烹饪方式'].fillna('')
        print("  ✓ 烹饪方式 字段已映射到 methods")
    elif 'methods' not in df.columns:
        df['methods'] = ''
        print("  ✓ methods 字段已初始化为空")
    
    # 处理 kcal 字段
    if 'kcal' in df.columns:
        df['kcal'] = df['kcal'].fillna(0).astype(int)
        print("  ✓ kcal 字段已清洗")
    
    # 替换所有 NaN 值为 None（MySQL 中的 NULL）
    df = df.where(pd.notnull(df), None)
    
    print("  ✓ 数据清洗完成\n")
    return df

def clear_table(conn):
    """清空 food 表"""
    try:
        cursor = conn.cursor()
        cursor.execute("TRUNCATE TABLE food")
        conn.commit()
        cursor.close()
        print("✓ 已清空 food 表")
    except Exception as e:
        print(f"✗ 清空表失败: {e}")
        conn.rollback()
        sys.exit(1)

def insert_data(conn, df):
    """插入数据到 food 表"""
    try:
        cursor = conn.cursor()
        
        # 构建 INSERT 语句
        columns = ['id', 'name', 'type', 'tags', 'image', 'difficulty', 'cook_time', 
                   'ingredients_amounts', 'steps', 'step_images', 'tips', 'methods', 'kcal']
        
        # 只使用 DataFrame 中存在的列
        available_columns = [col for col in columns if col in df.columns]
        
        placeholders = ', '.join(['%s'] * len(available_columns))
        columns_str = ', '.join(available_columns)
        
        sql = f"INSERT INTO food ({columns_str}) VALUES ({placeholders})"
        
        # 批量插入
        data = []
        for _, row in df.iterrows():
            row_data = []
            for col in available_columns:
                val = row[col]
                # 处理 NaN 值
                if pd.isna(val):
                    val = None
                row_data.append(val)
            data.append(tuple(row_data))
        
        cursor.executemany(sql, data)
        conn.commit()
        
        print(f"✓ 成功插入 {cursor.rowcount} 条数据")
        cursor.close()
    except Exception as e:
        print(f"✗ 插入数据失败: {e}")
        conn.rollback()
        sys.exit(1)

def main():
    """主函数"""
    print("=" * 60)
    print("Excel 到 MySQL 数据导入工具")
    print("=" * 60)
    
    # 1. 读取 Excel 文件
    print("\n[1/4] 读取 Excel 文件...")
    df = read_excel(EXCEL_FILE)
    
    # 2. 清洗数据
    print("\n[2/4] 清洗数据...")
    df = clean_data(df)
    
    # 3. 连接数据库
    print("\n[3/4] 连接数据库...")
    conn = connect_db()
    
    # 4. 清空并插入数据
    print("\n[4/4] 导入数据...")
    clear_table(conn)
    insert_data(conn, df)
    
    # 关闭连接
    conn.close()
    
    print("\n" + "=" * 60)
    print("✓ 数据导入完成!")
    print("=" * 60)

if __name__ == '__main__':
    main()
