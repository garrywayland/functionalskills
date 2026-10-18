// Save my work to a file, restore it on another device, and merge.   node tests/browser/backup-test.js
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8766/';
const problems = [], external = new Set();
const check = (c, m) => { if (!c) problems.push(m); console.log(c ? 'ok  ' : 'FAIL', m); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nextstop-backup-'));
(async () => {
  const browser = await chromium.launch();
  async function device(w) {
    const ctx = await browser.newContext({ viewport: { width: w || 1200, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push('pageerror ' + e.message));
    page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to fetch/.test(m.text())) problems.push('console ' + m.text()); });
    page.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.add(r.url()); });
    return page;
  }
  const go = async (page, hash) => { await page.goto(BASE + hash); await page.waitForSelector('h1'); await page.waitForTimeout(100); };
  const store = (page) => page.evaluate(() => { const o = {}; Object.keys(localStorage).filter(k => k.startsWith('nextstop:')).forEach(k => o[k.slice(9)] = JSON.parse(localStorage.getItem(k))); return o; });

  // ---- Device A: do some real work
  const A = await device();
  await go(A, ''); await A.evaluate(() => localStorage.clear());
  await go(A, '#/writing/w-pandas-4/write'); await A.fill('#draft', 'My draft on device A.');
  await go(A, '#/writing/w-pandas-4/plan'); await A.fill('#plan-opening', 'Plan from A');
  await go(A, '#/reading/r-pandas/1'); await A.click('fieldset.options label.option >> nth=1'); await A.click('button:has-text("Check my answer")');
  await go(A, '#/toolkit/spag/commas'); await A.click('fieldset.options label.option >> nth=0');
  await go(A, '#/learn/fix/fix-commas'); await A.fill('#fix-box', 'half way'); 
  await go(A, '#/learn/mark/mark-forum-zoo/a2'); await A.selectOption('#pick-comp', '5');
  await A.evaluate(() => localStorage.setItem('nextstop:menus', '{"x":1}'));
  await go(A, '#/progress'); await A.waitForSelector('.backup');
  const [dl] = await Promise.all([A.waitForEvent('download'), A.click('button:has-text("Save my work to a file")')]);
  const fileA = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(fileA);
  const saved = JSON.parse(fs.readFileSync(fileA, 'utf8'));
  check(saved.app === 'next-stop' && saved.version === 1 && /^\d{4}-\d\d-\d\d$/.test(saved.saved), 'the file says what it is and when it was saved');
  check(!('menus' in saved.data) && 'writing:w-pandas-4:L1' in saved.data && 'reading:r-pandas:L1' in saved.data && 'learn-fix:fix-commas' in saved.data && 'learn:a2' in saved.data, 'it holds her work and leaves out menus');
  check(!/name/i.test(Object.keys(saved.data).join()) && !/export-name/.test(JSON.stringify(saved)), 'no name in the file');
  check(/Saved to a file/.test(await A.textContent('.backup')), 'the page confirms and tells her to keep it private');

  // ---- Device B: new browser, restore
  const B = await device();
  await go(B, '#/progress'); await B.waitForSelector('.backup');
  await B.setInputFiles('#restore-file', fileA);
  await B.waitForSelector('button:has-text("Merge it in")');
  const preview = await B.textContent('.backup');
  check(/Ready to merge/.test(preview) && /new piece/.test(preview), 'a preview says what will be added before anything changes');
  await B.click('button:has-text("Merge it in")'); await B.waitForSelector('.notice:has-text("Merged")');
  const sb = await store(B);
  check(sb['writing:w-pandas-4:L1'].draft === 'My draft on device A.' && sb['writing:w-pandas-4:L1'].plan.opening === 'Plan from A', 'writing came across');
  check(sb['reading:r-pandas:L1'].answers.q1 && sb['learn:a2'].comp === 5 && sb['learn-fix:fix-commas'].items[0].mine === 'half way', 'reading, marking and fix-it came across');
  await go(B, '#/'); await B.waitForSelector('.resume-list');
  check((await B.$$eval('.resume-list a', a => a.map(x => x.textContent))).some(x => /zoo/.test(x)), 'the front page on the new device offers to pick it up');
  await go(B, '#/writing/w-pandas-4/write'); check(await B.inputValue('#draft') === 'My draft on device A.', 'the draft is in the writing box');
  await go(B, '#/progress'); await B.setInputFiles('#restore-file', fileA); await B.waitForSelector('.notice');
  check(/already on this device/.test(await B.textContent('.backup')), 'restoring the same file again says there is nothing to add');

  // ---- Merge, not replace: C has newer work on the same mission, and something A does not have
  const C = await device();
  await go(C, ''); await C.evaluate(() => {
    localStorage.setItem('nextstop:writing:w-pandas-4:L1', JSON.stringify({ draft: 'NEWER draft written on device C.', plan: {}, checks: {}, step: 'write', t: Date.now() + 100000 }));
    localStorage.setItem('nextstop:reading:r-israel:L1', JSON.stringify({ answers: { q1: { choice: 1 } }, pos: 2, t: Date.now() }));
  });
  await go(C, '#/progress'); await C.setInputFiles('#restore-file', fileA); await C.waitForSelector('button:has-text("Merge it in")'); await C.click('button:has-text("Merge it in")'); await C.waitForSelector('.notice:has-text("Merged")');
  const sc = await store(C);
  check(sc['writing:w-pandas-4:L1'].draft === 'NEWER draft written on device C.', 'newer work already here is kept, not overwritten by the older file');
  check(sc['writing:w-pandas-4:L1'].plan.opening === 'Plan from A', 'but the plan only the file had is added to it');
  check(!!sc['reading:r-israel:L1'] && !!sc['reading:r-pandas:L1'], 'work only here, and work only in the file, both survive');

  // ---- older here, newer in the file: the file wins
  const D = await device();
  await go(D, ''); await D.evaluate(() => localStorage.setItem('nextstop:writing:w-pandas-4:L1', JSON.stringify({ draft: 'Old draft', plan: {}, checks: {}, step: 'write', t: 1000 })));
  await go(D, '#/progress'); await D.setInputFiles('#restore-file', fileA); await D.waitForSelector('button:has-text("Merge it in")'); await D.click('button:has-text("Merge it in")'); await D.waitForSelector('.notice:has-text("Merged")');
  check((await store(D))['writing:w-pandas-4:L1'].draft === 'My draft on device A.', 'an older copy here is brought up to date from a newer file');

  // ---- bad files change nothing
  const E = await device();
  await go(E, '#/work'); await E.evaluate(() => localStorage.setItem('nextstop:writing:w-pandas-1:L1', JSON.stringify({ draft: 'precious', t: 5 })));
  await go(E, '#/progress'); const before = JSON.stringify(await store(E));
  for (const [name, body] of [['notes.json', 'just some words'], ['other.json', '{"app":"something-else","version":1,"data":{}}'], ['empty.json', ''], ['array.json', '[1,2,3]'], ['future.json', '{"app":"next-stop","version":42,"data":{}}']]) {
    const f = path.join(tmp, name); fs.writeFileSync(f, body);
    await E.setInputFiles('#restore-file', f); await E.waitForSelector('.backup .notice'); 
    check(/Nothing was changed|does not look like|empty|newer version/.test(await E.textContent('.backup .notice')), name + ' is refused with a plain message');
  }
  check(JSON.stringify(await store(E)) === before, 'her work is untouched after every refused file');
  const sneaky = path.join(tmp, 'sneaky.json');
  fs.writeFileSync(sneaky, JSON.stringify({ app: 'next-stop', version: 1, saved: '2026-10-18', data: { 'writing:../../x:L1': { draft: 'x' }, evil: { a: 1 }, 'reading:r-pandas:L1': 'not an object' } }));
  await E.setInputFiles('#restore-file', sneaky); await E.waitForSelector('.backup .notice, .backup .feedback');
  check(JSON.stringify(await store(E)) === before, 'unknown keys and wrong shapes in a file are ignored');

  // ---- layout and keyboard
  const P = await device(360);
  await go(P, '#/progress'); await P.waitForSelector('.backup');
  check(await P.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, 'no sideways scroll on a phone');
  await P.focus('button:has-text("Save my work to a file")'); await P.keyboard.press('Tab');
  check(await P.evaluate(() => document.activeElement.id) === 'restore-file', 'the restore button can be reached with the keyboard');

  await browser.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log('EXTERNAL:', external.size ? [...external] : 'none');
  console.log('PROBLEMS:', problems.length ? problems : 'none');
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
