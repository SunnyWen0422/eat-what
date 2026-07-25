$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root '.test-venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Test virtual environment not found: $python"
}

Push-Location $root
try {
    $reportDir = Join-Path $root 'outputs\test-report'
    New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

    Write-Host 'Running mini-program unit and contract tests with coverage...'
    & node --experimental-test-coverage --test --test-concurrency=1 tests/frontend/*.test.js 2>&1 |
        Tee-Object -FilePath (Join-Path $reportDir 'frontend-coverage.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed.' }

    Write-Host 'Running Java tests with JaCoCo...'
    & mvn -q -f backend\pom.xml -Plocal-functional-test test
    if ($LASTEXITCODE -ne 0) { throw 'Java tests failed.' }

    Write-Host 'Running Python tests with coverage...'
    & $python -m coverage run -m pytest recommend-service\tests tests\data -q
    if ($LASTEXITCODE -ne 0) { throw 'Python tests failed.' }
    & $python -m coverage report
    if ($LASTEXITCODE -ne 0) { throw 'Python coverage reporting failed.' }
    & $python -m coverage xml -o (Join-Path $reportDir 'python-coverage.xml')
    if ($LASTEXITCODE -ne 0) { throw 'Python coverage XML export failed.' }

    Write-Host 'Running 6,665-dish recommendation filter performance test...'
    & $python .\scripts\test_recommendation_performance.py `
        --input .\outputs\dish-replacement-20260718\food_import.csv `
        --output (Join-Path $reportDir 'recommendation-performance.json') `
        --max-p95-ms 800
    if ($LASTEXITCODE -ne 0) { throw 'Recommendation performance test failed.' }

    Write-Host 'Running isolated MySQL recommendation and data integration test...'
    & powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test_recommendation_preferences_mysql.ps1
    if ($LASTEXITCODE -ne 0) { throw 'Isolated MySQL test failed.' }
}
finally {
    Pop-Location
}

Write-Host 'All functional tests passed.'
