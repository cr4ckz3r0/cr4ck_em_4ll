# Pen Test Engine — lokale Desktop-Installation

Installiert das autorisierte, **nicht-destruktive** Pentest-Engine-Projekt
[leonardowo2002-bot/pentest-engine](https://github.com/leonardowo2002-bot/pentest-engine)
in den Ordner **Desktop / Pen Test Engine**.

> Nur auf Systemen verwenden, die du besitzt oder für die du eine **schriftliche
> Genehmigung** hast. Unautorisiertes Scannen ist illegal.

## Windows

Voraussetzungen: **Python 3.11+** (Haken bei „Add python.exe to PATH“) und
idealerweise **Git**.

1. Dieses Repository klonen oder die Dateien herunterladen.
2. Doppelklick auf `Install-PenTestEngine.cmd`  
   oder in PowerShell:

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

Wenn der CVE-Index beim ersten Lauf fehlschlaegt (Netzwerk/API), spaeter erneut:

```text
python -m pentest cve-update
```

## Hinweise

- Standard-Scope ist `127.0.0.1`. Weitere Hosts erst nach Freigabe mit
  `python -m pentest scope-add` hinzufügen.
- Details, CLI und optionales PostgreSQL: siehe README im geklonten Engine-Repo.
- Sicherheitsregeln: `SECURITY.md` im Engine-Repo.
