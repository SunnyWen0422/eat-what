@echo off
echo 正在导出food数据库...
echo.

REM 设置数据库连接信息
set DB_HOST=127.0.0.1
set DB_PORT=3306
set DB_NAME=food
set DB_USER=root
set DB_PASS=Sunny418

REM 设置输出文件
set OUTPUT_FILE=food_database_backup_%date:~0,4%%date:~5,2%%date:~8,2%.sql

echo 导出数据库结构和数据到: %OUTPUT_FILE%
echo.

REM 执行mysqldump导出
mysqldump -h%DB_HOST% -P%DB_PORT% -u%DB_USER% -p%DB_PASS% --databases %DB_NAME% --routines --triggers --single-transaction > %OUTPUT_FILE%

if %errorlevel% equ 0 (
    echo.
    echo ✅ 数据库导出成功！
    echo 📁 文件位置: %CD%\%OUTPUT_FILE%
    echo 📊 文件大小:
    for %%A in (%OUTPUT_FILE%) do echo    %%~zA 字节
) else (
    echo.
    echo ❌ 数据库导出失败！
    echo 请检查：
    echo 1. MySQL服务是否运行
    echo 2. 数据库连接信息是否正确
    echo 3. 用户权限是否足够
)

echo.
pause
