param(
  [Parameter(Mandatory=$true)][string]$BackupFile,
  [Parameter(Mandatory=$true)][ValidatePattern('^sio_restore_[a-z0-9_]+$')][string]$TargetDatabase,
  [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin'
)
$ErrorActionPreference = 'Stop'
if (-not $env:PGUSER -or -not $env:PGPASSFILE) { throw 'Configure PGUSER, PGHOST, PGPORT e PGPASSFILE.' }
$sourcePath = (Resolve-Path -LiteralPath $BackupFile).Path
# createdb falha se o destino existir: não sobrescreve bancos existentes.
& (Join-Path $PgBin 'createdb.exe') -- $TargetDatabase
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar um banco novo. Nenhuma restauração executada.' }
& (Join-Path $PgBin 'pg_restore.exe') --exit-on-error --single-transaction --no-owner --dbname=$TargetDatabase -- $sourcePath
if ($LASTEXITCODE -ne 0) { throw 'Restauração falhou. Investigue o banco isolado; não substitua a produção.' }
Write-Output "Restaurado em $TargetDatabase. Valide contagens, permissões, sessões e histórico antes de qualquer troca."
