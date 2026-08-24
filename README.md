# Pen Test Engine — lokale Desktop-Installation

Installiert das autorisierte, **nicht-destruktive** Pentest-Engine-Projekt
[leonardowo2002-bot/pentest-engine](https://github.com/leonardowo2002-bot/pentest-engine)
in den Ordner **Desktop / Pen Test Engine**.

> Nur auf Systemen verwenden, die du besitzt oder für die du eine **schriftliche
> Genehmigung** hast. Unautorisiertes Scannen ist illegal.

## Einsatzbereit (Engine liegt schon auf dem Desktop)

PowerShell, **ein Block** — Overlay, Lab-Skripte, `ready`-Check, Dry-Run auf `127.0.0.1`:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
$dest = "$env:USERPROFILE\Desktop\pte-fixes"
if (-not (Test-Path $dest)) {
  git clone --depth 1 -b cursor/pentest-engine-desktop-install-6ac6 https://github.com/cr4ckz3r0/cr4ck_em_4ll.git $dest
} else {
  git -C $dest pull --ff-only
}
cd $dest
.\Make-Ready.ps1
```

Ohne Git (laedt das Branch-ZIP selbst):

```powershell
Set-ExecutionPolicy -Scope Process Bypass
$tmp = Join-Path $env:TEMP "Make-Ready.ps1"
Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/cr4ckz3r0/cr4ck_em_4ll/cursor/pentest-engine-desktop-install-6ac6/Make-Ready.ps1" -OutFile $tmp
& $tmp
```

Danach im Ordner `Desktop\Pen Test Engine`:

```powershell
.\Start-LabRun.ps1
.\Start-LabRun.ps1 -Run
```

`-Run` fragt `JA` und scannt nur `127.0.0.1` (nmap). Anderes eigenes Ziel: `-Target`.

## Windows

Voraussetzungen: **Python 3.11+** (Haken bei „Add python.exe to PATH“) und
idealerweise **Git**.

`.\Install-PenTestEngine.ps1` funktioniert nur **in dem Ordner, in dem die Datei liegt**.
Im Home-Verzeichnis (`C:\Users\...`) ist das Skript nicht vorhanden.

### Variante A — aus jedem Ordner (empfohlen)

In PowerShell einfach diese drei Zeilen einfügen:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
git clone https://github.com/leonardowo2002-bot/pentest-engine.git "$env:USERPROFILE\Desktop\Pen Test Engine"
cd "$env:USERPROFILE\Desktop\Pen Test Engine"; .\install.ps1
```

Ohne Git:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
$dest = "$env:USERPROFILE\Desktop\Pen Test Engine"
$zip = "$env:TEMP\pentest-engine.zip"
Invoke-WebRequest "https://github.com/leonardowo2002-bot/pentest-engine/archive/refs/heads/main.zip" -OutFile $zip
Expand-Archive $zip "$env:TEMP\pte" -Force
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item "$env:TEMP\pte\pentest-engine-main\*" $dest -Recurse -Force
cd $dest; .\install.ps1
```

### Variante B — wenn du dieses Repo schon geklont hast

In den Ordner wechseln, der `Install-PenTestEngine.ps1` enthält, dann:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Install-PenTestEngine.ps1
```

Das Skript legt an:

| Pfad | Inhalt |
|------|--------|
| `%USERPROFILE%\Desktop\Pen Test Engine` | Geklontes Engine-Repo + Python-venv |
| `%USERPROFILE%\Desktop\Pen Test Engine.cmd` | Starter |

Danach den Desktop-Starter öffnen und nur **eigene Lab-Ziele** setzen:

```text
python -m pentest --help
python -m pentest scope-add 127.0.0.1
python -m pentest engage "Lab" -t 127.0.0.1 --dry-run
```

## Linux / macOS

```bash
chmod +x install-desktop.sh
./install-desktop.sh
```

Zielordner: `~/Desktop/Pen Test Engine`  
Starter: `~/Desktop/Pen Test Engine/start-pen-test-engine.sh`

## Was die Installation macht

1. Klont (oder aktualisiert) pentest-engine nach Desktop/Pen Test Engine
2. Erstellt `pentest/.venv`
3. Installiert die Python-Abhängigkeiten
4. Kopiert `.env` und `scope.json` aus den Vorlagen
5. Lädt das lokale MiniLM-RAG-Modell und indexiert aktuelle CVEs

`Install-PenTestEngine.ps1` / `install.ps1` installieren **keine** Scanner-CLIs.
Nmap + nuclei (+ httpx/subfinder/ffuf) kommen über `Install-EngineTools.ps1`.
Hydra, sqlmap und Metasploit bleiben auf Windows absichtlich weg.

Nach dem Klon wendet der Installer `apply_engine_fixes.py` an (File-Mode-Reports,
`--tools` wirklich ehren, CVE-Parser). Nach einem `git pull` der Engine erneut:

```powershell
cd "$env:USERPROFILE\Desktop\Pen Test Engine"
# Skripte liegen in diesem Repo (cr4ck_em_4ll), nicht in pentest-engine:
# aus dem Ordner mit Apply-EngineFixes.ps1:
.\Apply-EngineFixes.ps1
```

PostgreSQL ist **optional**. Ohne Datenbank läuft die Engine im Datei-Modus:
`status` liest `pentest\data\reports\report_*.json` und das Audit-Log.
Optional Postgres (nur wenn Docker da ist):

```powershell
.\Start-OptionalPostgres.ps1
```

Wenn der CVE-Index beim ersten Lauf fehlschlägt (GHSA-Parser) **oder** die
Spalte Version fast leer ist (NVD speichert oft `version=*`, die echte Range
steht in `versionStartIncluding` / `versionEndExcluding`), im installierten
Ordner ausführen:

```powershell
cd "$env:USERPROFILE\Desktop\Pen Test Engine"
Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/cr4ckz3r0/cr4ck_em_4ll/cursor/pentest-engine-desktop-install-6ac6/patch_cve_poller.py" -OutFile patch_cve_poller.py
.\pentest\.venv\Scripts\python.exe patch_cve_poller.py .
$env:PYTHONPATH = (Get-Location).Path
.\pentest\.venv\Scripts\python.exe -m pentest cve-update
.\pentest\.venv\Scripts\python.exe -m pentest cve-stats
```

Das dauert ein paar Minuten (NVD + MiniLM). Danach immer den **venv-Python** nutzen
(nicht das `python` aus dem Windows-PATH):

```powershell
$env:PYTHONPATH = (Get-Location).Path
.\pentest\.venv\Scripts\python.exe -m pentest intel-search "remote code execution"
.\pentest\.venv\Scripts\python.exe -m pentest cve-search -p apache
```

`intel-search` zeigt danach eine **Version**-Spalte, wo NVD oder GHSA eine Range
liefern (z. B. `>=2.4.0 <2.4.50`). CISA-KEV allein hat keine Versionsangabe —
solche Zeilen können weiter `-` zeigen, bis NVD/GHSA sie ergänzen.

Oder `Start-PenTestEngine.cmd` in denselben Ordner legen und damit starten.

## Scanner-CLIs + Lab-Run (Windows)

`install.sh --with-tools` ist **Kali/Debian-apt** und läuft nicht auf einem
Windows-Laptop. Default-`engage` braucht **nmap + nuclei** (Planner). Adaptive
Follow-ups können zusätzlich **httpx**, **subfinder**, **ffuf** aufrufen.

Hydra, sqlmap und Metasploit werden **nicht** mitinstalliert (Kali-only /
Offensive Extras). `--zeroday` / `--hardcore` nicht setzen.

PowerShell, im Engine-Ordner oder aus jedem Ordner (raw GitHub):

```powershell
Set-ExecutionPolicy -Scope Process Bypass
cd "$env:USERPROFILE\Desktop\Pen Test Engine"
$base = "https://raw.githubusercontent.com/cr4ckz3r0/cr4ck_em_4ll/cursor/pentest-engine-desktop-install-6ac6"
Invoke-WebRequest -UseBasicParsing "$base/Install-EngineTools.ps1" -OutFile Install-EngineTools.ps1
Invoke-WebRequest -UseBasicParsing "$base/Start-LabRun.ps1" -OutFile Start-LabRun.ps1
.\Install-EngineTools.ps1
.\Start-LabRun.ps1
# echter Scan erst nach dry-run, nur mit eigenem Ziel:
.\Start-LabRun.ps1 -Run
```

`Start-LabRun.ps1` setzt `PYTHONPATH` auf den Installationsordner und nutzt
immer `pentest\.venv\Scripts\python.exe`. Default-Ziel ist **`127.0.0.1`**
(dieses Gerät). Anderes eigenes Ziel: `-Target <IP>`. Ohne `-Run` nur
`scope-add` + `--dry-run`. Mit `-Run` kommt eine JA-Nachfrage, danach `engage`
**ohne** `--zeroday` / `--hardcore`. Default-Tools: **nmap only**. `-Full`
nimmt nmap+nuclei. ffuf/data-discovery nur mit `--tools ...,ffuf`.

Nach `engage` schreibt die Engine JSON nach `pentest\data\reports\`. Dann:

```powershell
.\pentest\.venv\Scripts\python.exe -m pentest status
```

Gleicher Ablauf per venv-Python:

```powershell
cd "$env:USERPROFILE\Desktop\Pen Test Engine"
$env:PYTHONPATH = (Get-Location).Path
$py = ".\pentest\.venv\Scripts\python.exe"
& $py -m pentest scope-add 127.0.0.1
& $py -m pentest engage "Lab" -t 127.0.0.1 --tools nmap --dry-run
& $py -m pentest engage "Lab" -t 127.0.0.1 --tools nmap
& $py -m pentest status
```

Nur wenn die IP **dein** System ist. Unautorisiertes Scannen ist illegal.

### Leonardo — Tools + Lab-Run (einfach einfügen)

PowerShell, **genau dieser Ordner**, immer venv-Python. Default ist **127.0.0.1**
(dieser Laptop). Anderes eigenes Ziel nur mit `-Target`.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
cd "C:\Users\LeonardoWeihINTENTUR\Desktop\Pen Test Engine"
$base = "https://raw.githubusercontent.com/cr4ckz3r0/cr4ck_em_4ll/cursor/pentest-engine-desktop-install-6ac6"
Invoke-WebRequest -UseBasicParsing "$base/Install-EngineTools.ps1" -OutFile Install-EngineTools.ps1
Invoke-WebRequest -UseBasicParsing "$base/Start-LabRun.ps1" -OutFile Start-LabRun.ps1
.\Install-EngineTools.ps1
.\Start-LabRun.ps1
.\Start-LabRun.ps1 -Run
```

Runtime-Fixes (Reports + `--tools` lock) brauchen das Overlay aus diesem Repo:

```powershell
cd "C:\Users\LeonardoWeihINTENTUR\Desktop"
git clone --depth 1 -b cursor/pentest-engine-desktop-install-6ac6 https://github.com/cr4ckz3r0/cr4ck_em_4ll.git pte-fixes
cd pte-fixes
.\Apply-EngineFixes.ps1
```

Oder ohne die Skripte, gleicher Effekt (nmap-only, localhost):

```powershell
cd "C:\Users\LeonardoWeihINTENTUR\Desktop\Pen Test Engine"
$env:PYTHONPATH = "C:\Users\LeonardoWeihINTENTUR\Desktop\Pen Test Engine"
$py = ".\pentest\.venv\Scripts\python.exe"
& $py -m pentest scope-add 127.0.0.1
& $py -m pentest engage "Lab" -t 127.0.0.1 --tools nmap --dry-run
& $py -m pentest engage "Lab" -t 127.0.0.1 --tools nmap
& $py -m pentest status
```

Kein `--zeroday`, kein `--hardcore`. hydra / sqlmap / msfconsole werden nicht
installiert.

### Leonardo — Patch + Index neu bauen (einfach einfügen)

PowerShell, **genau dieser Ordner**, immer venv-Python:

```powershell
cd "C:\Users\LeonardoWeihINTENTUR\Desktop\Pen Test Engine"
# Runtime-Fixes + CVE-Parser (Overlay aus diesem Repo, nicht nur ein Raw-File):
# .\Apply-EngineFixes.ps1   aus dem geklonten cr4ck_em_4ll-Ordner
Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/cr4ckz3r0/cr4ck_em_4ll/cursor/pentest-engine-desktop-install-6ac6/patch_cve_poller.py" -OutFile patch_cve_poller.py
.\pentest\.venv\Scripts\python.exe patch_cve_poller.py .
.\pentest\.venv\Scripts\python.exe patch_cve_poller.py --self-test
$env:PYTHONPATH = "C:\Users\LeonardoWeihINTENTUR\Desktop\Pen Test Engine"
.\pentest\.venv\Scripts\python.exe -m pentest cve-update
.\pentest\.venv\Scripts\python.exe -m pentest cve-stats
.\pentest\.venv\Scripts\python.exe -m pentest intel-search "remote code execution"
.\pentest\.venv\Scripts\python.exe -m pentest cve-search -p apache
```

Das füllt `affected_version` aus NVD-CPE-Ranges (`>=2.4.0 <2.4.50`) und GHSA
`vulnerable_version_range`. Danach hat `intel-search` eine Version-Spalte.
CISA-KEV-only-Einträge bleiben oft ohne präzise Version — das ist in den
Quelldaten so.

## Hinweise

- Standard-Scope ist `127.0.0.1`. Weitere Hosts erst nach Freigabe mit
  `python -m pentest scope-add` hinzufügen.
- Windows-Scanner: `Install-EngineTools.ps1`. hydra, sqlmap, Metasploit
  bleiben fehlend. Fehlende optionale Tools (ffuf, testssl, nikto, gobuster)
  werden übersprungen, nicht still gegen Port 80 gehämmert.
- File-mode: `python -m pentest status` liest `pentest\data\reports` ohne Postgres.
- Details, CLI und optionales PostgreSQL: siehe README im geklonten Engine-Repo.
- Sicherheitsregeln: `SECURITY.md` im Engine-Repo.
