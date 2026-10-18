from h import words
L2 = ["L2"]
def mc(qid, text, label, prompt, options, answer, why, marks=1):
    return dict(id=qid, levels=L2, type="choice", text=text, label=label, marks=marks, prompt=prompt, options=options, answer=answer, why=why)
def multi(qid, text, label, prompt, options, answer, why, marks=2):
    return dict(id=qid, levels=L2, type="multi", text=text, label=label, marks=marks, prompt=prompt, options=options, answer=answer, why=why)
def match(qid, text, label, prompt, items, paragraphs, why, marks=2):
    return dict(id=qid, levels=L2, type="match", text=text, label=label, marks=marks, prompt=prompt, paragraphs=paragraphs, items=[dict(label=l, answer=a, **({"given": True} if g else {})) for l, a, g in items], why=why)
def op(qid, text, label, prompt, model, check, marks=1):
    return dict(id=qid, levels=L2, type="open", text=text, label=label, marks=marks, prompt=prompt, model=model, check=check)
