const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = 'http://127.0.0.1:8766/';
const OUT = process.argv[2];
const problems = [];
const external = new Set();
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.slice(0, -1) });
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push('console ' + m.text()); });
  page.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.add(r.url()); });

  // empty state
  await page.goto(BASE + '#/progress');
  console.log('empty state:', (await page.textContent('.lede')).trim());

  // finish one reading mission at L1 (first option every time)
  await page.goto(BASE + '#/reading/r-transport/0');
  for (let g = 0; g < 30; g++) {
    if ((await page.textContent('h1')).trim() === 'Mission done') break;
    if (await page.$('fieldset.options')) { await page.click('fieldset.options label.option >> nth=1'); await page.click('button:has-text("Check my answer")'); }
    else if (await page.$('textarea[id^="open-"]')) { await page.fill('textarea[id^="open-"]', 'x'); await page.click('button:has-text("Show the model answer")'); }
    await page.locator('.actions a.btn:not(.quiet)').last().click();
    await page.waitForTimeout(60);
  }
  // reload the done page: must not create a duplicate entry
  await page.reload();
  // finish a writing mission at L2
  await page.click('label[for="level-L2"]');
  await page.goto(BASE + '#/writing/w-israel-1/write');
  await page.fill('#draft', 'Dear team, I would like to ask about the trip next spring please.');
  await page.goto(BASE + '#/writing/w-israel-1/send');
  await page.click('button:has-text("Copy")');
  await page.click('button:has-text("I\'m done with this one")'); // same day, same mission: must update not duplicate

  await page.goto(BASE + '#/progress');
  const rows = await page.$$eval('.log-table tbody tr', trs => trs.map(t => t.innerText.replace(/\s+/g, ' ').trim()));
  console.log('rows:', rows.length); rows.forEach(r => console.log('  ', r));
  console.log('stats:', (await page.$$eval('.stats div', ds => ds.map(d => d.innerText.replace(/\s+/g, ' ')))).join(' | '));

  // optional extras
  await page.fill('#export-name', '=Test Name');
  await page.click('.toggle input');
  console.log('with results row:', (await page.$$eval('.log-table tbody tr td:last-child', tds => tds.map(t => t.innerText))).join(' | '));

  // CSV download
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download spreadsheet")')]);
  const path = OUT + '/' + dl.suggestedFilename();
  await dl.saveAs(path);
  console.log('csv file:', dl.suggestedFilename()); console.log(require('fs').readFileSync(path, 'utf8'));

  // Copy as text
  await page.click('button:has-text("Copy as text")');
  await page.waitForTimeout(200);
  console.log('clipboard:\n' + await page.evaluate(() => navigator.clipboard.readText()));

  // name must not be in storage
  const stored = await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
  console.log('name in localStorage:', stored.includes('Test Name'), '| keys:', await page.evaluate(() => Object.keys(localStorage).join(',')));

  // print layout
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: OUT + '/progress-print.pdf', format: 'A4' });
  const visible = await page.evaluate(() => ['.site-header', '.actions', '.print-only', '.log-table'].map(s => s + ':' + (document.querySelector(s) ? getComputedStyle(document.querySelector(s)).display : 'none')).join(' '));
  console.log('print visibility:', visible);
  await page.emulateMedia({ media: 'screen' });

  // phone
  const ph = await (await browser.newContext({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 2 })).newPage();
  await ph.goto(BASE); await ph.waitForSelector('.stations');
  await ph.evaluate(([log]) => localStorage.setItem('nextstop:log', log), [await page.evaluate(() => localStorage.getItem('nextstop:log'))]);
  await ph.goto(BASE + '#/progress'); await ph.reload(); await ph.waitForSelector('.log-table');
  console.log('phone overflow px:', await ph.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await ph.screenshot({ path: OUT + '/phone-progress.png', fullPage: true });

  // fresh record
  await page.goto(BASE + '#/progress');
  await page.click('button:has-text("Start a fresh record")'); await page.click('button:has-text("Really clear")');
  console.log('after clear:', (await page.textContent('.lede')).trim());

  await browser.close();
  console.log('EXTERNAL REQUESTS:', external.size ? [...external] : 'none');
  console.log('PROBLEMS:', problems.length ? problems : 'none');
})().catch(e => { console.error(e); process.exit(1); });
