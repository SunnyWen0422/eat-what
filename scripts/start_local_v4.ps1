param(
 [string]$PythonExecutable='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
 [string]$DependencyDirectory,
 [string]$JavaExecutable,
 [string]$JarPath
)
$ErrorActionPreference='Stop'
$v4Project=Split-Path -Parent $PSScriptRoot
if (-not $DependencyDirectory) { $DependencyDirectory=Join-Path (Split-Path -Parent $v4Project) 'work/assistant-chain-venv/Lib/site-packages' }
if (-not (Test-Path -LiteralPath $DependencyDirectory -PathType Container)) { throw 'Provide the local Python dependency directory with -DependencyDirectory.' }
$env:PYTHONPATH=$DependencyDirectory
Push-Location -LiteralPath $v4Project
try {
 $runtimeArgs=@('serve')
 if ($JavaExecutable) { $runtimeArgs+=@('--java',$JavaExecutable) }
 if ($JarPath) { $runtimeArgs+=@('--jar',$JarPath) }
 & $PythonExecutable (Join-Path $PSScriptRoot 'local_v4.py') @runtimeArgs
 if ($LASTEXITCODE -ne 0) { throw 'Local runtime failed; inspect .local-v4/backend.log and .local-v4/agent.log.' }
} finally { Pop-Location }
