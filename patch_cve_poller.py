#!/usr/bin/env python3
"""Patch a local Pen Test Engine install for CVE RAG indexing.

Applies two layers (idempotent; safe to re-run):

1. GHSA parser: GitHub returns ``references`` as strings. The stock poller
   calls ``.get("url")`` and asyncio.gather then drops NVD + CISA KEV too.
2. Affected versions: NVD CPE often has ``version=*`` with the real range in
   ``versionStartIncluding`` / ``versionEndExcluding``. GHSA has
   ``vulnerabilities[].vulnerable_version_range``. Those fields are extracted,
   stored as compact labels (max 255 chars), written into RAG metadata, and
   shown as a Version column in ``intel-search``.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Embedded copy of cve_version_extract.py (used when the sibling file is
# missing, e.g. a one-file Invoke-WebRequest of this script).
# ---------------------------------------------------------------------------

VERSION_EXTRACT_PY = r'''"""Compact affected_version labels from NVD CPE matches and GHSA advisories.

NVD often stores ``version=*`` on the CPE and puts the real range in
``versionStartIncluding`` / ``versionEndExcluding`` (and related fields).
GHSA exposes ``vulnerabilities[].vulnerable_version_range``.
"""

from __future__ import annotations

from typing import Any, Optional

AFFECTED_VERSION_MAX_LEN = 255
_WILDCARD = {"*", "-", ""}


def truncate_affected_version(label: Optional[str]) -> Optional[str]:
    """Fit a version label into the CVEEntry.affected_version VARCHAR(255)."""
    if not label:
        return None
    text = " ".join(str(label).split())
    if not text:
        return None
    if len(text) <= AFFECTED_VERSION_MAX_LEN:
        return text
    return text[: AFFECTED_VERSION_MAX_LEN - 3].rstrip() + "..."


def format_cpe_version_range(cpe_match: dict[str, Any]) -> Optional[str]:
    """Build ``>=2.4.0 <2.4.50`` or an exact CPE version token."""
    if not isinstance(cpe_match, dict):
        return None

    bits: list[str] = []
    start_inc = cpe_match.get("versionStartIncluding")
    start_exc = cpe_match.get("versionStartExcluding")
    end_inc = cpe_match.get("versionEndIncluding")
    end_exc = cpe_match.get("versionEndExcluding")
    if start_inc:
        bits.append(f">={start_inc}")
    if start_exc:
        bits.append(f">{start_exc}")
    if end_inc:
        bits.append(f"<={end_inc}")
    if end_exc:
        bits.append(f"<{end_exc}")
    if bits:
        return " ".join(str(b) for b in bits)

    criteria = cpe_match.get("criteria") or ""
    parts = str(criteria).split(":")
    if len(parts) >= 6 and parts[5] not in _WILDCARD:
        return parts[5]
    return None


def _iter_node_matches(node: dict[str, Any]):
    for match in node.get("cpeMatch") or []:
        if isinstance(match, dict):
            yield match
    for child in node.get("children") or []:
        if isinstance(child, dict):
            yield from _iter_node_matches(child)


def iter_nvd_cpe_matches(cve_data: dict[str, Any]):
    """Yield every CPE match under NVD 2.0 ``configurations`` (including nested nodes)."""
    if not isinstance(cve_data, dict):
        return
    for config in cve_data.get("configurations") or []:
        if not isinstance(config, dict):
            continue
        for node in config.get("nodes") or []:
            if isinstance(node, dict):
                yield from _iter_node_matches(node)


def extract_nvd_affected(
    cve_data: dict[str, Any],
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Return ``(vendor, product, version)`` from all vulnerable CPE matches."""
    vendor = None
    product = None
    labels: list[str] = []
    seen: set[str] = set()

    for match in iter_nvd_cpe_matches(cve_data):
        if match.get("vulnerable") is False:
            continue
        criteria = match.get("criteria") or ""
        parts = str(criteria).split(":")
        if len(parts) >= 6:
            cpe_vendor = parts[3] if parts[3] not in _WILDCARD else None
            cpe_product = parts[4] if parts[4] not in _WILDCARD else None
            if vendor is None and cpe_vendor:
                vendor = cpe_vendor
            if product is None and cpe_product:
                product = cpe_product
        label = format_cpe_version_range(match)
        if label and label not in seen:
            seen.add(label)
            labels.append(label)

    version = truncate_affected_version("; ".join(labels) if labels else None)
    return vendor, product, version


def extract_ghsa_affected(
    adv: dict[str, Any],
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Return ``(ecosystem, package, version_range)`` from a GHSA advisory."""
    if not isinstance(adv, dict):
        return None, None, None

    vendor = None
    product = None
    labels: list[str] = []
    seen: set[str] = set()

    for vuln in adv.get("vulnerabilities") or []:
        if not isinstance(vuln, dict):
            continue
        pkg = vuln.get("package") if isinstance(vuln.get("package"), dict) else {}
        name = (pkg or {}).get("name")
        ecosystem = (pkg or {}).get("ecosystem")
        if product is None and name:
            product = str(name)
        if vendor is None and ecosystem:
            vendor = str(ecosystem)
        rng = vuln.get("vulnerable_version_range")
        if isinstance(rng, str):
            rng = rng.strip()
            if rng and rng not in seen:
                seen.add(rng)
                labels.append(rng)

    version = truncate_affected_version("; ".join(labels) if labels else None)
    return vendor, product, version
'''

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

OLD_NVD_CPE = '''            # Extract first affected product/vendor/version from CPE matches
            affected_vendor = None
            affected_product = None
            affected_version = None
            for config in cve_data.get("configurations", []):
                for node in config.get("nodes", []):
                    for cpe_match in node.get("cpeMatch", []):
                        if cpe_match.get("vulnerable"):
                            cpe23 = cpe_match.get("criteria", "")
                            if cpe23:
                                parts = cpe23.split(":")
                                if len(parts) >= 6:
                                    affected_vendor = parts[3] if parts[3] != "*" and parts[3] != "-" else None
                                    affected_product = parts[4] if parts[4] != "*" and parts[4] != "-" else None
                                    affected_version = parts[5] if parts[5] != "*" and parts[5] != "-" else None
                            if affected_product:
                                break
                    if affected_product:
                        break
                if affected_product:
                    break
'''

NEW_NVD_CPE = '''            # All CPE matches: exact token or versionStart/End* range fields
            affected_vendor, affected_product, affected_version = extract_nvd_affected(cve_data)
'''

OLD_IMPORT = '''from ..db.models import CVEEntry
'''

NEW_IMPORT = '''from ..db.models import CVEEntry
from .version_extract import extract_ghsa_affected, extract_nvd_affected
'''

OLD_GHSA_APPEND = '''                advisories.append({
                    "cve_id": identifier,
                    "ghsa_id": ghsa_id,
                    "description": adv.get("summary") or adv.get("description") or "",
                    "cvss_score": cvss.get("score"),
                    "ghsa_severity": adv.get("severity"),
                    "published_at": published,
                    "modified_at": adv.get("updated_at"),
                    "references": references,
                    "poc_available": any("poc" in (u or "").lower() or "exploit" in (u or "").lower() for u in references),
                })
'''

NEW_GHSA_APPEND = '''                ghsa_vendor, ghsa_product, ghsa_version = extract_ghsa_affected(adv)

                advisories.append({
                    "cve_id": identifier,
                    "ghsa_id": ghsa_id,
                    "description": adv.get("summary") or adv.get("description") or "",
                    "cvss_score": cvss.get("score"),
                    "ghsa_severity": adv.get("severity"),
                    "published_at": published,
                    "modified_at": adv.get("updated_at"),
                    "references": references,
                    "poc_available": any("poc" in (u or "").lower() or "exploit" in (u or "").lower() for u in references),
                    "affected_vendor": ghsa_vendor,
                    "affected_product": ghsa_product,
                    "affected_version": ghsa_version,
                })
'''

OLD_MERGE_GHSA = '''                entry.setdefault("ghsa_id", ghsa.get("ghsa_id"))
                # Merge references without duplicates
'''

NEW_MERGE_GHSA = '''                entry.setdefault("ghsa_id", ghsa.get("ghsa_id"))
                if not entry.get("affected_version") and ghsa.get("affected_version"):
                    entry["affected_version"] = ghsa["affected_version"]
                if not entry.get("affected_product") and ghsa.get("affected_product"):
                    entry["affected_product"] = ghsa["affected_product"]
                if not entry.get("affected_vendor") and ghsa.get("affected_vendor"):
                    entry["affected_vendor"] = ghsa["affected_vendor"]
                # Merge references without duplicates
'''

OLD_GHSA_ONLY = '''                    "poc_available": ghsa.get("poc_available", False),
                    "affected_vendor": None,
                    "affected_product": None,
                    "affected_version": None,
                }
'''

NEW_GHSA_ONLY = '''                    "poc_available": ghsa.get("poc_available", False),
                    "affected_vendor": ghsa.get("affected_vendor"),
                    "affected_product": ghsa.get("affected_product"),
                    "affected_version": ghsa.get("affected_version"),
                }
'''

OLD_RAG_DOC = '''        product = entry.get("affected_product") or ""
        vendor = entry.get("affected_vendor") or ""
        parts = [str(cve_id), str(vendor), str(product), str(desc)]
        return " ".join(p for p in parts if p).strip()
'''

NEW_RAG_DOC = '''        product = entry.get("affected_product") or ""
        vendor = entry.get("affected_vendor") or ""
        version = entry.get("affected_version") or ""
        parts = [str(cve_id), str(vendor), str(product), str(version), str(desc)]
        return " ".join(p for p in parts if p).strip()
'''

OLD_RAG_META = '''                    "affected_product": entry.get("affected_product"),
                    "affected_vendor": entry.get("affected_vendor"),
                    "poc_available": bool(entry.get("poc_available")),
'''

NEW_RAG_META = '''                    "affected_product": entry.get("affected_product"),
                    "affected_vendor": entry.get("affected_vendor"),
                    "affected_version": entry.get("affected_version"),
                    "poc_available": bool(entry.get("poc_available")),
'''

OLD_RAG_SEARCH = '''                "affected_product": meta.get("affected_product"),
                "provider": settings.embedding.provider,
'''

NEW_RAG_SEARCH = '''                "affected_product": meta.get("affected_product"),
                "affected_version": meta.get("affected_version"),
                "provider": settings.embedding.provider,
'''

OLD_INTEL_TABLE = '''        cve_table = Table(title="CVE RAG results")
        cve_table.add_column("CVE", style="cyan")
        cve_table.add_column("Product", style="blue")
        cve_table.add_column("KEV", style="magenta")
        cve_table.add_column("Similarity", style="green")
        cve_table.add_column("Description", style="white")
        for r in cve_hits:
            desc = r.get("description") or ""
            cve_table.add_row(
                str(r.get("cve_id") or r.get("id") or ""),
                str(r.get("affected_product") or "-"),
                "YES" if r.get("is_kev") else "no",
                f"{r.get('similarity', 0):.2f}",
                (desc[:80] + "...") if len(desc) > 80 else desc,
            )
'''

NEW_INTEL_TABLE = '''        cve_table = Table(title="CVE RAG results")
        cve_table.add_column("CVE", style="cyan")
        cve_table.add_column("Product", style="blue")
        cve_table.add_column("Version", style="blue")
        cve_table.add_column("KEV", style="magenta")
        cve_table.add_column("Similarity", style="green")
        cve_table.add_column("Description", style="white")
        for r in cve_hits:
            desc = r.get("description") or ""
            cve_table.add_row(
                str(r.get("cve_id") or r.get("id") or ""),
                str(r.get("affected_product") or "-"),
                str(r.get("affected_version") or "-"),
                "YES" if r.get("is_kev") else "no",
                f"{r.get('similarity', 0):.2f}",
                (desc[:80] + "...") if len(desc) > 80 else desc,
            )
'''


def apply_hunk(text: str, old: str, new: str, name: str, applied: list[str]) -> str:
    # Prefer the new snippet so we never re-apply when `old` is a prefix of `new`
    # (e.g. adding an import below an existing import line).
    if new in text:
        applied.append(f"{name}:already")
        return text
    if old in text:
        text = text.replace(old, new, 1)
        applied.append(name)
        return text
    return text


def find_engine_file(root: Path, *parts: str) -> Path:
    direct = root.joinpath(*parts)
    if direct.is_file():
        return direct
    nested = root.joinpath("pentest", *parts)
    if nested.is_file():
        return nested
    raise FileNotFoundError(f"{'/'.join(parts)} nicht gefunden unter {root}")


def _find_poller(root: Path) -> Path:
    candidates = [
        root / "pentest" / "cve_feed" / "poller.py",
        root / "cve_feed" / "poller.py",
    ]
    for path in candidates:
        if path.is_file():
            return path
    raise SystemExit(f"poller.py nicht gefunden unter {root}")


def version_extract_source() -> str:
    sibling = Path(__file__).with_name("cve_version_extract.py")
    if sibling.is_file():
        return sibling.read_text(encoding="utf-8")
    return VERSION_EXTRACT_PY


def write_version_extract(root: Path) -> tuple[Path, str]:
    poller = _find_poller(root)
    dest = poller.with_name("version_extract.py")
    source = version_extract_source()
    if dest.is_file() and dest.read_text(encoding="utf-8") == source:
        return dest, "already"
    dest.write_text(source, encoding="utf-8")
    return dest, "written"


def backup(path: Path) -> None:
    bak = path.with_suffix(path.suffix + ".bak")
    if not bak.exists():
        bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"Backup: {bak}")


def patch_poller_text(text: str) -> tuple[str, list[str]]:
    applied: list[str] = []
    text = apply_hunk(text, OLD_DATA_CHECK, NEW_DATA_CHECK, "ghsa-list-guard", applied)
    text = apply_hunk(text, OLD_REFS, NEW_REFS, "ghsa-references", applied)
    text = apply_hunk(text, OLD_GATHER, NEW_GATHER, "gather-return-exceptions", applied)
    text = apply_hunk(text, OLD_IMPORT, NEW_IMPORT, "version-import", applied)
    text = apply_hunk(text, OLD_NVD_CPE, NEW_NVD_CPE, "nvd-cpe-ranges", applied)
    text = apply_hunk(text, OLD_GHSA_APPEND, NEW_GHSA_APPEND, "ghsa-version-fields", applied)
    text = apply_hunk(text, OLD_MERGE_GHSA, NEW_MERGE_GHSA, "ghsa-merge-fill-version", applied)
    text = apply_hunk(text, OLD_GHSA_ONLY, NEW_GHSA_ONLY, "ghsa-only-version", applied)

    required = {"nvd-cpe-ranges", "ghsa-version-fields", "ghsa-merge-fill-version"}
    got = {name.split(":")[0] for name in applied}
    missing = [name for name in required if name not in got]
    if missing and "extract_nvd_affected" not in text:
        raise SystemExit(
            "Patch-Muster nicht gefunden — poller.py hat sich geaendert: "
            + ", ".join(missing)
        )
    return text, applied


def patch_file(path: Path, hunks: list[tuple[str, str, str]], required: set[str]) -> list[str]:
    original = path.read_text(encoding="utf-8")
    text = original
    applied: list[str] = []
    for old, new, name in hunks:
        text = apply_hunk(text, old, new, name, applied)
    got = {name.split(":")[0] for name in applied}
    missing = [name for name in required if name not in got]
    if missing:
        # Treat as already patched if the new snippets are present.
        if all(new in original for _old, new, name in hunks if name in required):
            return ["already-patched"]
        raise SystemExit(
            f"Patch-Muster nicht gefunden in {path.name}: " + ", ".join(missing)
        )
    if text != original:
        backup(path)
        path.write_text(text, encoding="utf-8")
    return applied


def run_self_test() -> int:
    ns: dict = {}
    exec(version_extract_source(), ns)  # noqa: S102 — isolated extractor self-test
    fmt = ns["format_cpe_version_range"]
    extract_nvd = ns["extract_nvd_affected"]
    extract_ghsa = ns["extract_ghsa_affected"]

    label = fmt({
        "criteria": "cpe:2.3:a:apache:http_server:*:*:*:*:*:*:*:*",
        "versionStartIncluding": "2.4.0",
        "versionEndExcluding": "2.4.50",
    })
    assert label == ">=2.4.0 <2.4.50", label

    exact = fmt({
        "criteria": "cpe:2.3:a:apache:http_server:2.4.49:*:*:*:*:*:*:*",
    })
    assert exact == "2.4.49", exact

    vendor, product, version = extract_nvd({
        "configurations": [{
            "nodes": [{
                "cpeMatch": [
                    {
                        "vulnerable": True,
                        "criteria": "cpe:2.3:a:apache:http_server:*:*:*:*:*:*:*:*",
                        "versionStartIncluding": "2.4.0",
                        "versionEndExcluding": "2.4.60",
                    },
                    {
                        "vulnerable": True,
                        "criteria": "cpe:2.3:o:netapp:clustered_data_ontap:9.0:*:*:*:*:*:*:*",
                    },
                ]
            }]
        }]
    })
    assert vendor == "apache" and product == "http_server", (vendor, product)
    assert version == ">=2.4.0 <2.4.60; 9.0", version

    _, pkg, ghsa_ver = extract_ghsa({
        "vulnerabilities": [{
            "package": {"ecosystem": "npm", "name": "jsonata"},
            "vulnerable_version_range": ">= 2.0.0, < 2.2.1",
        }]
    })
    assert pkg == "jsonata" and ghsa_ver == ">= 2.0.0, < 2.2.1", (pkg, ghsa_ver)
    print("Self-test OK: NVD-Range >=2.4.0 <2.4.60, GHSA-Range >= 2.0.0, < 2.2.1")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Patch CVE poller/RAG/intel-search for GHSA parsing and affected versions"
    )
    parser.add_argument(
        "root",
        nargs="?",
        default=".",
        help="Pen Test Engine install directory (contains pentest/)",
    )
    parser.add_argument("--self-test", action="store_true", help="Run extractor checks and exit")
    args = parser.parse_args()
    if args.self_test:
        return run_self_test()

    root = Path(args.root).expanduser().resolve()
    dest, ve_status = write_version_extract(root)
    print(f"version_extract.py ({ve_status}): {dest}")

    poller = _find_poller(root)
    original = poller.read_text(encoding="utf-8")
    updated, applied = patch_poller_text(original)
    real_applied = [a for a in applied if not a.endswith(":already")]
    if updated != original:
        backup(poller)
        poller.write_text(updated, encoding="utf-8")
        print(f"Gepatcht poller.py ({', '.join(applied)}): {poller}")
    else:
        print(f"poller.py unveraendert ({', '.join(applied) or 'already'}): {poller}")

    rag = None
    cli = None
    try:
        rag = find_engine_file(root, "pentest", "intel", "local_rag.py")
    except FileNotFoundError:
        try:
            rag = find_engine_file(root, "intel", "local_rag.py")
        except FileNotFoundError as exc:
            print(f"WARN: {exc}")
    try:
        cli = find_engine_file(root, "pentest", "cli.py")
    except FileNotFoundError:
        try:
            cli = find_engine_file(root, "cli.py")
        except FileNotFoundError as exc:
            print(f"WARN: {exc}")

    if rag:
        rag_applied = patch_file(
            rag,
            [
                (OLD_RAG_DOC, NEW_RAG_DOC, "rag-doc-version"),
                (OLD_RAG_META, NEW_RAG_META, "rag-meta-version"),
                (OLD_RAG_SEARCH, NEW_RAG_SEARCH, "rag-search-version"),
            ],
            required={"rag-doc-version", "rag-meta-version", "rag-search-version"},
        )
        print(f"local_rag.py ({', '.join(rag_applied)}): {rag}")

    if cli:
        cli_applied = patch_file(
            cli,
            [(OLD_INTEL_TABLE, NEW_INTEL_TABLE, "intel-search-version-column")],
            required={"intel-search-version-column"},
        )
        print(f"cli.py ({', '.join(cli_applied)}): {cli}")

    if not real_applied and ve_status == "already" and "extract_nvd_affected" in updated:
        print("Bereits vollstaendig gepatcht.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
