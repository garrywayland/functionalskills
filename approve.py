"""Human approval step: move candidates into the manifest.

Interactive:      python approve.py --phase official
Non-interactive:  python approve.py --phase official --ids sam-l1,guidance-l1     (or --ids all)
                  add --download to mark approved unofficial items as downloadable
"""
import argparse
import sys

from common import load_json, save_json

DROP = ("probe", "proposed_at")


def merge(manifest, cand):
    """Fill a placeholder with the same id if there is one, else append."""
    c = {k: v for k, v in cand.items() if k not in DROP}
    match = next((i for i in manifest["items"] if i["id"] == c["id"] and not i.get("url")), None)
    if match:
        match.update(c)
    else:
        manifest["items"].append(c)


def apply_ids(manifest, cands, ids, phase=None, download=False):
    chosen = None if ids == ["all"] else set(ids)
    keep, added = [], []
    for c in cands:
        if (phase and c["tier"] != phase) or (chosen is not None and c["id"] not in chosen):
            keep.append(c)
            continue
        if c["tier"] == "unofficial":
            c["download"] = bool(download)
        merge(manifest, c)
        added.append(c["id"])
    return keep, added


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", default="manifest.json")
    ap.add_argument("--candidates", default="candidates.json")
    ap.add_argument("--phase", choices=["official", "unofficial"], default=None)
    ap.add_argument("--ids", default=None, help="comma-separated candidate ids, or 'all'")
    ap.add_argument("--download", action="store_true", help="unofficial only: allow download")
    a = ap.parse_args(argv)
    manifest = load_json(a.manifest, {"items": []})
    cands = load_json(a.candidates, [])

    if a.ids:
        ids = [i.strip() for i in a.ids.split(",") if i.strip()]
        keep, added = apply_ids(manifest, cands, ids, a.phase, a.download)
        print("Approved:", ", ".join(added) or "(none matched)")
    else:
        keep = []
        for c in cands:
            if a.phase and c["tier"] != a.phase:
                keep.append(c)
                continue
            print(f"\n[{c['tier']}] {c['id']}: {c['title']}\n  {c['url']}\n  evidence: {c['evidence']}")
            if c["tier"] == "unofficial":
                print(f"  licence note: {c['licence_note']}")
            if input("  add to manifest? [y/N] ").strip().lower() != "y":
                keep.append(c)
                continue
            if c["tier"] == "unofficial":
                c["download"] = input("  download the file (you have read the licence note)? [y/N] ").strip().lower() == "y"
            merge(manifest, c)
    save_json(a.manifest, manifest)
    save_json(a.candidates, keep)
    print(f"Manifest has {len(manifest['items'])} items; {len(keep)} candidates left.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
