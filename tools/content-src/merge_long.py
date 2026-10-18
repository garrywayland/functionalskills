import json, sys, importlib
path="/home/user/functionalskills/content/reading-long.json"
d=json.load(open(path)); ms=d["missions"]
for name in sys.argv[1:]:
    m=importlib.import_module(name).PAPER
    assert all(x["id"]!=m["id"] for x in ms), m["id"]
    at=len(ms)
    for i in range(len(ms)-1,-1,-1):
        if ms[i]["topic"]==m["topic"]: at=i+1; break
    ms.insert(at,m)
json.dump(d,open(path,"w"),indent=2,ensure_ascii=False); open(path,"a").write("\n")
print("missions now:",[x["id"] for x in ms])
