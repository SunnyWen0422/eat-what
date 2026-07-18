$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = $env:CODEX_PYTHON
if (-not $python) {
    $python = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
}

Write-Host 'Checking JSON files...'
Get-ChildItem -LiteralPath $root -Recurse -File -Filter *.json |
    Where-Object { $_.FullName -notmatch '\\.git\\|\\target\\|\\__pycache__\\' } |
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
Get-ChildItem -LiteralPath $root -Recurse -File |
    Where-Object {
        $textExtensions -contains $_.Extension -and
        $_.FullName -notmatch '\\.git\\|\\target\\|\\__pycache__\\'
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
Get-ChildItem -LiteralPath $root -Recurse -File -Filter *.js |
    Where-Object { $_.FullName -notmatch '\\.git\\|\\target\\|\\node_modules\\' } |
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
$pythonFiles = Get-ChildItem -LiteralPath $root -Recurse -File -Filter *.py |
    Where-Object { $_.FullName -notmatch '\\.git\\|\\target\\|\\__pycache__\\' } |
    Select-Object -ExpandProperty FullName
if ($pythonFiles.Count -gt 0) {
    & $python -m py_compile @pythonFiles
    if ($LASTEXITCODE -ne 0) {
        throw 'Python syntax check failed.'
    }
}

Write-Host 'Running Maven tests...'
& mvn -q -f (Join-Path $root 'backend\pom.xml') test
if ($LASTEXITCODE -ne 0) {
    throw 'Maven tests failed.'
}

Write-Host 'All verification checks passed.'
