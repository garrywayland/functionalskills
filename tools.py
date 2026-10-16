"""Tool handlers for the discovery agent. Plain code, so they can be tested without a model."""
import re
import urllib.parse
from pathlib import Path

from common import OFFICIAL_HOSTS, host_ok, load_json, now, probe, save_json, slug

REQUIRED = ("id", "level", "component", "kind", "title", "url", "source_page", "evidence")


class Session:
    def __init__(self, phase, manifest_path="manifest.json", candidates_path="candidates.json",
                 official_hosts=OFFICIAL_HOSTS):
        assert phase in ("official", "unofficial")
        self.phase = phase
        self.manifest_path = Path(manifest_path)
        self.candidates_path = Path(candidates_path)
        self.official_hosts = tuple(official_hosts)
        self.verified = {}
        self.finished = None

    def hosts_for(self, url):
        if self.phase == "official":
            return self.official_hosts
        return (urllib.parse.urlparse(url).hostname or "",)


def check_url(session, url):
    """Look at a URL and report status, content type and whether it is really a PDF."""
    if not isinstance(url, str) or not url.startswith("https://"):
        return {"ok": False, "error": "https URLs only"}
    if session.phase == "official" and not host_ok(url, session.official_hosts):
        return {"ok": False, "error": "not a Pearson qualifications host; this phase is official-only"}
    res = probe(url, session.hosts_for(url))
    session.verified[url] = res
    return res


def propose_item(session, args):
    """Record a candidate for human approval. It is never added to the manifest by the agent."""
    missing = [k for k in REQUIRED if not args.get(k)]
    if missing:
        return {"ok": False, "error": "missing fields: " + ", ".join(missing)}
    url = args["url"]
    seen = session.verified.get(url)
    if not seen or not seen.get("ok"):
        return {"ok": False, "error": "call check_url on this exact URL first and it must return ok"}
    if not seen.get("is_pdf") and not (session.phase == "unofficial" and args["kind"] == "index-page"):
        return {"ok": False, "error": "URL did not return a PDF"}
    if session.phase == "unofficial" and not args.get("licence_note"):
        return {"ok": False, "error": "unofficial items need a licence_note saying what the page states"}

    manifest = load_json(session.manifest_path, {"items": []})
    candidates = load_json(session.candidates_path, [])
    known_urls = {i.get("url") for i in manifest["items"]} | {c.get("url") for c in candidates}
    known_ids = {i["id"] for i in manifest["items"] if i.get("url")} | {c["id"] for c in candidates}
    if url in known_urls:
        return {"ok": False, "error": "already in the manifest or candidates"}
    rec = {k: args[k] for k in REQUIRED}
    rec["id"] = slug(rec["id"]).lower()
    if rec["id"] in known_ids:
        rec["id"] += "-" + str(len(known_ids))
    rec.update({
        "tier": session.phase,
        "download": False if session.phase == "unofficial" else True,
        "licence_note": args.get("licence_note", "Pearson-published, free to download"),
        "proposed_at": now(),
        "probe": {k: seen.get(k) for k in ("status", "content_type", "content_length", "is_pdf")},
    })
    candidates.append(rec)
    save_json(session.candidates_path, candidates)
    return {"ok": True, "id": rec["id"]}


def finish(session, summary):
    session.finished = summary
    return {"ok": True}
