#Requires -Version 5.1
<#
.SYNOPSIS
  Optional Postgres for Pen Test Engine. File-mode is enough for lab runs.

.DESCRIPTION
  Starts docker compose in Desktop\Pen Test Engine when Docker is installed.
  Does not install Docker. Does not scan targets.
  Windows PowerShell 5.1-safe: ASCII only.
#>
$ErrorActionPreference = 'Stop'

$desktop = [Environment]::GetFolderPath('Desktop')
if (-not $desktop) { $desktop = Join-Path $env:USERPROFILE 'Desktop' }
$InstallDir = Join-Path $desktop 'Pen Test Engine'
if (-not (Test-Path (Join-Path $InstallDir 'pentest\engine.py'))) {
    throw ('Pen Test Engine nicht gefunden unter ' + $InstallDir)
}

Write-Host '==> Optional Postgres' -ForegroundColor Cyan
Write-Host '    File-mode (JSON unter pentest\data\reports) reicht fuer Lab-Runs.'
Write-Host '    Postgres nur, wenn du Findings dauerhaft in einer DB halten willst.'
Write-Host ''

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    Write-Host 'Docker ist nicht installiert. File-mode bleibt aktiv — das ist OK.' -ForegroundColor Yellow
    Write-Host 'Kein Pflicht-Schritt. Lab: .\Start-LabRun.ps1'
    return
}

$compose = @(
    (Join-Path $InstallDir 'docker-compose.yml'),
    (Join-Path $InstallDir 'pentest\docker-compose.yml')
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $compose) {
    Write-Host 'Keine docker-compose.yml gefunden. File-mode bleibt aktiv.' -ForegroundColor Yellow
    return
}

Write-Host ('==> docker compose up -d  (' + $compose + ')')
Set-Location (Split-Path -Parent $compose)
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    docker-compose up -d
}
if ($LASTEXITCODE -ne 0) {
    Write-Host 'WARN: docker compose fehlgeschlagen. File-mode weiter nutzen.' -ForegroundColor Yellow
    return
}

$venvPython = Join-Path $InstallDir 'pentest\.venv\Scripts\python.exe'
if (Test-Path $venvPython) {
    $env:PYTHONPATH = $InstallDir
    Write-Host '==> python -m pentest init'
    & $venvPython -m pentest init
}

Write-Host ''
Write-Host 'Postgres versucht. Wenn init fehlschlaegt, File-mode reicht weiter.' -ForegroundColor Green
