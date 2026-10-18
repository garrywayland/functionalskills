# Builds content/learn.json from the sample and fix-it source files. Run:  python3 tools/learn-src/build.py
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here)
from samples_l1 import T
from samples_l2 import T2
from fix import F
out = {"note": "Original practice material written for this site. Marks are our own judgement against the published criteria, not Pearson marks.", "mark": T + T2, "fix": F}
json.dump(out, open(os.path.join(here, '..', '..', 'content', 'learn.json'), 'w'), indent=1, ensure_ascii=False)
print('written')
