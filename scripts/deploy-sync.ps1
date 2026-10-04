$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$wrangler = Join-Path $repoRoot 'dictionary-worker\node_modules\wrangler\bin\wrangler.js'
$config = Join-Path $repoRoot 'sync-worker\wrangler.toml'
if (-not (Test-Path -LiteralPath $wrangler)) { throw 'Install dictionary-worker dependencies first' }
$databaseName = 'skipreader-sync'
$raw = & node $wrangler d1 list --json --config $config
if ($LASTEXITCODE -ne 0) { throw 'Unable to read cloud database configuration; check official login' }
$databases = ($raw -join "`n") | ConvertFrom-Json
$database = $databases | Where-Object { $_.name -eq $databaseName } | Select-Object -First 1
if (-not $database) {
  & node $wrangler d1 create $databaseName --config $config
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create the free sync database' }
  $raw = & node $wrangler d1 list --json --config $config
  if ($LASTEXITCODE -ne 0) { throw 'Unable to locate the new database' }
  $database = (($raw -join "`n") | ConvertFrom-Json) | Where-Object { $_.name -eq $databaseName } | Select-Object -First 1
}
if (-not $database.uuid) { throw 'Database identifier is missing' }
$content = Get-Content -LiteralPath $config -Raw
$content = $content -replace '(?s)\n\[\[d1_databases\]\].*$', ''
$content += "`n[[d1_databases]]`nbinding = `"DB`"`ndatabase_name = `"$databaseName`"`ndatabase_id = `"$($database.uuid)`"`n"
[IO.File]::WriteAllText($config, $content, (New-Object Text.UTF8Encoding($false)))
& node $wrangler d1 execute $databaseName --remote --file (Join-Path $repoRoot 'sync-worker\schema.sql') --config $config
if ($LASTEXITCODE -ne 0) { throw 'Unable to apply the database schema' }
& node $wrangler deploy --config $config
if ($LASTEXITCODE -ne 0) { throw 'Unable to deploy sync service' }
