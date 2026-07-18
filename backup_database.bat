@echo off
chcp 65001
echo 开始备份数据库...
set TIMESTAMP=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_DIR=d:\吃什么\backup
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
set FILE=%BACKUP_DIR%\food_backup_%TIMESTAMP%.sql
echo 备份文件：%FILE%
if "%DB_USER%"=="" set DB_USER=food
if "%DB_NAME%"=="" set DB_NAME=food
if "%DB_PASSWORD%"=="" (
  echo DB_PASSWORD is required.
  exit /b 1
)
mysqldump -h127.0.0.1 -P3306 -u%DB_USER% -p%DB_PASSWORD% %DB_NAME% > "%FILE%" 2>&1
if %errorlevel% equ 0 (
  echo ✅ 备份成功：%FILE%
  dir "%FILE%" | findstr /C:"%TIMESTAMP%"
) else (
  echo ❌ 备份失败！
  type "%FILE%" | findstr /C:"error" /C:"Error"
)
pause
