$ErrorActionPreference = 'Stop'

$script = Join-Path $PSScriptRoot 'test_dish_replacement_mysql.ps1'
& powershell -NoProfile -ExecutionPolicy Bypass -File $script
if ($LASTEXITCODE -ne 0) {
    throw 'Recommendation preference MySQL integration test failed.'
}

Write-Host 'Recommendation preference MySQL integration test passed.'
