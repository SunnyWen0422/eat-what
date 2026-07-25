param(
    [Parameter(Mandatory = $true)]
    [string]$BundleDir,

    [Parameter(Mandatory = $true)]
    [string]$BackupDir,

    [string]$DbHost = $(if ($env:DB_HOST) { $env:DB_HOST } else { '127.0.0.1' }),
    [int]$DbPort = $(if ($env:DB_PORT) { [int]$env:DB_PORT } else { 3306 }),
    [string]$DbUser = $(if ($env:DB_USER) { $env:DB_USER } else { 'food' }),
    [string]$DbName = $(if ($env:DB_NAME) { $env:DB_NAME } else { 'food' })
)

$ErrorActionPreference = 'Stop'

if (-not $env:DB_PASSWORD) {
    throw 'DB_PASSWORD is required.'
}

$bundle = (Resolve-Path -LiteralPath $BundleDir).Path
$sqlFile = Join-Path $bundle 'replace_system_dishes.sql'
$manifestFile = Join-Path $bundle 'manifest.json'
$schemaFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'backend\ensure_food_import_schema.sql'
$recommendationSchemaFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'backend\recommendation_preferences_schema.sql'
$recommendationBackfillFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'backend\recommendation_metadata_backfill.sql'
if (-not (Test-Path -LiteralPath $sqlFile -PathType Leaf)) {
    throw "Replacement SQL not found: $sqlFile"
}
if (-not (Test-Path -LiteralPath $manifestFile -PathType Leaf)) {
    throw "Manifest not found: $manifestFile"
}
if (-not (Test-Path -LiteralPath $schemaFile -PathType Leaf)) {
    throw "Schema preparation SQL not found: $schemaFile"
}
foreach ($requiredFile in @($recommendationSchemaFile, $recommendationBackfillFile)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Recommendation SQL not found: $requiredFile"
    }
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestFile | ConvertFrom-Json
if ($manifest.issue_rows -ne 0) {
    throw "Bundle contains $($manifest.issue_rows) blocking data issues."
}

$mysql = (Get-Command mysql -ErrorAction Stop).Source
$mysqldump = (Get-Command mysqldump -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$backupRoot = (Resolve-Path -LiteralPath $BackupDir).Path
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupFile = Join-Path $backupRoot "food_before_dish_replace_$timestamp.sql"

Write-Host "Backing up database to $backupFile"
& $mysqldump `
    "--host=$DbHost" `
    "--port=$DbPort" `
    "--user=$DbUser" `
    "--password=$($env:DB_PASSWORD)" `
    --default-character-set=utf8mb4 `
    --single-transaction `
    --routines `
    --triggers `
    "--result-file=$backupFile" `
    $DbName
if ($LASTEXITCODE -ne 0) {
    throw 'Database backup failed. Replacement was not started.'
}

$before = & $mysql `
    "--host=$DbHost" `
    "--port=$DbPort" `
    "--user=$DbUser" `
    "--password=$($env:DB_PASSWORD)" `
    --batch `
    --skip-column-names `
    -e "SELECT COUNT(*) FROM $DbName.food WHERE user_id IS NULL; SELECT COUNT(*) FROM $DbName.food WHERE user_id IS NOT NULL;"
if ($LASTEXITCODE -ne 0) {
    throw 'Pre-import database check failed.'
}

Write-Host "Importing $($manifest.import_rows) system dishes"
function Invoke-MySqlFile([string]$Path) {
    $resolved = (Resolve-Path -LiteralPath $Path).Path.Replace('\', '/')
    & $mysql `
        "--host=$DbHost" `
        "--port=$DbPort" `
        "--user=$DbUser" `
        "--password=$($env:DB_PASSWORD)" `
        --default-character-set=utf8mb4 `
        $DbName `
        "--execute=source $resolved"
}

Invoke-MySqlFile $schemaFile
if ($LASTEXITCODE -ne 0) {
    throw 'Food table schema preparation failed. Replacement was not started.'
}

Invoke-MySqlFile $sqlFile
if ($LASTEXITCODE -ne 0) {
    throw "Dish replacement failed. Restore from $backupFile"
}

Invoke-MySqlFile $recommendationSchemaFile
if ($LASTEXITCODE -ne 0) {
    throw "Recommendation schema update failed. Restore from $backupFile"
}

Invoke-MySqlFile $recommendationBackfillFile
if ($LASTEXITCODE -ne 0) {
    throw "Recommendation metadata backfill failed. Restore from $backupFile"
}

$after = & $mysql `
    "--host=$DbHost" `
    "--port=$DbPort" `
    "--user=$DbUser" `
    "--password=$($env:DB_PASSWORD)" `
    --batch `
    --skip-column-names `
    -e "SELECT COUNT(*) FROM $DbName.food WHERE user_id IS NULL; SELECT COUNT(*) FROM $DbName.food WHERE user_id IS NOT NULL; SELECT type, COUNT(*) FROM $DbName.food WHERE user_id IS NULL GROUP BY type ORDER BY type;"
if ($LASTEXITCODE -ne 0) {
    throw 'Post-import database verification failed.'
}

$afterLines = @($after)
if ($afterLines.Count -lt 2 -or [int]$afterLines[0] -ne [int]$manifest.import_rows) {
    throw "Imported system dish count does not match manifest. Restore from $backupFile"
}
if (@($before).Count -ge 2 -and $afterLines[1] -ne @($before)[1]) {
    throw "Custom dish count changed unexpectedly. Restore from $backupFile"
}

Write-Host 'Dish replacement completed.'
Write-Host "Backup: $backupFile"
$afterLines | ForEach-Object { Write-Host $_ }
