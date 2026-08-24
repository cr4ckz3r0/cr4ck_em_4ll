#!/usr/bin/env python3
"""Apply desktop runtime + CVE patches onto a local Pen Test Engine install.

Copies engine_overlay/ (reports path, --tools lock, honest preflight, file-mode
status) then runs patch_cve_poller.py (GHSA references + NVD version ranges).

Idempotent. Safe to re-run after git pull of pentest-engine.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OVERLAY = HERE / "engine_overlay"


def find_package_root(root: Path) -> Path:
    if (root / "pentest" / "engine.py").is_file():
        return root
    if (root / "engine.py").is_file() and (root / "cli.py").is_file():
        return root.parent
    raise SystemExit(f"Pen Test Engine nicht gefunden unter {root}")


def copy_overlay(root: Path, overlay: Path) -> list[str]:
    if not overlay.is_dir():
        print(f"WARN: Overlay fehlt: {overlay}")
        return []
    copied: list[str] = []
    for src in sorted(overlay.rglob("*")):
        if not src.is_file():
            continue
        if src.name.endswith(".pyc") or "__pycache__" in src.parts:
            continue
        rel = src.relative_to(overlay)
        dest = root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        copied.append(str(rel).replace("\\", "/"))
        print(f"Overlay: {dest}", flush=True)
    return copied


def run_cve_patcher(root: Path) -> int:
    patcher = HERE / "patch_cve_poller.py"
    if not patcher.is_file():
        print("WARN: patch_cve_poller.py fehlt — CVE-Hunks uebersprungen")
        return 0
    import subprocess

    result = subprocess.run(
        [sys.executable, str(patcher), str(root)],
        check=False,
    )
    return int(result.returncode)


def run_self_test() -> int:
    import tempfile

    tmp = Path(tempfile.mkdtemp(prefix="pte-overlay-"))
    try:
        (tmp / "pentest").mkdir()
        (tmp / "pentest" / "engine.py").write_text("# stub\n", encoding="utf-8")
        copied = copy_overlay(tmp, OVERLAY)
        if not copied:
            raise SystemExit("Overlay-Kopie leer")
        verify_overlay(tmp)
        engine = (tmp / "pentest" / "engine.py").read_text(encoding="utf-8")
        assert "_wants_data_discovery" in engine
        assert "_export_file_reports" in engine
        planner = (tmp / "pentest" / "swarm" / "planner.py").read_text(encoding="utf-8")
        assert "lock_tools" in planner
        print(f"Self-test OK: {len(copied)} overlay files copied")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def verify_overlay(root: Path) -> None:
    engine = root / "pentest" / "engine.py"
    text = engine.read_text(encoding="utf-8")
    missing = []
    if "_wants_data_discovery" not in text:
        missing.append("engine._wants_data_discovery")
    if "_export_file_reports" not in text:
        missing.append("engine._export_file_reports")
    planner = (root / "pentest" / "swarm" / "planner.py").read_text(encoding="utf-8")
    if "lock_tools" not in planner:
        missing.append("planner.lock_tools")
    exporter = (root / "pentest" / "reporting" / "json_export.py").read_text(encoding="utf-8")
    if "reports_dir" not in exporter:
        missing.append("json_export.reports_dir")
    if missing:
        raise SystemExit("Overlay unvollstaendig: " + ", ".join(missing))


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply Pen Test Engine desktop fixes")
    parser.add_argument(
        "root",
        nargs="?",
        default=".",
        help="Pen Test Engine install directory (contains pentest/)",
    )
    parser.add_argument("--self-test", action="store_true", help="Copy overlay to a temp dir and verify markers")
    args = parser.parse_args()
    if args.self_test:
        return run_self_test()
    root = find_package_root(Path(args.root).expanduser().resolve())
    print(f"==> Engine: {root}", flush=True)
    copied = copy_overlay(root, OVERLAY)
    print(f"==> {len(copied)} Overlay-Dateien", flush=True)
    verify_overlay(root)
    cve_rc = run_cve_patcher(root)
    if cve_rc:
        return cve_rc
    print("Fertig. File-mode Reports unter pentest/data/reports/; --tools nmap bleibt nmap-only.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
