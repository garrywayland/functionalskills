# Exports every question on the site into files for reviewing, away from the site itself.
#   python3 tools/export-questions.py
# Writes to docs/question-review/: questions.md (paste into an AI chat or print), questions.csv (spreadsheet with
# reviewer columns) and (the PDF is made by printing the HTML the script can write). Original material only: no Pearson text.
import json, os, csv, html
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
C = lambda f: json.load(open(os.path.join(root, 'content', f)))
reading = C('reading.json')['missions'] + C('reading-long.json')['missions']
writing = C('writing.json'); toolkit = C('toolkit.json'); learn = C('learn.json')
out = os.path.join(root, 'docs', 'question-review'); os.makedirs(out, exist_ok=True)
L = lambda x: '/'.join(x) if isinstance(x, list) else (x or 'both')

def block_text(b):
    for k, v in b.items():
        if k == 'p': return v
        if k == 'table': return '\n'.join(['| ' + ' | '.join(v['head']) + ' |', '|' + '---|' * len(v['head'])] + ['| ' + ' | '.join(r) + ' |' for r in v['rows']])
        if k == 'h': return '**' + v + '**'
        if k in ('ul', 'ol'): return '\n'.join(('- ' if k == 'ul' else f'{i+1}. ') + x for i, x in enumerate(v))
        if k in ('box', 'callout'):
            return '> ' + ' '.join(block_text(x) if isinstance(x, dict) else x for x in (v if isinstance(v, list) else [v])).replace('\n', ' ')
    return ''

def answer_text(q):
    t = q['type']
    if t == 'choice': return f"{'ABCD'[q['answer']]}. {q['options'][q['answer']]}"
    if t == 'multi': return '; '.join(f"{'ABCDEF'[i]}. {q['options'][i]}" for i in q['answer'])
    if t == 'tfns': return q['answer']
    if t == 'factopinion': return q['answer']
    if t == 'match': return '; '.join(f"{i['label']} → paragraph {i['answer']}" + (' (given)' if i.get('given') else '') for i in q['items'])
    return q.get('model', '')

rows = []   # csv rows
md = ['# Next Stop: question review pack', '',
      'Purpose: check that the questions are fair, clear, correctly keyed and pitched at the stated level. All material is original, written to match the structure of Pearson Edexcel Functional Skills English Level 1 and 2 (it is not Pearson text).', '',
      'How to review: for each question, check (1) the answer key is right, (2) only one option is defensible, (3) the wording is clear for a 17-year-old, (4) the level (L1 or L2) is right, (5) the explanation is accurate. Reply with the question id and the problem.', '']
for m in reading:
    md += [f"## READING: {m['title']} ({m['id']}, {L(m.get('levels'))}, topic: {m['topic']})", '']
    for t in m['texts']:
        md += [f"### Text {t['id']}: {t.get('title','')} ({t.get('kind','')}, {t.get('source','')})" + (' [paragraphs numbered]' if t.get('numbered') else ''), '']
        n = 0
        for b in t['body']:
            tx = block_text(b)
            if t.get('numbered') and 'p' in b: n += 1; tx = f'[{n}] ' + tx
            md += [tx, '']
    md += ['### Questions', '']
    for q in m['questions']:
        md += [f"**{m['id']}/{q['id']}** (Text {q['text']}, {L(q.get('levels'))}, {q['type']}" + (f", {q['marks']} marks" if q.get('marks') else '') + ')', '',
               q['prompt'], '']
        if q.get('options'): md += [f"{'ABCDEF'[i]}. {o}" for i, o in enumerate(q['options'])] + ['']
        if q['type'] == 'match': md += ['Subheadings: ' + '; '.join(i['label'] for i in q['items']) + f" (paragraphs 1 to {q['paragraphs']})", '']
        md += [f"- Answer: {answer_text(q)}", f"- Why: {q.get('why') or ' / '.join(q.get('check', []))}", '']
        rows.append(['Reading', m['id'], q['id'], L(q.get('levels') or m.get('levels')), m['topic'], q['type'], q['prompt'], ' | '.join(q.get('options', [])), answer_text(q), q.get('why') or ' / '.join(q.get('check', []))])
md += ['# TOOLKIT: practice questions', '']
for kind, items in (('Writing format', toolkit['formats']), ('SPaG', toolkit['spag'])):
    for it in items:
        md += [f"## {kind}: {it['name']} ({it['id']}, {L(it.get('levels'))})", '']
        for i, q in enumerate(it['questions'], 1):
            md += [f"**{it['id']}/{i}** {q['prompt']}", ''] + [f"{'ABCD'[k]}. {o}" for k, o in enumerate(q['options'])] + ['', f"- Answer: {'ABCD'[q['answer']]}. {q['options'][q['answer']]}", f"- Why: {q['why']}", '']
            rows.append(['Toolkit', it['id'], str(i), L(it.get('levels')), it['name'], 'choice', q['prompt'], ' | '.join(q['options']), f"{'ABCD'[q['answer']]}. {q['options'][q['answer']]}", q['why']])
md += ['# WRITING TASKS', '']
for w in writing['missions']:
    md += [f"**{w['id']}** (Task {w['task']}, {w['format']}, topic {w['topic']}): {w['title']}", '', w['context'], f"Audience: {w['audience']}. Purpose: {w['purpose']}. {w['instruction']}", ''] + [f'- {b}' for b in w['bullets']] + ['', 'Indicative content: ' + ' / '.join(w['indicative']), '']
    rows.append(['Writing', w['id'], '', 'both', w['topic'], 'task ' + str(w['task']), w['context'] + ' ' + w['instruction'] + ' ' + '; '.join(w['bullets']), '', ' / '.join(w['indicative']), ''])
md += ['# LEARN: sample answers and our marks', '', 'Check that each mark is fair against the published band descriptions, and that the quoted feedback is accurate.', '']
for t in learn['mark']:
    md += [f"## {t['title']} ({t['id']}, {t['level']}, task {t['missionId']})", '']
    for s in t['samples']:
        md += [f"### {t['id']}/{s['id']}: we gave composition {s['composition']}, SPaG {s['spag']}", '', s['answer'], '', f"- Why (composition): {s['why_composition']}", f"- Why (SPaG): {s['why_spag']}", '']
        rows.append(['Learn sample', t['id'], s['id'], t['level'], t['title'], 'mark-it', s['answer'], '', f"Composition {s['composition']}, SPaG {s['spag']}", s['why_composition'] + ' ' + s['why_spag']])
for f in learn['fix']:
    md += [f"## Fix it: {f['title']} ({f['id']})", ''] + [f"{i}. {x['wrong']} → {x['fixed']} ({x['why']})" for i, x in enumerate(f['items'], 1)] + ['']
    for i, x in enumerate(f['items'], 1):
        rows.append(['Fix it', f['id'], str(i), 'both', f['skill'], 'fix-it', x['wrong'], '', x['fixed'], x['why']])
open(os.path.join(out, 'questions.md'), 'w').write('\n'.join(md))
with open(os.path.join(out, 'questions.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.writer(fh)
    w.writerow(['Section', 'Item', 'Question', 'Level', 'Topic or skill', 'Type', 'Prompt', 'Options', 'Our answer', 'Our explanation', 'Reviewer: answer correct? (Y/N)', 'Reviewer: clear and fair? (Y/N)', 'Reviewer: right level? (Y/N)', 'Reviewer notes'])
    for r in rows: w.writerow(r + ['', '', '', ''])
# simple printable html
def inline(s): return html.escape(s).replace('**', '')
body = []
for line in md:
    pass
lines = '\n'.join(md).split('\n')
for ln in lines:
    e = html.escape(ln)
    if ln.startswith('# '): body.append(f'<h1>{e[2:]}</h1>')
    elif ln.startswith('## '): body.append(f'<h2>{e[3:]}</h2>')
    elif ln.startswith('### '): body.append(f'<h3>{e[4:]}</h3>')
    elif ln.startswith('- '): body.append(f'<p class="li">{e[2:]}</p>')
    elif ln.strip(): body.append('<p>' + e.replace('**', '').replace('&gt; ', '') + '</p>')
open(os.path.join(out, 'questions.html'), 'w').write('<!doctype html><meta charset="utf-8"><title>Next Stop question review</title><style>body{font:11pt/1.4 Georgia,serif;max-width:46rem;margin:2rem auto;padding:0 1rem}h1{page-break-before:always;font-size:16pt}h1:first-of-type{page-break-before:avoid}h2{font-size:13pt;margin-top:1.5rem;border-bottom:1px solid #999}h3{font-size:11.5pt}p{margin:.25rem 0}.li{margin-left:1rem;color:#333}</style>' + '\n'.join(body))
print(len(rows), 'rows;', len(md), 'markdown lines')
