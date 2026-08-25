"""Compact affected_version labels from NVD CPE matches and GHSA advisories.

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
