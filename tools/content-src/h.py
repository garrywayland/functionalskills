# Helpers for writing long-mission content. Not shipped.
def words(t):
    n = len((t["title"]).split())
    for b in t["body"]:
        if "p" in b: n += len(b["p"].replace("**","").split())
        if "h" in b: n += len(b["h"].split())
        for k in ("box","callout"):
            if k in b: n += len(b[k].replace("**","").split())
        for k in ("ul","ol"):
            if k in b: n += sum(len(x.replace("**","").split()) for x in b[k])
    return n

L1 = ["L1"]
def mc(qid, text, label, prompt, options, answer, why, marks=1):
    return dict(id=qid, levels=L1, type="choice", text=text, label=label, marks=marks, prompt=prompt, options=options, answer=answer, why=why)
def multi(qid, text, label, prompt, options, answer, why, marks=2):
    return dict(id=qid, levels=L1, type="multi", text=text, label=label, marks=marks, prompt=prompt, options=options, answer=answer, why=why)
def op(qid, text, label, prompt, model, check, marks=1):
    return dict(id=qid, levels=L1, type="open", text=text, label=label, marks=marks, prompt=prompt, model=model, check=check)
