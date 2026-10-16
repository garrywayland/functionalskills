"""Download everything in manifest.json that is safe to download, and log where it came from.

Plain code, no model. Official items are fetched from Pearson hosts only. Unofficial items are
fetched only if the item has "download": true, which you set by hand after reading its licence note.
"""
import argparse
import sys
import time
import urllib.parse
from pathlib import Path

from common import (OFFICIAL_HOSTS, append_jsonl, get, host_ok, library_path, load_json,
                    now, robots_allows, save_json, sha256)


def run(manifest_path="manifest.json", out="library", delay=2.0, tiers=("official",),
        dry_run=False, extra_hosts=()):
    manifest = load_json(manifest_path, {"items": []})
    state_path = Path(out) / "state.json"
    state = load_json(state_path, {})
    official = tuple(OFFICIAL_HOSTS) + tuple(extra_hosts)
    first_request = True

    for item in manifest["items"]:
        iid = item["id"]
        tier = item.get("tier", "official")
        item["tier"] = tier
        url = item.get("url")

        def record(status, **extra):
            state[iid] = {"status": status, "checked_at": now(), "url": url, **extra}
            print(f"{status:<14} {iid}")

        if tier not in tiers:
            continue
        if not url:
            record("to-find")
            continue
        if tier == "official":
            if not host_ok(url, official):
                record("blocked-host")
                continue
            allowed = official
        else:
            if item.get("download") is not True:
                record("link-only")
                continue
            allowed = (urllib.parse.urlparse(url).hostname,)
        if dry_run:
            record("would-fetch")
            continue

        if not first_request:
            time.sleep(delay)
        first_request = False

        if not robots_allows(url, allowed):
            record("robots-disallow")
            continue
        res = get(url, allowed)
        if res.get("error"):
            record(res["error"], http_status=res.get("status"))
            continue
        body = res["body"]
        if not body.startswith(b"%PDF-"):
            record("not-a-pdf", http_status=res["status"], content_type=res.get("content_type"))
            continue

        digest = sha256(body)
        dest = library_path(out, item)
        if dest.exists() and sha256(dest.read_bytes()) == digest:
            record("unchanged", sha256=digest, path=str(dest))
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(body)
        record("ok", sha256=digest, bytes=len(body), path=str(dest))
        append_jsonl(Path(out) / "provenance.jsonl", {
            "id": iid, "url": url, "tier": tier, "retrieved_at": now(),
            "sha256": digest, "bytes": len(body), "path": str(dest),
            "licence_note": item.get("licence_note", "Pearson-published, free to download"),
            "evidence": item.get("evidence", ""),
        })

    save_json(state_path, state)
    return state


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest", default="manifest.json")
    ap.add_argument("--out", default="library")
    ap.add_argument("--delay", type=float, default=2.0, help="seconds between requests")
    ap.add_argument("--tier", choices=["official", "unofficial", "all"], default="official")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    tiers = ("official", "unofficial") if a.tier == "all" else (a.tier,)
    state = run(a.manifest, a.out, a.delay, tiers, a.dry_run)
    ok = sum(1 for s in state.values() if s["status"] in ("ok", "unchanged"))
    print(f"\n{ok} files in library, {len(state)} items checked. See {a.out}/state.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
