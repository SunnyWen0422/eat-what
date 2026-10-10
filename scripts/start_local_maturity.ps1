param([string]$PythonExecutable='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',[string]$DependencyDirectory,[string]$BackupZip,[string]$QualityBundle,[string]$JavaExecutable,[string]$JarPath)
$ErrorActionPreference='Stop'
$maturityProject=Split-Path -Parent $PSScriptRoot
if(-not $DependencyDirectory){$DependencyDirectory=Join-Path (Split-Path -Parent $maturityProject) 'work/assistant-chain-venv/Lib/site-packages'}
$env:PYTHONPATH=$DependencyDirectory
Push-Location -LiteralPath $maturityProject
try{
 $maturityData=Join-Path $maturityProject '.local-maturity-active'
 $runtimeArgs=@();if($JavaExecutable){$runtimeArgs+=@('--java',$JavaExecutable)};if($JarPath){$runtimeArgs+=@('--jar',$JarPath)}
 # Validate/pin a build before any interrupted-bootstrap process is stopped.
 & $PythonExecutable (Join-Path $PSScriptRoot 'local_maturity.py') check-jar @runtimeArgs
 if($LASTEXITCODE -ne 0){throw 'Local JAR preflight failed; existing services and data were retained.'}
 if(Test-Path -LiteralPath (Join-Path $maturityData 'runtime.json')) {& $PythonExecutable (Join-Path $PSScriptRoot 'local_maturity.py') serve @runtimeArgs}
 else {
  # Previous .local-maturity initialization is retained in place. No renaming,
  # deletion or permission changes are required to initialize this owned runtime.
  $maturityMysql=Join-Path $maturityData 'mysql'
  if(Test-Path -LiteralPath $maturityMysql){
   if(-not (Test-Path -LiteralPath (Join-Path $maturityData 'bootstrap.json'))){throw 'Uncheckpointed active initialization retained. Report this error before continuing.'}
   $dataMarker=$maturityMysql.Replace('\','/')
   $dataPattern='(?<!\S)"?--datadir="?'+[regex]::Escape($dataMarker)+'"?(?=\s|$)'
   foreach($ownedProcess in (Get-CimInstance Win32_Process -Filter "Name='mysqld.exe'")){
    if($ownedProcess.CommandLine -and $ownedProcess.CommandLine.Replace('\','/') -match $dataPattern){
     Stop-Process -Id $ownedProcess.ProcessId -ErrorAction Stop
     Wait-Process -Id $ownedProcess.ProcessId -Timeout 20 -ErrorAction SilentlyContinue
    }
   }
  }
  if((Test-Path -LiteralPath '.test-artifacts/maturity/start-input.json') -and (-not $BackupZip -or -not $QualityBundle)){
   $localInput=Get-Content -LiteralPath '.test-artifacts/maturity/start-input.json' -Raw -Encoding UTF8 | ConvertFrom-Json
   if(-not $BackupZip){$BackupZip=$localInput.backupZip};if(-not $QualityBundle){$QualityBundle=$localInput.qualityBundle}
  }
  if(-not $BackupZip -or -not $QualityBundle){throw 'First startup requires -BackupZip and -QualityBundle.'}
  & $PythonExecutable (Join-Path $PSScriptRoot 'local_maturity.py') start --backup-zip $BackupZip --quality-bundle $QualityBundle --keep-alive @runtimeArgs
 }
 if($LASTEXITCODE -ne 0){throw 'Local maturity runtime failed; inspect .local-maturity-active logs.'}
}finally{Pop-Location}
