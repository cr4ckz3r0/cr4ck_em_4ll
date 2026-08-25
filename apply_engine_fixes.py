#!/usr/bin/env python3
"""Apply desktop runtime + CVE patches onto a local Pen Test Engine install.

Copies engine_overlay/ (reports path, --tools lock, honest preflight, file-mode
status, markdown reports, nmap-to-CVE matches) then runs patch_cve_poller.py
(GHSA references + NVD version ranges). Also copies this fixer kit into the
engine install root so Start-LabRun.ps1 can re-apply after git pull.

Idempotent. Safe to re-run after git pull of pentest-engine.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OVERLAY = HERE / "engine_overlay"

HELPER_SCRIPTS = (
    "Start-LabRun.ps1",
    "Start-PenTestEngine.cmd",
    "Install-EngineTools.ps1",
    "Start-OptionalPostgres.ps1",
    "Apply-EngineFixes.ps1",
    "Make-Ready.ps1",
    "Make-Ready.cmd",
)

FIX_KIT_FILES = (
    "apply_engine_fixes.py",
    "patch_cve_poller.py",
    "cve_version_extract.py",
)


def _same_path(left: Path, right: Path) -> bool:
    try:
        return left.resolve() == right.resolve()
    except OSError:
        return False


def _copy_file(src: Path, dest: Path) -> bool:
    if not src.is_file():
        return False
    if dest.exists() and _same_path(src, dest):
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    return True


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
        if not _copy_file(src, dest):
            continue
        copied.append(str(rel).replace("\\", "/"))
        print(f"Overlay: {dest}", flush=True)
    return copied


def copy_helper_scripts(root: Path) -> list[str]:
    copied: list[str] = []
    for name in HELPER_SCRIPTS:
        src = HERE / name
        dest = root / name
        if not _copy_file(src, dest):
            continue
        copied.append(name)
        print(f"Skript: {dest}", flush=True)
    return copied


def copy_fix_kit(root: Path) -> list[str]:
    """Copy this fixer kit into the engine install so git pull can be re-patched locally.

    Skips when source == dest (running from the engine folder itself).
    """
    copied: list[str] = []
    if _same_path(root, HERE):
        print("Fix-Kit: Quelle == Ziel, Kopie uebersprungen", flush=True)
        return copied

    dest_overlay = root / "engine_overlay"
    if OVERLAY.is_dir() and not _same_path(dest_overlay, OVERLAY):
        overlay_files = copy_overlay(dest_overlay, OVERLAY)
        if overlay_files:
            copied.append("engine_overlay/")
            print(
                f"Fix-Kit Overlay: {dest_overlay} ({len(overlay_files)} Dateien)",
                flush=True,
            )

    for name in FIX_KIT_FILES:
        src = HERE / name
        dest = root / name
        if not _copy_file(src, dest):
            continue
        copied.append(name)
        print(f"Fix-Kit: {dest}", flush=True)
    return copied


def _set_env_key(path: Path, key: str, value: str) -> None:
    raw = path.read_text(encoding="utf-8") if path.is_file() else ""
    lines = raw.splitlines()
    found = False
    out: list[str] = []
    prefix = key + "="
    hash_prefix = "#" + key + "="
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(prefix) or stripped.startswith(hash_prefix):
            if not found:
                out.append(key + "=" + value)
                found = True
            continue
        out.append(line)
    if not found:
        out.append(key + "=" + value)
    path.write_text("\n".join(out) + "\n", encoding="utf-8")


def prepare_install(root: Path) -> None:
    pkg = root / "pentest"
    example_env = pkg / ".env.example"
    env_file = pkg / ".env"
    if example_env.is_file() and not env_file.is_file():
        shutil.copy2(example_env, env_file)
        print(f".env angelegt: {env_file}", flush=True)
    if env_file.is_file() and shutil.which("docker") is None:
        _set_env_key(env_file, "PENTEST_DOCKER_ENABLED", "false")
        print("PENTEST_DOCKER_ENABLED=false (kein Docker im PATH)", flush=True)
    root_env = root / ".env"
    if env_file.is_file() and not root_env.is_file():
        shutil.copy2(env_file, root_env)

    example_scope = pkg / "scope.example.json"
    scope_file = pkg / "scope.json"
    if example_scope.is_file() and not scope_file.is_file():
        shutil.copy2(example_scope, scope_file)
        print(f"scope.json angelegt: {scope_file}", flush=True)

    reports = pkg / "data" / "reports"
    reports.mkdir(parents=True, exist_ok=True)


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
        assert "match_findings" in engine
        planner = (tmp / "pentest" / "swarm" / "planner.py").read_text(encoding="utf-8")
        assert "lock_tools" in planner

        kit = copy_fix_kit(tmp)
        if "engine_overlay/" not in kit:
            raise SystemExit("Fix-Kit Overlay nicht kopiert")
        for name in FIX_KIT_FILES:
            if not (HERE / name).is_file():
                continue
            if name not in kit:
                raise SystemExit(f"Fix-Kit Datei fehlt: {name}")
            if not (tmp / name).is_file():
                raise SystemExit(f"Fix-Kit Ziel fehlt: {name}")
        if not (tmp / "engine_overlay" / "pentest" / "engine.py").is_file():
            raise SystemExit("engine_overlay/ nicht im Install-Root")
        skipped = copy_fix_kit(HERE)
        if skipped:
            raise SystemExit("Fix-Kit Quelle==Ziel muss leer sein")
        helpers = copy_helper_scripts(tmp)
        lab = (tmp / "Start-LabRun.ps1").read_text(encoding="utf-8") if (tmp / "Start-LabRun.ps1").is_file() else (HERE / "Start-LabRun.ps1").read_text(encoding="utf-8")
        for marker in (
            "_export_file_reports",
            "Select-String",
            "report_latest.md",
            "Install-EngineTools.ps1",
            "nmap-only",
        ):
            if marker not in lab:
                raise SystemExit(f"Start-LabRun.ps1 fehlt Marker: {marker}")
        for ch in "äöüÄÖÜß":
            if ch in lab:
                raise SystemExit("Start-LabRun.ps1 enthaelt Umlaute (PS 5.1: ASCII only)")
        if "\u2014" in lab or "\u2013" in lab:
            raise SystemExit("Start-LabRun.ps1 enthaelt em/en-dash")

        print(
            f"Self-test OK: {len(copied)} overlay files, "
            f"{len(kit)} fix-kit items, {len(helpers)} scripts"
        )
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
    if "match_findings" not in text:
        missing.append("engine.match_findings")
    planner = (root / "pentest" / "swarm" / "planner.py").read_text(encoding="utf-8")
    if "lock_tools" not in planner:
        missing.append("planner.lock_tools")
    exporter = (root / "pentest" / "reporting" / "json_export.py").read_text(encoding="utf-8")
    if "reports_dir" not in exporter:
        missing.append("json_export.reports_dir")
    ready = root / "pentest" / "ready.py"
    if not ready.is_file():
        missing.append("ready.py")
    cli = (root / "pentest" / "cli.py").read_text(encoding="utf-8")
    if "def ready(" not in cli:
        missing.append("cli.ready")
    md_export = root / "pentest" / "reporting" / "markdown_export.py"
    if md_export.is_file():
        md_text = md_export.read_text(encoding="utf-8")
        if "filename" not in md_text or "report_latest.md" not in md_text:
            missing.append("markdown_export.write_report")
    else:
        missing.append("markdown_export.py")
    json_text = exporter
    if 'status != "dry_run"' in json_text or "status != 'dry_run'" in json_text:
        missing.append("json_export.always_markdown")
    service_cve = root / "pentest" / "intel" / "service_cve.py"
    if not service_cve.is_file():
        missing.append("intel.service_cve")
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
    kit = copy_fix_kit(root)
    print(f"==> {len(kit)} Fix-Kit-Dateien im Engine-Ordner", flush=True)
    scripts = copy_helper_scripts(root)
    print(f"==> {len(scripts)} Lab-Skripte im Engine-Ordner", flush=True)
    verify_overlay(root)
    prepare_install(root)
    cve_rc = run_cve_patcher(root)
    if cve_rc:
        return cve_rc
    print("Fertig. Danach: python -m pentest ready   bzw. .\\Start-LabRun.ps1", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
