@echo off
echo 手动导出food数据库的各个表
echo.

REM 设置数据库连接信息
set DB_HOST=127.0.0.1
set DB_PORT=3306
set DB_USER=root
if "%DB_PASS%"=="" set DB_PASS=%DB_PASSWORD%
set DB_NAME=food

REM 设置时间戳
set TIMESTAMP=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%

echo 导出时间: %date% %time%
echo.

REM 1. 导出表结构
echo 📋 正在导出表结构...
mysqldump -h%DB_HOST% -P%DB_PORT% -u%DB_USER% -p%DB_PASS% %DB_NAME% --no-data --routines --triggers > food_schema_%TIMESTAMP%.sql

if %errorlevel% equ 0 (
    echo ✅ 表结构导出成功: food_schema_%TIMESTAMP%.sql
) else (
    echo ❌ 表结构导出失败
)

REM 2. 导出数据（不包含结构）
echo.
echo 📊 正在导出表数据...
mysqldump -h%DB_HOST% -P%DB_PORT% -u%DB_USER% -p%DB_PASS% %DB_NAME% --no-create-info --skip-triggers --single-transaction > food_data_%TIMESTAMP%.sql

if %errorlevel% equ 0 (
    echo ✅ 表数据导出成功: food_data_%TIMESTAMP%.sql
) else (
    echo ❌ 表数据导出失败
)

REM 3. 导出完整备份（结构+数据）
echo.
echo 🔄 正在导出完整备份...
mysqldump -h%DB_HOST% -P%DB_PORT% -u%DB_USER% -p%DB_PASS% --databases %DB_NAME% --routines --triggers --single-transaction > food_full_backup_%TIMESTAMP%.sql

if %errorlevel% equ 0 (
    echo ✅ 完整备份导出成功: food_full_backup_%TIMESTAMP%.sql
) else (
    echo ❌ 完整备份导出失败
)

echo.
echo ============================================
echo 📁 导出的文件：
echo.
dir /b food_*_%TIMESTAMP%.sql 2>nul
if errorlevel 1 (
    echo 没有找到导出的文件
)
echo.
echo 📊 数据库信息：
mysql -h%DB_HOST% -P%DB_PORT% -u%DB_USER% -p%DB_PASS% -e "USE %DB_NAME%; SHOW TABLES; SELECT COUNT(*) as food_count FROM food; SELECT COUNT(*) as recipe_records_count FROM recipe_records;" 2>nul

echo.
pause
