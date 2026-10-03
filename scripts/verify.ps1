$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = $env:CODEX_PYTHON
if (-not $python) {
    $python = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
}

Write-Host 'Checking JSON files...'
Get-ChildItem -LiteralPath $root -Recurse -File -Filter *.json -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\.git\\|\\target\\|\\.mysql-test-data\\|\\.test-venv\\|\\__pycache__\\|\\.pytest_cache\\' } |
    ForEach-Object {
        Get-Content -Raw -Encoding UTF8 -LiteralPath $_.FullName | ConvertFrom-Json | Out-Null
    }

Write-Host 'Checking for known embedded credentials...'
$forbidden = @(
    ('Sunny' + '418'),
    ('520200c71a943119' + 'ef85cf17fdb6a037'),
    ('-p' + '770609'),
    ('password:' + ' 770609')
)
$textExtensions = @('.bat', '.java', '.js', '.json', '.md', '.properties', '.py', '.sh', '.sql', '.txt', '.wxml', '.wxss', '.yml', '.yaml')
Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        $textExtensions -contains $_.Extension -and
        $_.FullName -notmatch '\\.git\\|\\target\\|\\.mysql-test-data\\|\\.test-venv\\|\\__pycache__\\|\\.pytest_cache\\'
    } |
    ForEach-Object {
        $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $_.FullName
        foreach ($value in $forbidden) {
            if ($content.Contains($value)) {
                throw "Embedded credential marker '$value' found in $($_.FullName)"
            }
        }
    }

Write-Host 'Checking JavaScript syntax...'
$node = (Get-Command node -ErrorAction Stop).Source
Get-ChildItem -LiteralPath $root -Recurse -File -Filter *.js -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\.git\\|\\target\\|\\.mysql-test-data\\|\\.test-venv\\|\\.pytest_cache\\|\\node_modules\\' } |
    ForEach-Object {
        & $node --check $_.FullName
        if ($LASTEXITCODE -ne 0) {
            throw "JavaScript syntax check failed: $($_.FullName)"
        }
    }

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Python executable not found. Set CODEX_PYTHON or install Python: $python"
}

Write-Host 'Checking Python syntax...'
$pythonFiles = Get-ChildItem -LiteralPath $root -Recurse -File -Filter *.py -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\.git\\|\\target\\|\\.mysql-test-data\\|\\.test-venv\\|\\__pycache__\\|\\.pytest_cache\\' } |
    Select-Object -ExpandProperty FullName
if ($pythonFiles.Count -gt 0) {
    & $python -m py_compile @pythonFiles
    if ($LASTEXITCODE -ne 0) {
        throw 'Python syntax check failed.'
    }
}

Write-Host 'Checking generated dish replacement assets when present...'
$replacementBundles = Get-ChildItem -LiteralPath (Join-Path $root 'outputs') -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'manifest.json') }
foreach ($bundle in $replacementBundles) {
    $manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $bundle.FullName 'manifest.json') | ConvertFrom-Json
    if ($manifest.issue_rows -ne 0) {
        throw "Dish replacement bundle contains blocking issues: $($bundle.FullName)"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $bundle.FullName 'replace_system_dishes.sql'))) {
        throw "Dish replacement SQL is missing: $($bundle.FullName)"
    }
}

Write-Host 'Checking database migration manifest...'
& (Join-Path $PSScriptRoot 'check_database_migrations.ps1') -Root $root

Write-Host 'Running frontend workflow regression tests...'
Push-Location -LiteralPath $root
try {
    $frontendTests = Get-ChildItem -LiteralPath (Join-Path $root 'tests') -Filter *.test.js -File | Select-Object -ExpandProperty FullName
    & $node --test @frontendTests
    if ($LASTEXITCODE -ne 0) { throw 'Frontend regression tests failed.' }
    & $python -m unittest discover -s tests -p 'test_*.py' -v
    if ($LASTEXITCODE -ne 0) { throw 'Assistant and template regression tests failed.' }
} finally { Pop-Location }

Write-Host 'Checking Java tests and package...'
& mvn -q -f (Join-Path $root 'backend\pom.xml') test package
if ($LASTEXITCODE -ne 0) {
    throw 'Java build check failed.'
}

Write-Host 'All verification checks passed.'
