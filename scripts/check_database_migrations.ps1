[CmdletBinding()]
param(
    [string]$Root = "",
    [string]$ManifestPath = ""
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = Split-Path -Parent $PSScriptRoot
}
if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    $ManifestPath = Join-Path $Root "backend\db\migration-manifest.json"
}
$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$migrationRoot = Join-Path (Split-Path -Parent $ManifestPath) "migrations"
$errors = [System.Collections.Generic.List[string]]::new()

foreach ($migration in $manifest.migrations) {
    $path = Join-Path $migrationRoot $migration.file
    if (-not (Test-Path -LiteralPath $path)) {
        $errors.Add("missing migration: $($migration.file)")
        continue
    }
    $content = Get-Content -Raw -LiteralPath $path
    if ($content -match '(?im)^\s*USE\s+food\s*;') {
        $errors.Add("fixed database selection is forbidden: $($migration.file)")
    }
    if ($content -match '(?im)^\s*(DROP\s+TABLE|TRUNCATE\s+TABLE)\b') {
        $errors.Add("destructive statement is forbidden: $($migration.file)")
    }
    # Git may materialize CRLF on Windows. Compare canonical repository text.
    $contentBytes = [System.Text.Encoding]::UTF8.GetBytes(([System.IO.File]::ReadAllText($path)).Replace("`r`n", "`n"))
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $hash = [System.BitConverter]::ToString($sha.ComputeHash($contentBytes)).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
    if ($migration.checksumSha256 -eq "CHECKSUM_REPLACED_BY_MANIFEST" -or $hash -ne $migration.checksumSha256.ToLowerInvariant()) {
        $errors.Add("checksum drift or placeholder: $($migration.file)")
    }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}
Write-Output "Migration manifest valid: $($manifest.migrations.Count) migration(s), database=$($manifest.database)"
