$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$mysqlHome = 'C:\Program Files\MySQL\MySQL Server 8.0\bin'
$mysqld = Join-Path $mysqlHome 'mysqld.exe'
$mysql = Join-Path $mysqlHome 'mysql.exe'
$mysqladmin = Join-Path $mysqlHome 'mysqladmin.exe'
$port = 3307
$dataDir = Join-Path $env:TEMP "eatwhat-mysql-test-$PID"
$portableSql = Join-Path $root 'outputs\dish-replacement-20260718\eatwhat_food_database_mysql8.sql'
$customDatabaseName = 'eatwhat_portable_test'
$customDatabaseSql = Join-Path $env:TEMP "eatwhat-portable-database-$PID.sql"

& (Join-Path $root 'scripts\build_food_database_sql.ps1') -OutputFile $portableSql
if (-not (Test-Path -LiteralPath $portableSql -PathType Leaf)) {
    throw 'Portable database SQL generation failed.'
}
& (Join-Path $root 'scripts\build_food_database_sql.ps1') -OutputFile $customDatabaseSql -DatabaseName $customDatabaseName
if (-not (Test-Path -LiteralPath $customDatabaseSql -PathType Leaf)) {
    throw 'Custom database SQL generation failed.'
}

foreach ($binary in @($mysqld, $mysql, $mysqladmin)) {
    if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) {
        throw "MySQL binary not found: $binary"
    }
}
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $port is already in use."
}

& $mysqld --no-defaults --initialize-insecure "--basedir=C:\Program Files\MySQL\MySQL Server 8.0" "--datadir=$dataDir"
if ($LASTEXITCODE -ne 0) {
    throw 'Isolated MySQL initialization failed.'
}

$arguments = "--no-defaults --basedir=`"C:\Program Files\MySQL\MySQL Server 8.0`" --datadir=$dataDir --port=$port --bind-address=127.0.0.1 --mysqlx=0 --pid-file=$dataDir\mysqld.pid --log-error=$dataDir\mysqld.log"
$null = Start-Process -FilePath $mysqld -ArgumentList $arguments -WindowStyle Hidden -PassThru

$ready = $false
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    & $mysqladmin '--connect-timeout=1' '--host=127.0.0.1' "--port=$port" '--user=root' ping 2>$null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Milliseconds 500
}
$ErrorActionPreference = $previousErrorActionPreference
if (-not $ready) {
    Get-Content -Tail 100 -LiteralPath (Join-Path $dataDir 'mysqld.log')
    throw 'Isolated MySQL did not accept connections.'
}

$base = @('--connect-timeout=5', '--host=127.0.0.1', "--port=$port", '--user=root', '--default-character-set=utf8mb4')

function Invoke-MySqlFile([string]$Path, [string]$ErrorMessage) {
    $resolved = (Resolve-Path -LiteralPath $Path).Path.Replace('\', '/')
    & $mysql @base "--execute=source $resolved"
    if ($LASTEXITCODE -ne 0) { throw $ErrorMessage }
}

try {
    Invoke-MySqlFile (Join-Path $root 'create_table.sql') 'Schema creation failed.'

    & $mysql @base -e "USE food; INSERT INTO food (name, type, user_id, is_custom) VALUES ('custom-test-dish', 'veg', 9001, 1);"
    if ($LASTEXITCODE -ne 0) { throw 'Custom dish setup failed.' }

    Invoke-MySqlFile (Join-Path $root 'backend\ensure_food_import_schema.sql') 'Schema compatibility SQL failed.'

    Invoke-MySqlFile (Join-Path $root 'outputs\dish-replacement-20260718\replace_system_dishes.sql') 'Dish replacement SQL failed.'

    Invoke-MySqlFile (Join-Path $root 'backend\recommendation_preferences_schema.sql') 'Recommendation schema SQL failed.'

    Invoke-MySqlFile (Join-Path $root 'backend\recommendation_metadata_backfill.sql') 'Recommendation metadata backfill failed.'

    & $mysql @base -e "USE food; INSERT INTO user_preference (user_id, preferred_cuisines, preferred_tags, excluded_tags, excluded_ingredients, avoid_recent_days, version) VALUES (9001, JSON_ARRAY('SICHUAN'), JSON_ARRAY('HOME_STYLE'), JSON_ARRAY('FRY'), JSON_ARRAY('花生'), 14, 1) ON DUPLICATE KEY UPDATE preferred_cuisines=VALUES(preferred_cuisines);"
    if ($LASTEXITCODE -ne 0) { throw 'Preference roundtrip setup failed.' }

    $result = & $mysql @base --batch --skip-column-names -e "USE food; SELECT COUNT(*) FROM food WHERE user_id IS NULL; SELECT COUNT(*) FROM food WHERE user_id IS NOT NULL; SELECT type, COUNT(*) FROM food WHERE user_id IS NULL GROUP BY type ORDER BY type; SELECT COUNT(*) FROM food WHERE user_id = 9001 AND name = 'custom-test-dish' AND is_custom = 1; SELECT COUNT(*) FROM food WHERE name = 'custom-test-dish' AND (user_id IS NULL OR user_id = 9002); SELECT COUNT(*) FROM food WHERE user_id IS NULL AND cuisine_code = 'SICHUAN' AND FIND_IN_SET('HOME_STYLE', tag_codes) > 0 AND cook_minutes <= 30; SELECT COUNT(*) FROM food WHERE user_id IS NULL AND FIND_IN_SET('HOME_STYLE', tag_codes) > 0; SELECT COUNT(*) FROM food WHERE user_id IS NULL AND cuisine_code = 'SICHUAN'; SELECT COUNT(*) FROM food WHERE user_id IS NULL AND cuisine_code = 'CANTONESE'; SELECT COUNT(*) FROM user_preference WHERE user_id = 9001 AND JSON_CONTAINS(preferred_cuisines, JSON_QUOTE('SICHUAN')) AND avoid_recent_days = 14;"
    if ($LASTEXITCODE -ne 0) { throw 'Post-import verification query failed.' }

    $lines = @($result)
    if ($lines.Count -ne 14 -or [int]$lines[0] -ne 6665 -or [int]$lines[1] -ne 1 -or [int]$lines[7] -ne 1 -or [int]$lines[8] -ne 0 -or [int]$lines[9] -le 0 -or [int]$lines[10] -ne 6035 -or [int]$lines[11] -ne 162 -or [int]$lines[12] -ne 65 -or [int]$lines[13] -ne 1) {
        throw "Unexpected import result: $($lines -join ', ')"
    }

    Invoke-MySqlFile $portableSql 'Portable full database SQL failed.'
    $portableResult = & $mysql @base --batch --skip-column-names -e "USE food; SELECT COUNT(*) FROM food WHERE user_id IS NULL; SELECT COUNT(*) FROM food WHERE user_id IS NOT NULL; SELECT COUNT(*) FROM food WHERE FIND_IN_SET('HOME_STYLE', tag_codes) > 0; SELECT COUNT(*) FROM food WHERE cuisine_code = 'SICHUAN'; SELECT COUNT(*) FROM food WHERE cuisine_code = 'CANTONESE'; SELECT COUNT(*) FROM user_preference WHERE user_id = 9001;"
    if ($LASTEXITCODE -ne 0) { throw 'Portable SQL verification query failed.' }

    $portableLines = @($portableResult)
    if ($portableLines.Count -ne 6 -or [int]$portableLines[0] -ne 6665 -or [int]$portableLines[1] -ne 0 -or [int]$portableLines[2] -ne 6035 -or [int]$portableLines[3] -ne 162 -or [int]$portableLines[4] -ne 65 -or [int]$portableLines[5] -ne 1) {
        throw "Unexpected portable SQL result: $($portableLines -join ', ')"
    }

    Write-Host "Isolated MySQL replacement test passed. Data directory: $dataDir"
    $lines | ForEach-Object { Write-Host $_ }
    Write-Host 'Portable full database SQL test passed.'
    $portableLines | ForEach-Object { Write-Host $_ }

    Invoke-MySqlFile $customDatabaseSql 'Custom database name SQL failed.'
    $customDatabaseResult = & $mysql @base --batch --skip-column-names -e "USE $customDatabaseName; SELECT COUNT(*) FROM food WHERE user_id IS NULL; SELECT COUNT(*) FROM food WHERE FIND_IN_SET('HOME_STYLE', tag_codes) > 0; SELECT COUNT(*) FROM food WHERE cuisine_code = 'SICHUAN'; SELECT COUNT(*) FROM food WHERE cuisine_code = 'CANTONESE';"
    if ($LASTEXITCODE -ne 0) { throw 'Custom database verification query failed.' }

    $customDatabaseLines = @($customDatabaseResult)
    if ($customDatabaseLines.Count -ne 4 -or [int]$customDatabaseLines[0] -ne 6665 -or [int]$customDatabaseLines[1] -ne 6035 -or [int]$customDatabaseLines[2] -ne 162 -or [int]$customDatabaseLines[3] -ne 65) {
        throw "Unexpected custom database SQL result: $($customDatabaseLines -join ', ')"
    }
    Write-Host 'Custom database name SQL test passed.'
    $customDatabaseLines | ForEach-Object { Write-Host $_ }
}
finally {
    & $mysqladmin '--connect-timeout=3' '--host=127.0.0.1' "--port=$port" '--user=root' shutdown 2>$null
    if (Test-Path -LiteralPath $customDatabaseSql -PathType Leaf) {
        Remove-Item -LiteralPath $customDatabaseSql -Force
    }
}
