@echo off
chcp 65001

echo ===================================
echo  Food 数据库备份工具
echo ==================================

set TIMESTAMP=%DATE:~0,4%%DATE:~5,2%%DATE:~8,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%

set BACKUP_DIR=d:\吃什么\backup
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

set FILE=%BACKUP_DIR%\food_backup_%TIMESTAMP%.sql

echo.
echo 开始备份数据库...
echo 备份文件：%FILE%
echo.

if "%DB_USER%"=="" set DB_USER=food
if "%DB_NAME%"=="" set DB_NAME=food
if "%DB_PASSWORD%"=="" (
  echo DB_PASSWORD is required.
  exit /b 1
)
mysqldump -h127.0.0.1 -P3306 -u%DB_USER% -p%DB_PASSWORD% %DB_NAME% > "%FILE%" 2>&1

if %ERRORLEVEL% equ 0 (
  echo.
  echo ✅ 备份成功！
  echo 文件：%FILE%
) else (
  echo.
  echo ❌ 备份失败！
  echo 请检查：
  echo   1. MySQL 是否运行
  echo   2. 端口是否正确（3306）
  echo   3. 用户名密码是否正确
  echo.
  type "%FILE%" | findstr /C:"ERROR" /C:"Error"
)

echo.
pause
