import re, sys, importlib
def norm(t): return re.sub(r'\s+',' ',t.replace('“','"').replace('”','"').replace('’',"'").replace('‘',"'")).lower()
bad=0
for name in sys.argv[1:]:
    P=importlib.import_module(name).PAPER
    texts={}
    for t in P['texts']:
        parts=[t['title']]
        for b in t['body']:
            for k in ('p','h','box','callout'):
                if k in b: parts.append(b[k].replace('**',''))
            for k in ('ul','ol'):
                if k in b: parts+= [x.replace('**','') for x in b[k]]
        texts[t['id']]=norm(' '.join(parts))
    alltext=' '.join(texts.values())
    for q in P['questions']:
        strings=[]
        if q['type']=='open': strings.append(q['model'])
        if q['type'] in ('choice','multi'): strings += q['options']
        if q.get('why'): strings.append(q['why'])
        for s in strings:
            for m in re.finditer(r'"([^"]{3,})"',s):
                for piece in re.split(r'\.\.\.|…',m.group(1)):
                    piece=norm(piece).strip(' .,;:!?')
                    if len(piece)<4: continue
                    # allow trailing punctuation differences
                    if piece not in alltext:
                        bad+=1; print(f'{P["id"]} {q["id"]}: quote not found in texts -> "{piece}"')
print('quotes not found:',bad)
