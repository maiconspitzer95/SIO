param(
  [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin',
  [string]$Destination = (Join-Path $PSScriptRoot '..\backups')
)
$ErrorActionPreference = 'Stop'
if (-not $env:PGDATABASE -or -not $env:PGUSER -or -not $env:PGPASSFILE) {
  throw 'Configure PGDATABASE, PGUSER, PGHOST, PGPORT e PGPASSFILE (arquivo com ACL restrita).'
}
$backupDirectory = [IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$backupPath = Join-Path $backupDirectory ('sio-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N') + '.dump')
& (Join-Path $PgBin 'pg_dump.exe') --format=custom --no-owner --file=$backupPath
if ($LASTEXITCODE -ne 0) { throw 'Backup falhou; não considere o arquivo válido.' }
& (Join-Path $PgBin 'pg_restore.exe') --list $backupPath | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível validar o catálogo do backup.' }
Get-FileHash -LiteralPath $backupPath -Algorithm SHA256 | Format-List
Write-Output "Backup criado: $backupPath. A validação completa exige restauração isolada."
