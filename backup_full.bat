@echo off
chcp 65001

echo 开始完整备份数据库...
set TIMESTAMP=%DATE:~0,4%%DATE:~5,2%%DATE:~8,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%

set BACKUP_DIR=d:\吃什么\backup
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

set FILE=%BACKUP_DIR%\food_full_backup_%TIMESTAMP%.sql

if "%DB_USER%"=="" set DB_USER=food
if "%DB_NAME%"=="" set DB_NAME=food
if "%DB_PASSWORD%"=="" (
  echo DB_PASSWORD is required.
  exit /b 1
)

echo 备份文件：%FILE%
echo 正在备份，请稍候...

"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" ^
  -h127.0.0.1 ^
  -P3306 ^
  -u%DB_USER% ^
  -p%DB_PASSWORD% ^
  %DB_NAME% > "%FILE%"

if %ERRORLEVEL% equ 0 (
  echo ✅ 备份成功！
  dir "%FILE%" | findstr /C:"%TIMESTAMP%"
) else (
  echo ❌ 备份失败！
  echo 请检查 MySQL 是否运行，用户名密码是否正确
)

echo.
pause
