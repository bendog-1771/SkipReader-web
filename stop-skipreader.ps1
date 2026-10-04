$ErrorActionPreference = 'Stop'
$readerPidFile = Join-Path $PSScriptRoot '.server-pid'
if (-not (Test-Path -LiteralPath $readerPidFile)) { Write-Output 'No launcher-owned server to stop.'; exit }
$readerPid = [int](Get-Content -LiteralPath $readerPidFile)
$readerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $readerPid"
$readerServer = Join-Path $PSScriptRoot 'scripts/serve-web.cjs'
if ($readerProcess -and $readerProcess.Name -eq 'node.exe' -and $readerProcess.CommandLine.Contains($readerServer)) {
    Stop-Process -Id $readerPid
    Remove-Item -LiteralPath $readerPidFile
} elseif (-not $readerProcess) { Remove-Item -LiteralPath $readerPidFile }
else { throw 'PID belongs to a different process; nothing was stopped.' }
