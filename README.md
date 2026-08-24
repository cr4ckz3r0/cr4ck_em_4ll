# Pen Test Engine — lokale Desktop-Installation

Installiert das autorisierte, **nicht-destruktive** Pentest-Engine-Projekt
[leonardowo2002-bot/pentest-engine](https://github.com/leonardowo2002-bot/pentest-engine)
in den Ordner **Desktop / Pen Test Engine**.

> Nur auf Systemen verwenden, die du besitzt oder für die du eine **schriftliche
> Genehmigung** hast. Unautorisiertes Scannen ist illegal.

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

Es werden **keine** Offensiv-Pakete wie nmap, hydra, sqlmap oder Metasploit
installiert. Die Engine startet ohne sie; fehlende Wrapper melden das sauber.

PostgreSQL ist optional. Ohne Datenbank läuft die Engine im Datei-Modus
(`scope.json`, Audit/Evidence auf Disk).

Wenn der CVE-Index beim ersten Lauf fehlschlägt (GHSA-Parser) **oder** die
Spalte Version fast leer ist (NVD speichert oft `version=*`, die echte Range
steht in `versionStartIncluding` / `versionEndExcluding`), im installierten
Ordner ausführen:

```powershell
cd "$env:USERPROFILE\Desktop\Pen Test Engine"
Invoke-WebRequest "https://raw.githubusercontent.com/cr4ckz3r0/cr4ck_em_4ll/cursor/pentest-engine-desktop-install-6ac6/patch_cve_poller.py" -OutFile patch_cve_poller.py
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

### Leonardo — Patch + Index neu bauen (einfach einfügen)

PowerShell, **genau dieser Ordner**, immer venv-Python:

```powershell
cd "C:\Users\LeonardoWeihINTENTUR\Desktop\Pen Test Engine"
Invoke-WebRequest "https://raw.githubusercontent.com/cr4ckz3r0/cr4ck_em_4ll/cursor/pentest-engine-desktop-install-6ac6/patch_cve_poller.py" -OutFile patch_cve_poller.py
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
- Details, CLI und optionales PostgreSQL: siehe README im geklonten Engine-Repo.
- Sicherheitsregeln: `SECURITY.md` im Engine-Repo.
