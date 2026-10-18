const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async()=>{
  const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 1000, height: 900 } }); const p = await c.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  const B='http://127.0.0.1:8766/';
  await p.goto(B+'#/toolkit/spag/commas'); await p.waitForSelector('.practice .question-prompt');
  const first = (await p.textContent('#practice-q')).trim();
  console.log('step:', (await p.textContent('.step-count')).trim(), '| options:', await p.$$eval('.practice .option', o=>o.length));
  // answer all ten, always choosing the first option; use keyboard for the first
  await p.focus('.practice fieldset.options input'); await p.keyboard.press('Space');
  const seen=[first];
  for (let i=0;i<10;i++){
    if (i>0) await p.click('.practice fieldset.options label.option >> nth=0');
    await p.click('.practice button:has-text("Check my answer")'); await p.waitForSelector('.practice .feedback');
    if (i===0) console.log('feedback after Q1:', (await p.textContent('.practice .fb-head')).trim().slice(0,60));
    await p.click('.practice button:has-text("' + (i===9?'Finish':'Next question') + '")');
    if (i<9) { await p.waitForFunction(n=>document.querySelector('.step-count').textContent.includes('Question '+n+' of'), i+2); seen.push((await p.textContent('#practice-q')).trim()); }
  }
  console.log('distinct prompts shown:', new Set(seen).size, '| finished:', (await p.textContent('.practice h3')).trim());
  await p.click('button:has-text("Show how many matched")');
  console.log('score:', (await p.textContent('.score-box')).trim());
  // reload on finished page keeps finished state; progress and toolkit list updated
  await p.goto(B+'#/progress'); await p.waitForSelector('.log-table');
  console.log('progress rows:', await p.$$eval('.log-table tbody tr', r=>r.map(x=>x.innerText.replace(/\s+/g,' ').trim().slice(0,70))));
  console.log('stats:', (await p.$$eval('.stats div', d=>d.map(x=>x.innerText.replace(/\s+/g,' ')))).join(' | '));
  await p.goto(B+'#/toolkit'); await p.waitForSelector('.tool-list');
  console.log('practised marks:', await p.$$eval('.t-done', e=>e.map(x=>x.previousSibling.textContent)));
  // practise again gives a new order
  await p.goto(B+'#/toolkit/spag/commas'); await p.waitForSelector('.practice');
  await p.click('button:has-text("Practise again")'); await p.waitForSelector('.step-count');
  console.log('after practise again:', (await p.textContent('.step-count')).trim());
  // phone
  const ph = await (await b.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 })).newPage();
  await ph.goto(B+'#/toolkit/format/email'); await ph.waitForSelector('.practice .option');
  console.log('phone overflow px:', await ph.evaluate(()=>document.documentElement.scrollWidth-innerWidth));
  await ph.screenshot({ path: process.argv[2]+'/drill-phone.png', fullPage: true });
  await p.goto(B+'#/toolkit/format/email'); await p.waitForSelector('.practice .option');
  await p.screenshot({ path: process.argv[2]+'/drill-desktop.png', fullPage: true });
  console.log('errors:', errs.length?errs:'none'); await b.close();
})();
