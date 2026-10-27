#!/usr/bin/env python3
"""npm audit baseline gate for mobile/specwatt-app.

`npm audit fix --force` would downgrade Expo SDK 58 to 44 (see
docs/DEPENDENCY-REVIEW.md), so the five known toolchain advisories are pinned
in a reviewed baseline. This script fails CI only when a NEW advisory appears
or a known one escalates — and never when the known ones are merely still
present.

Usage:
    npm audit --json > audit.json
    python security/check_npm_audit.py audit.json

    python security/check_npm_audit.py audit.json --update   # refresh baseline

Exit codes: 0 = no new advisories, 1 = new/escalated advisories found,
2 = usage error.
"""
import argparse
import json
import sys
from pathlib import Path

BASELINE_PATH = Path(__file__).resolve().parent / "baselines" / "npm-audit-baseline.json"


def advisory_identity(name, entry):
    """A stable identity: package name plus the underlying advisory titles."""
    titles = []
    for via in entry.get("via", []):
        if isinstance(via, dict):
            titles.append(via.get("title", ""))
        else:
            titles.append(f"range:{via}")
    return {"name": name, "titles": sorted(titles)}


def load_baseline():
    if not BASELINE_PATH.is_file():
        return {"known": {}}
    return json.loads(BASELINE_PATH.read_text(encoding="utf-8"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audit_json", help="path to `npm audit --json` output")
    parser.add_argument("--update", action="store_true",
                        help="write the current advisories as the new baseline")
    args = parser.parse_args()

    audit = json.loads(Path(args.audit_json).read_text(encoding="utf-8"))
    current = {
        name: {
            "severity": entry.get("severity", "unknown"),
            "range": entry.get("range", ""),
            "titles": advisory_identity(name, entry)["titles"],
            "fix_available": bool(entry.get("fixAvailable")),
        }
        for name, entry in audit.get("vulnerabilities", {}).items()
    }

    if args.update:
        BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
        BASELINE_PATH.write_text(
            json.dumps({
                "comment": [
                    "Reviewed baseline of accepted npm audit advisories.",
                    "Regenerate with: python security/check_npm_audit.py",
                    "<audit.json> --update  — every entry needs a documented",
                    "rationale in security/docs/findings.md.",
                ],
                "known": current,
            }, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"Baseline updated with {len(current)} advisories.")
        return 0

    baseline = load_baseline()["known"]

    new = [name for name in current if name not in baseline]
    escalated = [
        name for name in current
        if name in baseline
        and current[name]["severity"] == "critical"
        and baseline[name]["severity"] != "critical"
    ]
    resolved = [name for name in baseline if name not in current]

    if resolved:
        print("Advisories resolved since the baseline (update it):")
        for name in resolved:
            print(f"  - {name}")
    if new or escalated:
        print("NEW UNREVIEWED ADVISORIES — do not merge without triage:")
        for name in new:
            entry = current[name]
            print(f"  [new] {name} ({entry['severity']}) range={entry['range']}")
            for title in entry["titles"]:
                print(f"        {title}")
            print("        fixAvailable:", entry["fix_available"])
        for name in escalated:
            print(f"  [escalated to critical] {name}")
        print("Triage: check applicability (build-time vs runtime), record the "
              "decision in security/docs/findings.md, then refresh the "
              "baseline with --update if accepted.")
        return 1

    print(f"npm audit: no new advisories "
          f"({len(current)} known advisories remain baselined).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
