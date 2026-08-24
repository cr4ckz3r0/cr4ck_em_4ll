#Requires -Version 5.1
<#
.SYNOPSIS
  Makes an existing Desktop\Pen Test Engine install ready to use.

.DESCRIPTION
  Applies overlays, copies lab scripts into the engine folder, writes .env
  (Docker off when docker.exe is missing), ensures scope.json, runs
  python -m pentest ready and a localhost dry-run. Does not send a live scan
  unless you later run Start-LabRun.ps1 -Run.

  If this script sits next to apply_engine_fixes.py, that copy is used.
  Otherwise it downloads this repo branch as a ZIP from GitHub.

  Windows PowerShell 5.1-safe: ASCII only, -UseBasicParsing, no em-dash.
#>
param(
    [string]$InstallDir = '',
    [switch]$SkipDryRun
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Branch = 'cursor/pentest-engine-desktop-install-6ac6'
$ZipUri = 'https://github.com/cr4ckz3r0/cr4ck_em_4ll/archive/refs/heads/' + $Branch + '.zip'
$GitHubHeaders = @{
    'User-Agent' = 'PenTestEngine-MakeReady'
    'Accept'     = 'application/vnd.github+json'
}

if (-not $InstallDir) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    if (-not $desktop) { $desktop = Join-Path $env:USERPROFILE 'Desktop' }
    $InstallDir = Join-Path $desktop 'Pen Test Engine'
}

if (-not (Test-Path (Join-Path $InstallDir 'pentest\engine.py'))) {
    throw ('Pen Test Engine nicht gefunden unter ' + $InstallDir + '  — zuerst Install-PenTestEngine.ps1 / install.ps1')
}

$venvPython = Join-Path $InstallDir 'pentest\.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
    $venvPython = Join-Path $InstallDir 'pentest\.venv\bin\python'
}
if (-not (Test-Path $venvPython)) {
    throw ('venv-Python fehlt: pentest\.venv  — zuerst install.ps1')
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$fixer = Join-Path $here 'apply_engine_fixes.py'
if (-not (Test-Path $fixer)) {
    Write-Host '==> Overlay nicht neben dem Skript — lade Branch-ZIP' -ForegroundColor Cyan
    $zip = Join-Path $env:TEMP 'pte-desktop-fixes.zip'
    $extract = Join-Path $env:TEMP 'pte-desktop-fixes'
    Invoke-WebRequest -UseBasicParsing -Uri $ZipUri -OutFile $zip -Headers $GitHubHeaders
    if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    $src = Get-ChildItem $extract -Directory | Select-Object -First 1
    if (-not $src) { throw 'ZIP enthaelt keinen Ordner' }
    $here = $src.FullName
    $fixer = Join-Path $here 'apply_engine_fixes.py'
    if (-not (Test-Path $fixer)) {
        throw ('apply_engine_fixes.py fehlt in ' + $here)
    }
}

Write-Host '==> Pen Test Engine einsatzbereit machen' -ForegroundColor Cyan
Write-Host ('    Engine = ' + $InstallDir)
Write-Host ('    Fixes  = ' + $here)
Write-Host ('    python = ' + $venvPython)

& $venvPython $fixer $InstallDir
if ($LASTEXITCODE -ne 0) { throw 'apply_engine_fixes.py fehlgeschlagen.' }

$env:PYTHONPATH = $InstallDir
Set-Location $InstallDir

Write-Host '==> python -m pentest ready'
& $venvPython -m pentest ready
if ($LASTEXITCODE -ne 0) { throw 'ready-Check fehlgeschlagen.' }

if (-not $SkipDryRun) {
    Write-Host '==> scope-add 127.0.0.1'
    & $venvPython -m pentest scope-add 127.0.0.1
    Write-Host '==> engage Lab --tools nmap --dry-run (kein Live-Scan)'
    & $venvPython -m pentest engage 'Lab' -t 127.0.0.1 --tools nmap --dry-run
    if ($LASTEXITCODE -ne 0) { throw 'dry-run fehlgeschlagen.' }
    Write-Host '==> status'
    & $venvPython -m pentest status
}

Write-Host ''
Write-Host 'EINSATZBEREIT' -ForegroundColor Green
Write-Host '  Dieser Laptop, nmap-only, kein zeroday/hardcore:'
Write-Host '    .\Start-LabRun.ps1'
Write-Host '    .\Start-LabRun.ps1 -Run'
Write-Host '  Anderes eigenes Ziel: .\Start-LabRun.ps1 -Target <IP> -Run'
Write-Host '  Scanner-CLIs (einmal): .\Install-EngineTools.ps1'
Write-Host 'Unautorisiertes Scannen ist illegal.'
