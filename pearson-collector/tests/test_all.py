import json
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace as NS

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import common  # noqa: E402
import discover  # noqa: E402
import fetch  # noqa: E402
import tools  # noqa: E402

PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n"


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        p = self.path
        if p == "/robots.txt":
            return self._send(200, b"User-agent: *\nDisallow: /private/\n", "text/plain")
        if p == "/ok.pdf":
            return self._send(200, PDF, "application/pdf")
        if p == "/fake.pdf":
            return self._send(200, b"<html>login</html>", "application/pdf")
        if p == "/private/x.pdf":
            return self._send(200, PDF, "application/pdf")
        if p == "/redir.pdf":
            self.send_response(302)
            self.send_header("Location", "http://localhost:%d/ok.pdf" % self.server.server_port)
            self.end_headers()
            return
        self._send(404, b"no", "text/plain")

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        cls.base = "http://127.0.0.1:%d" % cls.srv.server_port
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()


class FetchTests(Base):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        common._robots.clear()

    def item(self, id, path, **kw):
        d = {"id": id, "level": "L1", "kind": "sam", "tier": "official", "url": self.base + path}
        d.update(kw)
        return d

    def run_fetch(self, items):
        mp = self.tmp / "m.json"
        mp.write_text(json.dumps({"items": items}))
        return fetch.run(str(mp), str(self.tmp / "lib"), delay=0, extra_hosts=("127.0.0.1",))

    def test_statuses(self):
        s = self.run_fetch([
            self.item("good", "/ok.pdf"),
            self.item("fake", "/fake.pdf"),
            self.item("missing", "/nope.pdf"),
            self.item("redir", "/redir.pdf"),
            self.item("private", "/private/x.pdf"),
            self.item("later", "/x", url=None),
            self.item("offsite", "/ok.pdf", url="https://example.com/a.pdf"),
        ])
        self.assertEqual(s["good"]["status"], "ok")
        self.assertEqual(s["fake"]["status"], "not-a-pdf")
        self.assertEqual(s["missing"]["status"], "http-404")
        self.assertTrue(s["redir"]["status"].startswith("network"))
        self.assertEqual(s["private"]["status"], "robots-disallow")
        self.assertEqual(s["later"]["status"], "to-find")
        self.assertEqual(s["offsite"]["status"], "blocked-host")
        self.assertTrue((self.tmp / "lib/official/L1/sam/good.pdf").exists())
        prov = (self.tmp / "lib/provenance.jsonl").read_text().splitlines()
        self.assertEqual(len(prov), 1)
        self.assertEqual(json.loads(prov[0])["sha256"], common.sha256(PDF))

    def test_idempotent_and_unofficial_link_only(self):
        items = [self.item("good", "/ok.pdf"),
                 self.item("mirror", "/ok.pdf", tier="unofficial", download=False)]
        self.run_fetch(items)
        mp = self.tmp / "m.json"
        s = fetch.run(str(mp), str(self.tmp / "lib"), delay=0, tiers=("official", "unofficial"),
                      extra_hosts=("127.0.0.1",))
        self.assertEqual(s["good"]["status"], "unchanged")
        self.assertEqual(s["mirror"]["status"], "link-only")
        self.assertFalse((self.tmp / "lib/unofficial").exists())


class ToolTests(Base):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / "m.json").write_text(json.dumps({"items": [
            {"id": "sam-l1", "level": "L1", "component": "both", "kind": "sam", "title": "L1 SAM",
             "url": None, "tier": "official"}]}))
        self.s = tools.Session("official", self.tmp / "m.json", self.tmp / "c.json", official_hosts=("127.0.0.1",))

    def args(self, **kw):
        a = {"id": "sam-l1", "level": "L1", "component": "both", "kind": "sam", "title": "t",
             "url": self.base + "/ok.pdf", "source_page": "p", "evidence": "e"}
        a.update(kw)
        return a

    def test_must_check_first(self):
        self.assertFalse(tools.propose_item(self.s, self.args())["ok"])

    def test_checked_url_is_proposed_once(self):
        # the offline test server is http, which check_url refuses: use the probe directly
        self.s.verified[self.base + "/ok.pdf"] = common.probe(self.base + "/ok.pdf", ("127.0.0.1",))
        self.assertTrue(tools.propose_item(self.s, self.args())["ok"])
        self.assertFalse(tools.propose_item(self.s, self.args())["ok"])
        cands = json.loads((self.tmp / "c.json").read_text())
        self.assertEqual(cands[0]["tier"], "official")
        self.assertEqual(cands[0]["id"], "sam-l1")  # keeps the placeholder id so approve.py fills it

    def test_rejects_non_pdf_and_other_hosts(self):
        self.s.verified[self.base + "/fake.pdf"] = common.probe(self.base + "/fake.pdf", ("127.0.0.1",))
        self.assertFalse(tools.propose_item(self.s, self.args(url=self.base + "/fake.pdf"))["ok"])
        self.assertFalse(tools.check_url(self.s, "https://example.com/x.pdf")["ok"])
        self.assertFalse(tools.check_url(self.s, "http://127.0.0.1/x.pdf")["ok"])

    def test_unofficial_needs_licence_and_never_auto_downloads(self):
        s = tools.Session("unofficial", self.tmp / "m.json", self.tmp / "c.json")
        s.verified[self.base + "/ok.pdf"] = common.probe(self.base + "/ok.pdf", ("127.0.0.1",))
        self.assertFalse(tools.propose_item(s, self.args(id="x1"))["ok"])
        self.assertTrue(tools.propose_item(s, self.args(id="x1", licence_note="none stated"))["ok"])
        self.assertFalse(json.loads((self.tmp / "c.json").read_text())[0]["download"])


class ApproveTests(unittest.TestCase):
    def test_non_interactive_fills_placeholder_and_blocks_download_by_default(self):
        import approve
        manifest = {"items": [{"id": "sam-l1", "tier": "official", "url": None, "level": "L1"}]}
        cands = [
            {"id": "sam-l1", "tier": "official", "url": "https://qualifications.pearson.com/a.pdf", "title": "t", "probe": {}},
            {"id": "mirror", "tier": "unofficial", "url": "https://example.org/b.pdf", "title": "m", "licence_note": "n", "download": False},
        ]
        keep, added = approve.apply_ids(manifest, cands, ["sam-l1", "mirror"])
        self.assertEqual(added, ["sam-l1", "mirror"])
        self.assertEqual(keep, [])
        self.assertEqual(manifest["items"][0]["url"], "https://qualifications.pearson.com/a.pdf")
        self.assertFalse(manifest["items"][1]["download"])
        self.assertEqual(len(manifest["items"]), 2)


class FakeClient:
    """Scripted stand-in for the API so the loop logic can be tested offline."""

    def __init__(self, steps):
        self.steps = list(steps)
        self.messages = self

    def create(self, **kw):
        content = [NS(type="tool_use", id="t%d" % len(self.steps), name=n, input=i) for n, i in self.steps.pop(0)]
        return NS(content=content, stop_reason="tool_use", usage=NS(input_tokens=10, output_tokens=5))


class AgentLoopTests(ToolTests):
    def test_loop_stops_on_finish(self):
        self.s.verified[self.base + "/ok.pdf"] = common.probe(self.base + "/ok.pdf", ("127.0.0.1",))
        client = FakeClient([
            [("propose_item", self.args())],
            [("finish", {"summary": "done"})],
            [("finish", {"summary": "should not be reached"})],
        ])
        out = discover.run_agent(client, self.s, max_turns=10)
        self.assertEqual(out, "done")
        self.assertEqual(len(client.steps), 1)

    def test_loop_respects_token_budget(self):
        client = FakeClient([[("check_url", {"url": "https://example.com"})]] * 5)
        discover.run_agent(client, self.s, max_turns=10, token_budget=20)
        self.assertGreater(len(client.steps), 0)


if __name__ == "__main__":
    unittest.main()
