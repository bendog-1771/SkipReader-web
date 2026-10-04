param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$readerRoot = $PSScriptRoot
$readerUrl = 'http://localhost:5174/'
if (-not (Test-Path -LiteralPath (Join-Path $readerRoot 'web-site/public/index.html'))) {
    Push-Location $readerRoot
    try { & node scripts/build-web.cjs; if ($LASTEXITCODE -ne 0) { throw 'Build failed.' } } finally { Pop-Location }
}
$readerReady = $false
try {
    $readerReply = Invoke-WebRequest -Uri $readerUrl -UseBasicParsing -TimeoutSec 2
    if ($readerReply.Content.Contains('<title>SkipReader')) { $readerReady = $true }
    else { throw 'Port 5174 belongs to another app.' }
} catch { if ($_.Exception.Message -like '*another app*') { throw } }
if (-not $readerReady) {
    $readerNode = (Get-Command node -ErrorAction Stop).Source
    $readerServer = Join-Path $readerRoot 'scripts/serve-web.cjs'
    $readerProcess = Start-Process -FilePath $readerNode -ArgumentList @(('"' + $readerServer + '"')) -WorkingDirectory $readerRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $readerRoot 'server.log') -RedirectStandardError (Join-Path $readerRoot 'server-error.log')
    $readerProcess.Id | Set-Content -LiteralPath (Join-Path $readerRoot '.server-pid')
    for ($readerAttempt = 0; $readerAttempt -lt 30; $readerAttempt++) {
        Start-Sleep -Milliseconds 200
        try { $readerReply = Invoke-WebRequest -Uri $readerUrl -UseBasicParsing -TimeoutSec 2; if ($readerReply.Content.Contains('<title>SkipReader')) { $readerReady = $true; break } } catch {}
    }
    if (-not $readerReady) { throw 'SkipReader did not start. See server-error.log.' }
}
if (-not $NoBrowser) { Start-Process $readerUrl }
