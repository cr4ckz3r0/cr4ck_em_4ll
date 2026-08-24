#!/usr/bin/env bash
set -euo pipefail

# Installs Pen Test Engine onto ~/Desktop/Pen Test Engine.
# Base install only (Python + local CVE RAG). Does not install offensive
# host packages such as nmap/hydra/sqlmap/metasploit.
#
# Usage:
#   chmod +x install-desktop.sh
#   ./install-desktop.sh

REPO_URL="https://github.com/leonardowo2002-bot/pentest-engine.git"
FOLDER_NAME="Pen Test Engine"
DESKTOP="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
if [[ ! -d "$DESKTOP" ]]; then
  mkdir -p "$DESKTOP"
fi
INSTALL_DIR="$DESKTOP/$FOLDER_NAME"

echo "==> Pen Test Engine — lokale Desktop-Installation"
echo "    Ziel: $INSTALL_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 fehlt." >&2
  exit 1
fi

PY_MAJOR="$(python3 -c 'import sys; print(sys.version_info[0])')"
PY_MINOR="$(python3 -c 'import sys; print(sys.version_info[1])')"
if [[ "$PY_MAJOR" -lt 3 || ( "$PY_MAJOR" -eq 3 && "$PY_MINOR" -lt 11 ) ]]; then
  echo "ERROR: Python >= 3.11 wird benoetigt (gefunden: ${PY_MAJOR}.${PY_MINOR})." >&2
  exit 1
fi
echo "==> Python $(python3 -V | awk '{print $2}')"

if [[ ! -d "$INSTALL_DIR" ]]; then
  if command -v git >/dev/null 2>&1; then
    echo "==> Klone Repository nach Desktop/${FOLDER_NAME}"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  else
    echo "==> git nicht gefunden — lade ZIP von GitHub"
    TMP_ZIP="$(mktemp -t pentest-engine.XXXXXX.zip)"
    TMP_DIR="$(mktemp -d -t pentest-engine.XXXXXX)"
    curl -fsSL "https://github.com/leonardowo2002-bot/pentest-engine/archive/refs/heads/main.zip" -o "$TMP_ZIP"
    python3 - "$TMP_ZIP" "$TMP_DIR" "$INSTALL_DIR" <<'PY'
import sys, zipfile, shutil
from pathlib import Path
zip_path, extract_to, dest = map(Path, sys.argv[1:4])
with zipfile.ZipFile(zip_path) as zf:
    zf.extractall(extract_to)
src = next(p for p in extract_to.iterdir() if p.is_dir())
dest.mkdir(parents=True, exist_ok=True)
for item in src.iterdir():
    target = dest / item.name
    if item.is_dir():
        shutil.copytree(item, target, dirs_exist_ok=True)
    else:
        shutil.copy2(item, target)
PY
    rm -rf "$TMP_ZIP" "$TMP_DIR"
  fi
elif [[ -d "$INSTALL_DIR/.git" ]] && command -v git >/dev/null 2>&1; then
  echo "==> Ordner existiert bereits — aktualisiere mit git pull"
  git -C "$INSTALL_DIR" pull --ff-only || echo "WARN: git pull fehlgeschlagen, fahre mit vorhandenem Stand fort."
else
  echo "==> Ordner existiert bereits — Installation wird fortgesetzt"
fi

cd "$INSTALL_DIR"
PACKAGE_DIR="$INSTALL_DIR/pentest"
VENV_DIR="$PACKAGE_DIR/.venv"

if [[ ! -d "$VENV_DIR" ]]; then
  echo "==> Erstelle virtuelle Umgebung"
  python3 -m venv "$VENV_DIR"
fi

VENV_PY="$VENV_DIR/bin/python"
if [[ ! -x "$VENV_PY" ]]; then
  VENV_PY="$VENV_DIR/Scripts/python.exe"
fi

echo "==> Installiere Python-Pakete (kann mehrere Minuten dauern)"
"$VENV_PY" -m pip install --upgrade pip
"$VENV_PY" -m pip install -r "$INSTALL_DIR/requirements.txt"
"$VENV_PY" -m pip install -e "$INSTALL_DIR"

if [[ -f "$PACKAGE_DIR/.env.example" && ! -f "$PACKAGE_DIR/.env" ]]; then
  cp "$PACKAGE_DIR/.env.example" "$PACKAGE_DIR/.env"
  echo "==> .env aus Vorlage angelegt"
fi
if [[ -f "$PACKAGE_DIR/scope.example.json" && ! -f "$PACKAGE_DIR/scope.json" ]]; then
  cp "$PACKAGE_DIR/scope.example.json" "$PACKAGE_DIR/scope.json"
  echo "==> scope.json aus Vorlage angelegt (zuerst nur 127.0.0.1)"
fi

export PYTHONPATH="$INSTALL_DIR"
echo "==> Lade MiniLM-RAG-Modell und indexiere aktuelle CVEs"
if ! "$VENV_PY" -m pentest setup; then
  echo "WARN: Bootstrap unvollstaendig. Spaeter erneut: python -m pentest setup" >&2
fi

LAUNCHER="$INSTALL_DIR/start-pen-test-engine.sh"
cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "\$0")"
export PYTHONPATH="\$(pwd)"
# shellcheck disable=SC1091
source pentest/.venv/bin/activate
echo
echo " Pen Test Engine"
echo " Nur autorisierte Ziele. Siehe README.md und SECURITY.md."
echo
echo " Beispiele:"
echo "   python -m pentest --help"
echo "   python -m pentest scope-add 127.0.0.1"
echo "   python -m pentest engage \"Lab\" -t 127.0.0.1 --dry-run"
echo
exec "\${SHELL:-bash}" -i
EOF
chmod +x "$LAUNCHER"

DESKTOP_LAUNCHER="$DESKTOP/Pen Test Engine.desktop"
cat > "$DESKTOP_LAUNCHER" <<EOF
[Desktop Entry]
Type=Application
Name=Pen Test Engine
Comment=Lokale, nicht-destruktive Pentest-Engine (nur autorisierte Ziele)
Exec=bash -lc '$LAUNCHER'
Path=$INSTALL_DIR
Terminal=true
Categories=Development;
EOF
chmod +x "$DESKTOP_LAUNCHER" 2>/dev/null || true

echo
echo "Installation fertig."
echo " Ordner:    $INSTALL_DIR"
echo " Starter:   $LAUNCHER"
echo " Desktop:   $DESKTOP_LAUNCHER"
echo
echo "Naechste Schritte (nur eigene / schriftlich freigegebene Lab-Ziele):"
echo "  1. $LAUNCHER"
echo "  2. python -m pentest scope-add 127.0.0.1"
echo "  3. python -m pentest engage \"Lab\" -t 127.0.0.1 --dry-run"
echo
echo "Nur autorisierte Ziele. Siehe README.md und SECURITY.md."
