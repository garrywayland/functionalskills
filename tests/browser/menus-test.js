const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async()=>{
  const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 1100, height: 900 } }); const p = await c.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://127.0.0.1:8766/'); await p.waitForSelector('.stations');
  const n = await p.$$eval('details.menu', d=>d.length), open0 = await p.$$eval('details.menu[open]', d=>d.length);
  console.log('menus:', n, '| open at start:', open0);
  console.log('summaries:', (await p.$$eval('details.menu summary', s=>s.map(x=>x.innerText.replace(/\s+/g,' ')))).join(' || '));
  // open the first reading menu with the keyboard
  await p.focus('details.menu summary'); await p.keyboard.press('Enter');
  console.log('open after Enter:', await p.$$eval('details.menu[open]', d=>d.length), '| sub-groups in first menu:', await p.$$eval('details.menu[open] .menu-sub', s=>s.map(x=>x.textContent)));
  console.log('links visible in first menu:', await p.$$eval('details.menu[open] .stops a', a=>a.length));
  await p.reload(); await p.waitForSelector('.stations');
  console.log('still open after reload:', await p.$$eval('details.menu[open]', d=>d.length));
  // open all writing menus and count missions at both levels
  for (const lvl of ['L1','L2']) {
    await p.click(`label[for="level-${lvl}"]`);
    await p.$$eval('section.writing details.menu', ds=>ds.forEach(d=>d.open=true));
    console.log(lvl, 'writing stops:', await p.$$eval('section.writing .stops a', a=>a.length), '| first meta:', await p.$eval('section.writing .stop-meta', e=>e.textContent));
  }
  await p.click('label[for="level-L1"]');
  await p.$$eval('details.menu', ds=>ds.forEach(d=>d.open=true));
  await p.screenshot({ path: process.argv[2]+'/menus-open.png', fullPage: true });
  // phone
  const ph = await (await b.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 })).newPage();
  await ph.goto('http://127.0.0.1:8766/'); await ph.waitForSelector('.stations');
  await ph.click('section.writing details.menu summary');
  console.log('phone overflow px:', await ph.evaluate(()=>document.documentElement.scrollWidth-innerWidth));
  await ph.screenshot({ path: process.argv[2]+'/menus-phone.png', fullPage: true });
  console.log('errors:', errs.length?errs:'none'); await b.close();
})();
