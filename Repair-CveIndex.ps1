#Requires -Version 5.1
<#
.SYNOPSIS
  Fixes GHSA parsing, fills CVE affected_version from NVD/GHSA ranges,
  and rebuilds the local CVE RAG index.
#>
$ErrorActionPreference = "Stop"

$InstallDir = Join-Path ([Environment]::GetFolderPath("Desktop")) "Pen Test Engine"
if (-not (Test-Path (Join-Path $InstallDir "pentest\cve_feed\poller.py"))) {
    throw "Pen Test Engine nicht gefunden unter $InstallDir"
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$patcher = Join-Path $here "patch_cve_poller.py"
if (-not (Test-Path $patcher)) {
    throw "patch_cve_poller.py fehlt neben diesem Skript."
}

$venvPython = Join-Path $InstallDir "pentest\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    $venvPython = "python"
}

Write-Host "==> Patche GHSA-Parser und NVD/GHSA-Versionsranges" -ForegroundColor Cyan
& $venvPython $patcher $InstallDir
if ($LASTEXITCODE -ne 0) { throw "Patch fehlgeschlagen." }

$env:PYTHONPATH = $InstallDir
Write-Host "==> Baue lokalen CVE-Index (NVD + CISA KEV + GHSA)" -ForegroundColor Cyan
& $venvPython -m pentest cve-update
if ($LASTEXITCODE -ne 0) { throw "cve-update fehlgeschlagen." }

Write-Host ""
Write-Host "Fertig. Pruefen mit (venv-Python, PYTHONPATH=Installationsordner):" -ForegroundColor Green
Write-Host "  `"$venvPython`" -m pentest cve-stats"
Write-Host "  `"$venvPython`" -m pentest intel-search `"remote code execution`""
Write-Host "  `"$venvPython`" -m pentest cve-search -p apache"
Write-Host ""
Write-Host "intel-search zeigt eine Version-Spalte, wo NVD/GHSA Ranges liefern."
Write-Host "CISA-KEV allein hat keine Version -- diese Zeilen koennen '-' bleiben."
