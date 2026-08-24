#Requires -Version 5.1
<#
.SYNOPSIS
  Authorized self-test: scope-add + engage --dry-run. Real engage only with -Run.

.DESCRIPTION
  Always uses pentest\.venv\Scripts\python.exe and sets PYTHONPATH to the
  engine install directory. Does NOT pass --zeroday or --hardcore.

  Default (no -Run):
    1. scope-add <Target>
    2. engage "Lab" -t <Target> --dry-run
    3. Print the -Run command and the equivalent venv-python lines.

  With -Run:
    After dry-run, ask for JA (unless -Force), then engage without dry-run.

  This script does not scan from the cloud. Run it on the Windows laptop.
  Target MUST be a host you own or have written authorization for.

  Windows PowerShell 5.1-safe: ASCII only, Write-Host in single quotes or
  parentheses, no quoted-backslash in double-quoted strings, example lines use
  '& $py ...' inside single-quoted strings.

.PARAMETER Target
  IP, hostname, or URL. Default: 185.6.70.234 (override if that is not yours).

.PARAMETER InstallDir
  Engine clone. Default: Desktop\Pen Test Engine

.PARAMETER Name
  Engagement name. Default: Lab

.PARAMETER Run
  After dry-run, run the real engage (still without --zeroday / --hardcore).

.PARAMETER Force
  Skip the JA confirmation when -Run is set.

.PARAMETER Full
  Also run nuclei (more HTTP probes, still rate-limited, still no DoS flags).
  Default without -Full is nmap only: port/service recon, no flood.
#>
param(
    [string]$Target = '185.6.70.234',
    [string]$InstallDir = '',
    [string]$Name = 'Lab',
    [switch]$Run,
    [switch]$Force,
    [switch]$Full
)

$ErrorActionPreference = 'Stop'

if (-not $InstallDir) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    if (-not $desktop) { $desktop = Join-Path $env:USERPROFILE 'Desktop' }
    $InstallDir = Join-Path $desktop 'Pen Test Engine'
}

$venvPython = Join-Path $InstallDir 'pentest\.venv\Scripts\python.exe'
$binDir = Join-Path $env:LOCALAPPDATA 'PenTestEngine\bin'
$pdtmHome = Join-Path $env:USERPROFILE '.pdtm\go\bin'

if (-not (Test-Path $venvPython)) {
    throw ('venv-Python fehlt: ' + $venvPython + '  (zuerst Install-PenTestEngine.ps1 / install.ps1, dann Install-EngineTools.ps1)')
}
if (-not (Test-Path (Join-Path $InstallDir 'pentest\cli.py'))) {
    throw ('Pen Test Engine nicht gefunden unter ' + $InstallDir)
}

foreach ($dir in @(
        $binDir,
        $pdtmHome,
        (Join-Path ${env:ProgramFiles(x86)} 'Nmap'),
        (Join-Path $env:ProgramFiles 'Nmap')
    )) {
    if ($dir -and (Test-Path $dir)) {
        $env:Path = $dir + ';' + $env:Path
    }
}

$env:PYTHONPATH = $InstallDir
Set-Location $InstallDir

if ($Full) {
    $toolList = 'nmap,nuclei'
} else {
    $toolList = 'nmap'
}

Write-Host '==> Pen Test Engine Lab-Run' -ForegroundColor Cyan
Write-Host ('    PYTHONPATH = ' + $InstallDir)
Write-Host ('    python     = ' + $venvPython)
Write-Host ('    Ziel       = ' + $Target)
Write-Host ('    Name       = ' + $Name)
Write-Host ('    Tools      = ' + $toolList + '  (kein hydra/sqlmap/msf, kein --zeroday/--hardcore)')
Write-Host '    Sicherheit = kein DoS/Flood; Engine blockt --dos --flood --stress --exploit'
Write-Host ''
Write-Host ('Nur starten, wenn ' + $Target + ' DIR gehoert oder du schriftliche Erlaubnis hast.') -ForegroundColor Yellow
Write-Host 'Unautorisiertes Scannen ist illegal. Das ist kein DDoS, sendet aber echte Pakete.'
Write-Host ''

Write-Host ('==> scope-add ' + $Target)
& $venvPython -m pentest scope-add $Target
if ($LASTEXITCODE -ne 0) { throw ('scope-add fehlgeschlagen (Exit ' + $LASTEXITCODE + ').') }

Write-Host '==> engage --dry-run (kein Netzwerk-Scan der Tools)'
& $venvPython -m pentest engage $Name -t $Target --tools $toolList --dry-run
if ($LASTEXITCODE -ne 0) { throw ('dry-run fehlgeschlagen (Exit ' + $LASTEXITCODE + ').') }

$engageLine = '& "' + $venvPython + '" -m pentest engage "' + $Name + '" -t ' + $Target + ' --tools ' + $toolList

if (-not $Run) {
    Write-Host ''
    Write-Host 'Dry-run fertig. Echten Scan NICHT gestartet.' -ForegroundColor Green
    Write-Host ('Wenn ' + $Target + ' dein System ist, gleichen Ordner, dann:')
    Write-Host ''
    Write-Host ('  .\Start-LabRun.ps1 -Target ' + $Target + ' -Run')
    Write-Host ''
    Write-Host 'Default ist nur nmap (Ports 1-1024). Kein Nuclei, kein Flood.'
    Write-Host 'Kein --zeroday, kein --hardcore.'
    return
}

if (-not $Force) {
    Write-Host ''
    Write-Host ('Naechster Schritt sendet ' + $toolList + ' an ' + $Target + '.') -ForegroundColor Yellow
    Write-Host 'Kein DDoS, aber echter Traffic. Tippe JA (gross), nur wenn das Ziel dir gehoert.'
    $ans = Read-Host 'Bestaetigung'
    if ($ans -ne 'JA') {
        Write-Host 'Abgebrochen. Kein echter Scan.'
        return
    }
}

Write-Host '==> engage (nmap-only default, kein --zeroday / --hardcore)'
& $venvPython -m pentest engage $Name -t $Target --tools $toolList
if ($LASTEXITCODE -ne 0) { throw ('engage fehlgeschlagen (Exit ' + $LASTEXITCODE + ').') }

Write-Host ''
Write-Host 'Engage beendet.' -ForegroundColor Green
Write-Host ('Status:  & "' + $venvPython + '" -m pentest status')
