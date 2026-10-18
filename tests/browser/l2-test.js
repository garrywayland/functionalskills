const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async()=>{
  const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 1100, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nextstop:level', '"L2"'); } catch (e) {} });
  const p = await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8766/#/reading/rl2-pandas/0'); await p.waitForSelector('h1');
  console.log('start:', (await p.textContent('h1')).trim(), '| howto:', (await p.textContent('.howto li:nth-child(2)')).trim());
  await p.goto('http://127.0.0.1:8766/#/reading/rl2-pandas/0');
  console.log('numbered paragraph badges in Text A:', await p.$$eval('.source-text p.numbered .pnum', e=>e.length));
  // jump to question 4 (steps: 3 texts + q1,q2,q3 then q4 => index 6)
  await p.goto('http://127.0.0.1:8766/#/reading/rl2-pandas/6'); await p.waitForSelector('.match-list');
  console.log('step:', (await p.textContent('.step-count')).trim());
  console.log('rows:', await p.$$eval('.match-row', r=>r.length), '| disabled (given):', await p.$$eval('.match-row select:disabled', r=>r.length));
  console.log('check disabled before choosing:', await p.isDisabled('button:has-text("Check my answer")'));
  const sels = await p.$$('.match-row select:not(:disabled)');
  const rows = await p.$$eval('.match-row .match-label', l=>l.map(x=>x.textContent));
  const want = { 'Find out first': '2', 'Applying': '5', 'Gain experience': '3' }; // one deliberately wrong
  const free = await p.$$eval('.match-row', rs=>rs.map(r=>({label:r.querySelector('.match-label').textContent, disabled:r.querySelector('select').disabled})));
  const idx = free.map((r,i)=>({...r,i})).filter(r=>!r.disabled);
  for (const r of idx) await p.selectOption(`#match-q4-${r.i}`, want[r.label]);
  console.log('check enabled after choosing all:', !(await p.isDisabled('button:has-text("Check my answer")')));
  await p.click('button:has-text("Check my answer")'); await p.waitForSelector('.feedback');
  console.log('feedback:', (await p.textContent('.fb-head')).trim());
  await p.screenshot({ path: process.argv[2]+'/l2-match.png' });
  // 7(a)/7(b) labels
  await p.goto('http://127.0.0.1:8766/#/reading/rl2-pandas/12'); await p.waitForSelector('.step-count');
  console.log('step 12:', (await p.textContent('.step-count')).trim());
  await p.goto('http://127.0.0.1:8766/#/'); await p.waitForSelector('.stations');
  await p.$$eval('section.reading details.menu', ds=>ds.forEach(d=>d.open=true));
  console.log('L2 reading menus:', (await p.$$eval('section.reading .menu-sub', s=>s.map(x=>x.textContent))).join(' | '));
  console.log('errors:', errs.length?errs:'none'); await b.close();
})();
