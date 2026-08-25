#Requires -Version 5.1
<#
.SYNOPSIS
  Copies desktop runtime overlays (file-mode reports, --tools lock, preflight)
  and CVE parser patches onto Desktop\Pen Test Engine.

.DESCRIPTION
  Re-run after git pull of pentest-engine. Does not scan anything.
  Windows PowerShell 5.1-safe: ASCII only.
#>
$ErrorActionPreference = 'Stop'

$desktop = [Environment]::GetFolderPath('Desktop')
if (-not $desktop) { $desktop = Join-Path $env:USERPROFILE 'Desktop' }
$InstallDir = Join-Path $desktop 'Pen Test Engine'
if (-not (Test-Path (Join-Path $InstallDir 'pentest\engine.py'))) {
    throw ('Pen Test Engine nicht gefunden unter ' + $InstallDir)
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$fixer = Join-Path $here 'apply_engine_fixes.py'
if (-not (Test-Path $fixer)) {
    throw 'apply_engine_fixes.py fehlt neben diesem Skript.'
}

$venvPython = Join-Path $InstallDir 'pentest\.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
    $venvPython = 'python'
}

Write-Host '==> Wende Desktop-Fixes an (Reports, --tools, CVE)' -ForegroundColor Cyan
& $venvPython $fixer $InstallDir
if ($LASTEXITCODE -ne 0) { throw 'apply_engine_fixes.py fehlgeschlagen.' }

Write-Host ''
Write-Host 'Fertig. Danach im Engine-Ordner:' -ForegroundColor Green
Write-Host '  python -m pentest ready'
Write-Host '  .\Make-Ready.ps1'
Write-Host '  .\Start-LabRun.ps1'
Write-Host '  .\Start-LabRun.ps1 -Run'
