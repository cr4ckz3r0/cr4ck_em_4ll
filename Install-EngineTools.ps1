#Requires -Version 5.1
<#
.SYNOPSIS
  Completes Python extras in the existing Pen Test Engine venv and installs
  Windows scanner CLIs needed for a default engage (nmap + nuclei, plus
  httpx / subfinder / ffuf for adaptive follow-ups).

.DESCRIPTION
  Uses Desktop\Pen Test Engine\pentest\.venv — does not replace it.
  Does NOT install Metasploit, Hydra, or sqlmap (Kali-only / offensive extras).
  Does NOT enable --zeroday or --hardcore.
  Authorized targets only. Run this on the Windows laptop, not from the cloud.

.PARAMETER InstallDir
  Engine clone (folder that contains pentest\). Default: Desktop\Pen Test Engine

.PARAMETER SkipPlaywright
  Skip pip playwright and Chromium download (optional; browser wrapper is
  disabled by default and not used in a default engage).
#>
param(
    [string]$InstallDir = "",
    [switch]$SkipPlaywright
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not $InstallDir) {
    $desktop = [Environment]::GetFolderPath("Desktop")
    if (-not $desktop) { $desktop = Join-Path $env:USERPROFILE "Desktop" }
    $InstallDir = Join-Path $desktop "Pen Test Engine"
}

$BinDir = Join-Path $env:LOCALAPPDATA "PenTestEngine\bin"
$PdtmHome = Join-Path $env:USERPROFILE ".pdtm\go\bin"
$GitHubHeaders = @{
    "User-Agent" = "PenTestEngine-WindowsInstaller"
    "Accept"     = "application/vnd.github+json"
}

Write-Host "==> Pen Test Engine — Windows Scanner-Tools" -ForegroundColor Cyan
Write-Host "    Engine: $InstallDir"
Write-Host "    Tools:  $BinDir"
Write-Host "    Nur eigene / schriftlich freigegebene Ziele. Kein --zeroday / --hardcore."

if (-not (Test-Path (Join-Path $InstallDir "pentest\cli.py"))) {
    throw "Pen Test Engine nicht gefunden unter '$InstallDir'. Zuerst Install-PenTestEngine.ps1 / install.ps1 ausfuehren."
}

function Get-VenvPython {
    $candidates = @(
        (Join-Path $InstallDir "pentest\.venv\Scripts\python.exe"),
        (Join-Path $InstallDir ".venv\Scripts\python.exe")
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    throw "venv-Python fehlt. Erwartet: pentest\.venv\Scripts\python.exe unter $InstallDir"
}

function Add-UserPath {
    param([Parameter(Mandatory = $true)][string]$Dir)
    if (-not $Dir) { return }
    if (-not (Test-Path $Dir)) { return }
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not $userPath) { $userPath = "" }
    $parts = @($userPath -split ";" | Where-Object { $_ -and $_.Trim() })
    if ($parts -notcontains $Dir) {
        $joined = (@($parts + $Dir) -join ";")
        [Environment]::SetEnvironmentVariable("Path", $joined, "User")
        Write-Host "    PATH (User) += $Dir"
    }
    if (($env:Path -split ";" | ForEach-Object { $_.TrimEnd("\") }) -notcontains $Dir.TrimEnd("\")) {
        $env:Path = "$Dir;$env:Path"
    }
}

function Test-OnPath {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-LatestZipAsset {
    param(
        [Parameter(Mandatory = $true)][string]$Repo
    )
    $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $GitHubHeaders
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "amd64" }
    $zips = @($rel.assets | Where-Object { $_.name -match '\.zip$' -and $_.name -match 'windows' })
    $hit = $zips | Where-Object { $_.name -match $arch } | Select-Object -First 1
    if (-not $hit) { $hit = $zips | Select-Object -First 1 }
    if (-not $hit) {
        throw "Kein Windows-ZIP in $Repo releases/latest"
    }
    return $hit
}

function Install-GitHubReleaseExe {
    param(
        [Parameter(Mandatory = $true)][string]$Repo,
        [Parameter(Mandatory = $true)][string]$ExeName,
        [Parameter(Mandatory = $true)][string]$DestDir
    )
    $destExe = Join-Path $DestDir $ExeName
    if (Test-Path $destExe) {
        Write-Host "    $ExeName bereits in $DestDir"
        return $destExe
    }
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
    $asset = Get-LatestZipAsset -Repo $Repo
    Write-Host "    Lade $($asset.name) von $Repo"
    $zip = Join-Path $env:TEMP ("pte-" + $ExeName + ".zip")
    $extract = Join-Path $env:TEMP ("pte-" + [IO.Path]::GetFileNameWithoutExtension($ExeName) + "-extract")
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -Headers $GitHubHeaders -UseBasicParsing
    if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    $found = Get-ChildItem -Path $extract -Recurse -Filter $ExeName -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $found) {
        $found = Get-ChildItem -Path $extract -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    if (-not $found) { throw "ZIP von $Repo enthaelt keine .exe" }
    Copy-Item -Path $found.FullName -Destination $destExe -Force
    Unblock-File -Path $destExe -ErrorAction SilentlyContinue
    return $destExe
}

function Install-WingetId {
    param([Parameter(Mandatory = $true)][string]$Id)
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) { return $false }
    Write-Host "    winget install $Id"
    & winget install --id $Id --exact --accept-package-agreements --accept-source-agreements
    return $LASTEXITCODE -eq 0
}

# --- Python extras (playwright is in pyproject, often missing from requirements.txt) ---
$venvPython = Get-VenvPython
Write-Host "==> venv: $venvPython" -ForegroundColor Cyan
Write-Host "==> Python-Pakete nachziehen"

& $venvPython -m pip install --upgrade pip
$req = Join-Path $InstallDir "requirements.txt"
if (Test-Path $req) {
    & $venvPython -m pip install -r $req
}
$pyproject = Join-Path $InstallDir "pyproject.toml"
if (Test-Path $pyproject) {
    Write-Host "==> pip install -e (zieht playwright aus pyproject.toml)"
    & $venvPython -m pip install -e $InstallDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARN: pip install -e fehlgeschlagen — playwright separat" -ForegroundColor Yellow
        & $venvPython -m pip install "playwright>=1.45.0"
    }
} else {
    Write-Host "==> playwright Python-Paket (steht in pyproject, oft nicht in requirements.txt)"
    & $venvPython -m pip install "playwright>=1.45.0"
}

if (-not $SkipPlaywright) {
    Write-Host "==> Playwright Chromium (optional, Browser-Wrapper ist standardmaessig deaktiviert)"
    try {
        & $venvPython -m playwright install chromium
        if ($LASTEXITCODE -ne 0) {
            Write-Host "WARN: playwright install chromium fehlgeschlagen — wird uebersprungen." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "WARN: Playwright Chromium uebersprungen: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "==> Playwright Chromium uebersprungen (-SkipPlaywright)"
}

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
Add-UserPath -Dir $BinDir
Add-UserPath -Dir $PdtmHome
foreach ($nmapDir in @(
        (Join-Path ${env:ProgramFiles(x86)} "Nmap"),
        (Join-Path $env:ProgramFiles "Nmap")
    )) {
    if (Test-Path $nmapDir) { Add-UserPath -Dir $nmapDir }
}

# --- nmap (needed for default engage recon) ---
Write-Host "==> nmap" -ForegroundColor Cyan
if (Test-OnPath "nmap") {
    Write-Host "    nmap bereits im PATH"
} else {
    $ok = $false
    try { $ok = Install-WingetId -Id "Insecure.Nmap" } catch { $ok = $false }
    foreach ($nmapDir in @(
            (Join-Path ${env:ProgramFiles(x86)} "Nmap"),
            (Join-Path $env:ProgramFiles "Nmap")
        )) {
        if (Test-Path $nmapDir) { Add-UserPath -Dir $nmapDir }
    }
    if (-not (Test-OnPath "nmap")) {
        Write-Host "WARN: nmap nicht im PATH. Manuell: https://nmap.org/download.html  (winget: Insecure.Nmap)" -ForegroundColor Yellow
        if (-not $ok) {
            Write-Host "      Npcap wird vom Nmap-Installer mitgeliefert; SYN-Scans brauchen oft Admin." -ForegroundColor Yellow
        }
    }
}

# --- ProjectDiscovery: nuclei (default engage), httpx + subfinder (adaptive) ---
Write-Host "==> ProjectDiscovery (nuclei, httpx, subfinder)" -ForegroundColor Cyan
$pdtmOk = $false
try {
    $pdtmExe = if (Test-OnPath "pdtm") {
        (Get-Command pdtm).Source
    } else {
        Install-GitHubReleaseExe -Repo "projectdiscovery/pdtm" -ExeName "pdtm.exe" -DestDir $BinDir
    }
    Write-Host "    pdtm -i nuclei,httpx,subfinder"
    & $pdtmExe -i "nuclei,httpx,subfinder" -bp $BinDir
    $pdtmOk = $LASTEXITCODE -eq 0
} catch {
    Write-Host "WARN: pdtm nicht nutzbar ($($_.Exception.Message)) — GitHub-Releases als Fallback." -ForegroundColor Yellow
}

if (-not $pdtmOk) {
    $pd = @{
        "nuclei.exe"    = "projectdiscovery/nuclei"
        "httpx.exe"     = "projectdiscovery/httpx"
        "subfinder.exe" = "projectdiscovery/subfinder"
    }
    foreach ($exe in $pd.Keys) {
        $name = [IO.Path]::GetFileNameWithoutExtension($exe)
        if (Test-OnPath $name) {
            Write-Host "    $name bereits im PATH"
            continue
        }
        try {
            Install-GitHubReleaseExe -Repo $pd[$exe] -ExeName $exe -DestDir $BinDir | Out-Null
        } catch {
            Write-Host "WARN: $exe nicht installiert: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

Add-UserPath -Dir $BinDir

$nucleiPath = $null
$nucleiCmd = Get-Command nuclei -ErrorAction SilentlyContinue
if ($nucleiCmd) {
    $nucleiPath = $nucleiCmd.Source
} elseif (Test-Path (Join-Path $BinDir "nuclei.exe")) {
    $nucleiPath = Join-Path $BinDir "nuclei.exe"
}
if ($nucleiPath) {
    Write-Host "==> nuclei -update-templates (kein Scan, nur Template-Download)"
    try {
        & $nucleiPath -update-templates
    } catch {
        Write-Host "WARN: nuclei-Templates nicht aktualisiert: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "WARN: nuclei.exe fehlt — Default-Engage kann ohne nuclei nur nmap planen." -ForegroundColor Yellow
}

# --- ffuf (adaptive content discovery; not in the default nmap+nuclei plan) ---
Write-Host "==> ffuf" -ForegroundColor Cyan
if (Test-OnPath "ffuf") {
    Write-Host "    ffuf bereits im PATH"
} else {
    $ffufOk = $false
    try { $ffufOk = Install-WingetId -Id "ffuf.ffuf" } catch { $ffufOk = $false }
    if (-not $ffufOk -and -not (Test-OnPath "ffuf")) {
        try {
            Install-GitHubReleaseExe -Repo "ffuf/ffuf" -ExeName "ffuf.exe" -DestDir $BinDir | Out-Null
        } catch {
            Write-Host "WARN: ffuf nicht installiert: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "Nicht installiert (absichtlich, Kali-only / Offensive Extras):" -ForegroundColor Yellow
Write-Host "  hydra, sqlmap, metasploit (msfconsole)"
Write-Host "  Default-Engage braucht sie nicht. Playwright-Browser ist optional und standardmaessig aus."
Write-Host ""

function Show-ToolRow {
    param([string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) {
        Write-Host ("  {0,-12} OK   {1}" -f $Name, $cmd.Source) -ForegroundColor Green
    } else {
        Write-Host ("  {0,-12} FEHLT" -f $Name) -ForegroundColor Yellow
    }
}

Write-Host "Status:" -ForegroundColor Cyan
Show-ToolRow "nmap"
Show-ToolRow "nuclei"
Show-ToolRow "httpx"
Show-ToolRow "subfinder"
Show-ToolRow "ffuf"
Show-ToolRow "hydra"
Show-ToolRow "sqlmap"
Show-ToolRow "msfconsole"

$py = $venvPython
Write-Host ""
Write-Host "Neues Terminal oeffnen (damit PATH greift), dann Default-Engage (venv-Python, PYTHONPATH=Installationsordner):" -ForegroundColor Green
Write-Host ""
Write-Host "  cd `"$InstallDir`""
Write-Host "  `$env:PYTHONPATH = `"$InstallDir`""
Write-Host "  `$py = `"$py`""
Write-Host "  & `$py -m pentest scope-add <DEINE-IP>"
Write-Host "  & `$py -m pentest engage `"Lab`" -t <DEINE-IP> --dry-run"
Write-Host "  & `$py -m pentest engage `"Lab`" -t <DEINE-IP>"
Write-Host ""
Write-Host "Oder: .\Start-LabRun.ps1          (scope-add + dry-run)"
Write-Host "      .\Start-LabRun.ps1 -Run    (danach echter Scan, Nachfrage JA)"
Write-Host ""
Write-Host "Kein --zeroday, kein --hardcore. Nur Ziele, die dir gehoeren."
Write-Host "install.sh --with-tools ist Kali/Debian-apt — auf diesem Windows-Laptop nicht nutzbar."
)
