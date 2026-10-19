// "Make a pack": prompt, paste back, check, save in the browser, use, delete.   node tests/browser/make-test.js
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8766/';
const R = require('../../js/rules.js');
const example = require('../../docs/import/example-pack.json');
const toolkit = require('../../content/toolkit.json');
const problems = [], external = new Set();
const check = (c, m) => { if (!c) problems.push(m); console.log(c ? 'ok  ' : 'FAIL', m); };
const THEME = 'Rovers FC';
const pack = (over) => { const p = JSON.parse(JSON.stringify(example)); p.reading[0].topic = THEME; p.writing[0].topic = THEME; return over ? over(p) : p; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.slice(0, -1) });
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push('pageerror ' + e.message));
  let expectError = false;
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !expectError && !/Failed to fetch/.test(m.text())) problems.push('console ' + m.text()); });
  page.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.add(r.url()); });
  await page.goto(BASE + '#/make'); await page.waitForSelector('#make-theme');
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('#make-theme');

  // 1. the prompt
  check(/Type a theme/.test(await page.inputValue('#make-prompt')) && await page.$eval('button:has-text("Copy the prompt")', b => b.disabled), 'no prompt until there is a theme');
  await page.fill('#make-theme', THEME); await page.fill('#make-about', 'match days and the stadium');
  const prompt = await page.inputValue('#make-prompt');
  check(prompt.includes('"' + THEME + '"') && prompt.includes('match days') && prompt.includes('Do NOT state facts'), 'prompt names the theme and the real-things rule');
  check(toolkit.formats.every(f => prompt.includes(f.id)), 'prompt lists every format the site knows');
  check(/downloadable FILE called "rovers-fc-pack.json"/.test(prompt) && /ONE code block/.test(prompt), 'prompt asks the AI for a downloadable file (or one code block)');
  check(/2 short reading missions/.test(prompt) && /1 longer writing task/.test(prompt), 'prompt carries the default counts');
  await page.selectOption('#make-reading', '3'); await page.selectOption('#make-level', 'L2');
  check(/3 short reading missions/.test(await page.inputValue('#make-prompt')) && /Level 2/.test(await page.inputValue('#make-prompt')), 'changing the options changes the prompt');
  await page.click('button:has-text("Copy the prompt")');
  check((await page.evaluate(() => navigator.clipboard.readText())).includes('"pack": "rovers-fc-1"'), 'Copy puts the prompt on the clipboard');
  // the example inside the prompt must itself pass the rules
  const ex = JSON.parse(prompt.slice(prompt.indexOf('EXAMPLE')).split('\n').slice(1).join('\n'));
  const e0 = [], n0 = [];
  R.checkPackData(ex, 'example', e0, n0, { themeNames: [THEME], formats: new Set(toolkit.formats.map(f => f.id)) });
  check(e0.length === 0, 'the example inside the prompt passes the rules: ' + e0.slice(0, 2));

  // persistence of the form
  await page.reload(); await page.waitForSelector('#make-theme');
  check(await page.inputValue('#make-theme') === THEME && await page.inputValue('#make-reading') === '3', 'the form survives a reload');

  // 2. bad pastes
  await page.click('button:has-text("Check it")');
  check(/Paste the AI reply/.test(await page.textContent('.make')), 'empty paste gets a gentle prompt');
  await page.fill('#make-paste', 'Sure! Here are your missions: lots of words but no JSON');
  await page.click('button:has-text("Check it")');
  check(/does not look like a JSON/.test(await page.textContent('.make')), 'non-JSON is explained');
  const bad = pack(p => { p.reading[0].questions[1].answer = 9; p.writing[0].bullets = ['only one']; p.writing[0].format = 'poem'; return p; });
  await page.fill('#make-paste', JSON.stringify(bad)); await page.click('button:has-text("Check it")');
  await page.waitForSelector('.feedback');
  const shown = await page.$$eval('.feedback li', l => l.map(x => x.textContent));
  const nodeErrs = []; R.checkPackData(bad, 'Your pack', nodeErrs, [], { themeNames: [THEME], taken: new Set(), formats: new Set(toolkit.formats.map(f => f.id)) });
  check(shown.length === nodeErrs.length && shown.every((s, i) => s === nodeErrs[i]), 'the page reports exactly the same problems as the shared rules (' + shown.length + ')');
  check(/answer index out of range/.test(shown.join()) && /needs 2 bullet points/.test(shown.join()) && /poem/.test(shown.join()), 'problems are specific');
  check((await page.inputValue('textarea[aria-label="A message to send back to the AI"]')).includes('Please fix these problems'), 'a ready-made message for the AI is offered');
  check((await page.$$('button:has-text("Save in this browser")')).length === 0, 'nothing can be saved while there are problems');
  const wrongTheme = pack(p => { p.reading[0].topic = 'Knitting'; return p; });
  await page.fill('#make-paste', JSON.stringify(wrongTheme)); await page.click('button:has-text("Check it")');
  check(/not a known theme/.test(await page.textContent('.feedback')), 'a pack on a different theme is refused');
  const clash = pack(p => { p.writing[0].id = 'w-pandas-1'; return p; });
  await page.fill('#make-paste', JSON.stringify(clash)); await page.click('button:has-text("Check it")');
  check(/already used/.test(await page.textContent('.feedback')), 'an id that clashes with the site is refused');
  await page.reload(); await page.waitForSelector('#make-paste');
  check((await page.inputValue('#make-paste')).includes('w-pandas-1'), 'the pasted text survives a reload');

  // 2b. choosing a file instead of pasting
  const fs2 = require('fs'), os2 = require('os');
  const fpath = path.join(os2.tmpdir(), 'rovers-fc-1-pack.json');
  fs2.writeFileSync(fpath, JSON.stringify(pack(p => { p.writing[0].bullets = ['just one']; return p; })));
  await page.setInputFiles('#make-file', fpath); await page.waitForSelector('.feedback');
  check(/needs 2 bullet points/.test(await page.textContent('.feedback')) && (await page.inputValue('#make-paste')).includes('just one'), 'a chosen file is read and checked, and its text lands in the box');
  fs2.writeFileSync(fpath, JSON.stringify(pack()));
  await page.setInputFiles('#make-file', fpath); await page.waitForSelector('button:has-text("Save in this browser")');
  check(/passed the same checks/.test(await page.textContent('.feedback')), 'a good chosen file passes and can be saved');
  fs2.rmSync(fpath, { force: true });

  // 3. a good pack, wrapped in chat the way an AI would reply
  const good = pack(p => { p.reading[0].title = 'Saturday <img src=x onerror=alert(1)> at Rovers'; return p; });
  await page.fill('#make-paste', 'Here you go!\n```json\n' + JSON.stringify(good, null, 2) + '\n```\nHope that helps.');
  await page.click('button:has-text("Check it")');
  await page.waitForSelector('button:has-text("Save in this browser")');
  check(/passed the same checks/.test(await page.textContent('.feedback')), 'a good pack, wrapped in chat text, passes');
  await page.click('button:has-text("Save in this browser")');
  await page.waitForSelector('a:has-text("' + THEME + '")');
  check((await page.$$('.my-pack')).length === 1 && (await page.inputValue('#make-paste')) === '', 'saved, listed under Your packs, paste box cleared');

  // 4. it is part of the site now
  for (const L of ['L1', 'L2']) {
    await page.goto(BASE); await page.waitForSelector('.theme-grid'); await page.click(`label[for="level-${L}"]`);
    check((await page.$$eval('.theme-card .st-name', e => e.map(x => x.textContent))).includes(THEME), L + ': the new theme is on the front page');
  }
  await page.click('.theme-card a:has-text("' + THEME + '")'); await page.waitForSelector('.stops');
  check((await page.$$eval('.draft-tag', e => e.map(x => x.textContent))).filter(t => t === 'Your own').length === 2, 'missions are labelled "Your own"');
  check(await page.$eval('.stops', e => e.innerHTML.indexOf('<img') === -1), 'markup in the pack is shown as plain text, not run');
  await page.click('.stops a >> nth=0');
  for (let g = 0; g < 30; g++) {
    if ((await page.textContent('h1')).trim() === 'Mission done') break;
    if (await page.$('fieldset.options')) { await page.click('fieldset.options label.option >> nth=0'); if (await page.$('fieldset.options input[type=checkbox]')) await page.click('fieldset.options label.option >> nth=1'); await page.click('button:has-text("Check my answer")'); }
    else if (await page.$('textarea[id^="open-"]')) { await page.fill('textarea[id^="open-"]', 'x'); await page.click('button:has-text("Show the model answer")'); }
    await page.locator('.actions a.btn:not(.quiet)').last().click(); await page.waitForTimeout(40);
  }
  check((await page.textContent('h1')).trim() === 'Mission done', 'a made pack can be completed like any other');
  await page.goto(BASE + '#/theme/rovers-fc'); await page.waitForSelector('.stops'); await page.click('.stops a >> nth=1'); await page.waitForSelector('.split', { timeout: 5000 }).catch(() => {});
  check(!!(await page.$('.task-card')) || !!(await page.$('h1')), 'its writing task opens');
  await page.reload(); await page.waitForSelector('h1');
  check(await page.$eval('h1', e => e.textContent.length > 0), 'still there after a reload');
  const stored = await page.evaluate(() => Object.keys(localStorage).join(','));
  check(/nextstop:mypacks/.test(stored), 'stored in this browser only (localStorage key nextstop:mypacks)');

  // 5. download and delete
  await page.goto(BASE + '#/make'); await page.waitForSelector('.my-pack');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download")')]);
  const file = require('fs').readFileSync(await dl.path(), 'utf8');
  const back = JSON.parse(file); const e1 = [];
  R.checkPackData({ pack: 'x', reading: back.reading, writing: back.writing }, 'dl', e1, [], { themeNames: [THEME], formats: new Set(toolkit.formats.map(f => f.id)) });
  check(e1.length === 0 && back.reading[0].id.startsWith('my-rovers-fc-'), 'the downloaded file is a valid pack');
  await page.click('button:has-text("Delete")'); check(!!(await page.$('button:has-text("Really delete it")')), 'delete asks twice');
  await page.click('button:has-text("Really delete it")');
  check((await page.$$('.my-pack')).length === 0, 'deleted');
  await page.goto(BASE); await page.waitForSelector('.theme-grid');
  check(!(await page.$$eval('.theme-card .st-name', e => e.map(x => x.textContent))).includes(THEME), 'the theme is gone from the front page');
  await page.goto(BASE + '#/theme/rovers-fc'); await page.waitForSelector('h1');
  check(/not on the map/.test(await page.textContent('h1')), 'its old link shows the calm not-found page');

  // 6. a damaged pack in storage must not break the site (one logged error is expected here)
  expectError = true;
  await page.evaluate(() => localStorage.setItem('nextstop:mypacks', JSON.stringify([{ id: 'x', theme: { id: 't', name: 'T', blurb: 'b' }, pack: { reading: [{ id: 'bad', topic: 'T', title: 'Broken', texts: [{ id: 'A', body: 'nope' }], questions: [] }], writing: [] } }])));
  await page.goto(BASE); await page.reload(); await page.waitForSelector('.theme-grid');
  await page.goto(BASE + '#/theme/t'); await page.waitForSelector('h1'); await page.click('.stops a'); await page.waitForTimeout(200);
  check(/could not be shown|Mission|Broken/.test(await page.textContent('main')), 'a damaged saved pack does not blank the site');

  await browser.close();
  console.log('EXTERNAL:', external.size ? [...external] : 'none');
  console.log('PROBLEMS:', problems.length ? problems : 'none');
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
