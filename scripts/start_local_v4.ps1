param(
 [string]$PythonExecutable='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
 [string]$DependencyDirectory,
 [string]$JavaExecutable='D:/Java/bin/java.exe'
)
$ErrorActionPreference='Stop'
$v4Project=Split-Path -Parent $PSScriptRoot
if (-not $DependencyDirectory) { $DependencyDirectory=Join-Path (Split-Path -Parent $v4Project) 'work/assistant-chain-venv/Lib/site-packages' }
if (-not (Test-Path -LiteralPath $DependencyDirectory -PathType Container)) { throw 'Provide the local Python dependency directory with -DependencyDirectory.' }
$env:PYTHONPATH=$DependencyDirectory
Push-Location -LiteralPath $v4Project
try {
 & $PythonExecutable (Join-Path $PSScriptRoot 'local_v4.py') serve --java $JavaExecutable
 if ($LASTEXITCODE -ne 0) { throw 'Local runtime failed; inspect .local-v4/backend.log and .local-v4/agent.log.' }
} finally { Pop-Location }
