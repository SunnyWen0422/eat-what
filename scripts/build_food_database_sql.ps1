param(
    [string]$OutputFile = (Join-Path (Split-Path -Parent $PSScriptRoot) 'outputs\dish-replacement-20260718\eatwhat_food_database_mysql8.sql'),
    [ValidatePattern('^[A-Za-z][A-Za-z0-9_]*$')]
    [string]$DatabaseName = 'food'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$schemaFile = Join-Path $projectRoot 'create_table.sql'
$importFile = Join-Path $projectRoot 'outputs\dish-replacement-20260718\replace_system_dishes.sql'
$preferenceFile = Join-Path $projectRoot 'backend\recommendation_preferences_schema.sql'
$backfillFile = Join-Path $projectRoot 'backend\recommendation_metadata_backfill.sql'

foreach ($requiredFile in @($schemaFile, $importFile, $preferenceFile, $backfillFile)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required SQL file not found: $requiredFile"
    }
}

$quotedDatabase = [string]::Concat('`', $DatabaseName, '`')

function Convert-DatabaseName([string]$Content) {
    $Content.Replace('CREATE DATABASE IF NOT EXISTS food', "CREATE DATABASE IF NOT EXISTS $quotedDatabase").Replace('USE food;', "USE $quotedDatabase;")
}

$header = @"
-- EatWhat full MySQL 8.0 database initialization script.
-- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')
-- Dataset: 6,665 cleaned system dishes.
--
-- IMPORTANT:
-- 1. This script drops and recreates the food table. Back up an existing database first.
-- 2. To use another schema name, regenerate with -DatabaseName your_schema.
-- 3. Execute this file with MySQL 8.0 / Workbench using UTF-8.

SET NAMES utf8mb4;
SET time_zone = '+08:00';
SET SQL_SAFE_UPDATES = 0;

"@

$sections = @(
    $header,
    (Convert-DatabaseName (Get-Content -Raw -Encoding utf8 -LiteralPath $schemaFile)),
    (Convert-DatabaseName (Get-Content -Raw -Encoding utf8 -LiteralPath $importFile)),
    (Convert-DatabaseName (Get-Content -Raw -Encoding utf8 -LiteralPath $preferenceFile)),
    (Convert-DatabaseName (Get-Content -Raw -Encoding utf8 -LiteralPath $backfillFile)),
    @"

-- Final verification: expected system dish count is 6,665.
SELECT COUNT(*) AS system_dishes FROM $quotedDatabase.food WHERE user_id IS NULL;
SELECT COUNT(*) AS custom_dishes FROM $quotedDatabase.food WHERE user_id IS NOT NULL;
SELECT cuisine_code, COUNT(*) AS dish_count
FROM $quotedDatabase.food
WHERE user_id IS NULL
GROUP BY cuisine_code
ORDER BY cuisine_code;
SELECT
    SUM(tag_codes LIKE '%HOME_STYLE%') AS home_style_dishes,
    SUM(cuisine_code = 'SICHUAN') AS sichuan_dishes,
    SUM(cuisine_code = 'CANTONESE') AS cantonese_dishes
FROM $quotedDatabase.food
WHERE user_id IS NULL;
"@
)

$resolvedOutput = [IO.Path]::GetFullPath($OutputFile)
$outputDirectory = Split-Path -Parent $resolvedOutput
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
[IO.File]::WriteAllText($resolvedOutput, ($sections -join "`r`n`r`n"), [Text.UTF8Encoding]::new($false))

$rowCount = (Select-String -LiteralPath $importFile -Pattern '^\([0-9]+' -Encoding utf8).Count
Write-Host "Generated $resolvedOutput"
Write-Host "Import row tuples detected: $rowCount"
