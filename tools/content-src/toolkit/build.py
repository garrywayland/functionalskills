import json, sys
sys.path.insert(0,'/tmp/claude-0/-home-user/af79a3c6-d8e5-5772-982f-4a76cf669aa8/scratchpad/toolkit')
import formats, spag
p='/home/user/functionalskills/content/toolkit.json'
t=json.load(open(p))
POS=[1,3,0,2,3,1,0,2,3,0]
items=[(x,'format') for x in t['formats']]+[(x,'spag') for x in t['spag']]
extra={**formats.Q, **spag.Q}
for n,(item,kind) in enumerate(items):
    first=item.get('practice') or (item.get('questions') or [None])[0]
    qs=[]
    if first:
        correct=first['options'][first['answer']]
        wrongs=[o for i,o in enumerate(first['options']) if i!=first['answer']]
        qs.append((first['prompt'],correct,wrongs,first['why']))
    qs += extra[item['id']]
    assert len(qs)==10,(item['id'],len(qs))
    out=[]; seen=set()
    for k,(prompt,correct,wrongs,why) in enumerate(qs):
        assert len(wrongs)==3,(item['id'],prompt)
        assert prompt not in seen,(item['id'],prompt); seen.add(prompt)
        opts=wrongs[:]; pos=POS[(k+n)%10]
        opts.insert(pos,correct)
        assert len(set(opts))==4,(item['id'],prompt)
        out.append(dict(prompt=prompt,options=opts,answer=pos,why=why))
    item['questions']=out
    item.pop('practice',None)
json.dump(t,open(p,'w'),indent=2,ensure_ascii=False); open(p,'a').write("\n")
print('built',sum(len(i['questions']) for i,_ in items),'questions for',len(items),'skills')
