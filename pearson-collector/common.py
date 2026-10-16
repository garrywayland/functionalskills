"""Shared helpers: guarded HTTP, PDF checks, robots.txt, manifest and provenance files."""
import hashlib
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import datetime, timezone
from pathlib import Path

OFFICIAL_HOSTS = ("qualifications.pearson.com", "secure.qualifications.pearson.com")
USER_AGENT = os.environ.get("COLLECTOR_UA", "pearson-collector/0.1 (personal study use)")
MAX_BYTES = 60 * 1024 * 1024
TIMEOUT = 30


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def host_ok(url, allowed):
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    return any(host == h or host.endswith("." + h) for h in allowed)


class _Guard(urllib.request.HTTPRedirectHandler):
    """Refuse redirects that leave the allowed hosts."""

    def __init__(self, allowed):
        self.allowed = allowed

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not host_ok(newurl, self.allowed):
            raise urllib.error.URLError("redirect to a host that is not allowed: " + newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _open(url, allowed):
    opener = urllib.request.build_opener(_Guard(allowed))
    req = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "application/pdf,*/*;q=0.5"}
    )
    return opener.open(req, timeout=TIMEOUT)


def get(url, allowed, limit=MAX_BYTES):
    """Fetch a URL. Returns a dict with status, content_type, body (or error)."""
    try:
        with _open(url, allowed) as r:
            body = r.read(limit + 1)
            if len(body) > limit:
                return {"status": r.status, "error": "too-large"}
            return {"status": r.status, "content_type": r.headers.get("Content-Type", ""), "body": body}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "error": f"http-{e.code}"}
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return {"status": None, "error": f"network: {e}"}


def probe(url, allowed):
    """Look at the first KB of a URL without downloading the whole file."""
    try:
        with _open(url, allowed) as r:
            head = r.read(1024)
            return {
                "ok": r.status == 200,
                "status": r.status,
                "content_type": r.headers.get("Content-Type", ""),
                "content_length": r.headers.get("Content-Length"),
                "is_pdf": head.startswith(b"%PDF-"),
            }
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "is_pdf": False, "error": f"http-{e.code}"}
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return {"ok": False, "status": None, "is_pdf": False, "error": f"network: {e}"}


_robots = {}


def robots_allows(url, allowed):
    p = urllib.parse.urlparse(url)
    base = f"{p.scheme}://{p.netloc}"
    if base not in _robots:
        res = get(base + "/robots.txt", allowed, limit=512 * 1024)
        if res.get("status") == 200 and res.get("body") is not None:
            rp = urllib.robotparser.RobotFileParser()
            rp.parse(res["body"].decode("utf-8", "replace").splitlines())
            _robots[base] = rp
        elif res.get("status") and 400 <= res["status"] < 500:
            _robots[base] = None  # no robots.txt: nothing is disallowed
        else:
            _robots[base] = False  # could not tell: be cautious
    rp = _robots[base]
    if rp is None:
        return True
    if rp is False:
        return False
    return rp.can_fetch(USER_AGENT, url)


def slug(s):
    return re.sub(r"[^A-Za-z0-9]+", "-", str(s)).strip("-") or "na"


def library_path(out, item):
    return (
        Path(out)
        / item.get("tier", "official")
        / slug(item.get("level", "na"))
        / slug(item.get("kind", "other"))
        / (slug(item["id"]) + ".pdf")
    )


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def load_json(path, default):
    p = Path(path)
    return json.loads(p.read_text()) if p.exists() else default


def save_json(path, data):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def append_jsonl(path, record):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
