#!/usr/bin/env python3
"""Patch pentest-engine so the local CVE RAG index can be built.

GitHub's GHSA API returns ``references`` as strings. The stock poller calls
``.get("url")`` on each item, raises AttributeError, and asyncio.gather then
discards NVD + CISA KEV as well. This patch:

- accepts string or dict references
- skips non-dict advisory rows
- keeps NVD/CISA results if GHSA still fails
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

OLD_REFS = '''                cvss = adv.get("cvss") or {}
                references = [r.get("url") for r in adv.get("references", []) if r.get("url")]
'''

NEW_REFS = '''                if not isinstance(adv, dict):
                    continue
                cvss = adv.get("cvss") if isinstance(adv.get("cvss"), dict) else {}
                raw_refs = adv.get("references") or []
                references = []
                for r in raw_refs:
                    if isinstance(r, str) and r:
                        references.append(r)
                    elif isinstance(r, dict) and r.get("url"):
                        references.append(r["url"])
'''

OLD_DATA_CHECK = '''            if not data:
                break

            stop = False
            for adv in data:
'''

NEW_DATA_CHECK = '''            if not data:
                break
            if not isinstance(data, list):
                logger.warning("ghsa_unexpected_payload", payload_type=type(data).__name__)
                break

            stop = False
            for adv in data:
'''

OLD_GATHER = '''        nvd_cves, kev_entries, ghsa_entries = await asyncio.gather(
            nvd_task, kev_task, ghsa_task
        )
'''

NEW_GATHER = '''        nvd_cves, kev_entries, ghsa_entries = await asyncio.gather(
            nvd_task, kev_task, ghsa_task, return_exceptions=True
        )
        if isinstance(nvd_cves, BaseException):
            logger.warning("cve_source_failed", source="nvd", error=str(nvd_cves))
            nvd_cves = []
        if isinstance(kev_entries, BaseException):
            logger.warning("cve_source_failed", source="cisa_kev", error=str(kev_entries))
            kev_entries = []
        if isinstance(ghsa_entries, BaseException):
            logger.warning("cve_source_failed", source="ghsa", error=str(ghsa_entries))
            ghsa_entries = []
'''


def find_poller(root: Path) -> Path:
    candidates = [
        root / "pentest" / "cve_feed" / "poller.py",
        root / "cve_feed" / "poller.py",
    ]
    for path in candidates:
        if path.is_file():
            return path
    raise SystemExit(f"poller.py nicht gefunden unter {root}")


def patch_text(text: str) -> tuple[str, list[str]]:
    applied: list[str] = []
    if "isinstance(adv.get(\"cvss\"), dict)" in text and "return_exceptions=True" in text:
        return text, ["already-patched"]
    if OLD_DATA_CHECK in text:
        text = text.replace(OLD_DATA_CHECK, NEW_DATA_CHECK, 1)
        applied.append("ghsa-list-guard")
    if OLD_REFS in text:
        text = text.replace(OLD_REFS, NEW_REFS, 1)
        applied.append("ghsa-references")
    if OLD_GATHER in text:
        text = text.replace(OLD_GATHER, NEW_GATHER, 1)
        applied.append("gather-return-exceptions")
    if not applied:
        raise SystemExit("Patch-Muster nicht gefunden — poller.py hat sich geaendert.")
    return text, applied


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch CVE poller for local RAG indexing")
    parser.add_argument(
        "root",
        nargs="?",
        default=".",
        help="Pen Test Engine install directory (contains pentest/)",
    )
    args = parser.parse_args()
    root = Path(args.root).expanduser().resolve()
    poller = find_poller(root)
    original = poller.read_text(encoding="utf-8")
    updated, applied = patch_text(original)
    if applied == ["already-patched"]:
        print(f"Bereits gepatcht: {poller}")
        return 0
    backup = poller.with_suffix(".py.bak")
    if not backup.exists():
        backup.write_text(original, encoding="utf-8")
        print(f"Backup: {backup}")
    poller.write_text(updated, encoding="utf-8")
    print(f"Gepatcht ({', '.join(applied)}): {poller}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
