"""Print a markdown summary (for the GitHub Actions job summary page)."""
import sys

from common import load_json

what = sys.argv[1] if len(sys.argv) > 1 else "state"
if what == "state":
    state = load_json("library/state.json", {})
    print("| item | status | note |\n| --- | --- | --- |")
    for k, v in state.items():
        print(f"| {k} | {v['status']} | {v.get('path') or v.get('url') or ''} |")
else:
    cands = load_json("candidates.json", [])
    print(f"{len(cands)} candidate(s) waiting for approval\n")
    print("| id | tier | title | url |\n| --- | --- | --- | --- |")
    for c in cands:
        print(f"| {c['id']} | {c['tier']} | {c['title']} | {c['url']} |")
