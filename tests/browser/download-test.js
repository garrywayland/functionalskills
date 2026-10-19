// Every task can be downloaded as a text file.   node tests/browser/download-test.js
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8766/';
const problems = [];
const check = (c, m) => { if (!c) problems.push(m); console.log(c ? 'ok  ' : 'FAIL', m); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push('pageerror ' + e.message));
  const go = async (h) => { await page.goto(BASE + h); await page.waitForSelector('h1'); await page.waitForTimeout(100); };
  const grab = async (selector) => { const [dl] = await Promise.all([page.waitForEvent('download'), page.click(selector)]); return { name: dl.suggestedFilename(), text: fs.readFileSync(await dl.path(), 'utf8') }; };
  await go(''); await page.evaluate(() => localStorage.clear());

  await go('#/writing/w-pandas-4/plan'); await page.fill('#plan-opening', 'My opening idea');
  await go('#/writing/w-pandas-4/write'); await page.fill('#draft', 'Hi everyone, I think it depends on the day.');
  let f = await grab('button:has-text("Download my writing")');
  check(/^next-stop-is-a-day-at-the-zoo-worth-it-\d{4}-\d\d-\d\d\.txt$/.test(f.name), 'writing file has a clear name: ' + f.name);
  check(f.text.includes('THE TASK') && f.text.includes('My opening idea') && f.text.includes('Hi everyone, I think it depends') && /MY WRITING \(\d+ words\)/.test(f.text), 'it holds the task, the plan and the writing');
  check(!/name:/i.test(f.text), 'no name in it');
  await go('#/writing/w-pandas-4/send');
  f = await grab('button:has-text("Download as a file")');
  check(f.text.includes('Hi everyone'), 'the Send step offers the same download');
  await go('#/work'); await page.click('.work-item summary');
  f = await grab('.work-item[open] button:has-text("Download")');
  check(f.text.includes('Hi everyone'), 'My work offers it too');

  // reading: done page and My work
  await page.click('label[for="level-L1"]');
  await go('#/reading/r-pandas/0');
  for (let g = 0; g < 30; g++) {
    if ((await page.textContent('h1')).trim() === 'Mission done') break;
    if (await page.$('fieldset.options')) { await page.click('fieldset.options label.option >> nth=1'); await page.click('button:has-text("Check my answer")'); }
    else if (await page.$('textarea[id^="open-"]')) { await page.fill('textarea[id^="open-"]', 'My written reading answer.'); await page.click('button:has-text("Show the model answer")'); }
    await page.locator('.actions a.btn:not(.quiet)').last().click(); await page.waitForTimeout(40);
  }
  f = await grab('button:has-text("Download my answers")');
  check(f.text.includes('MY ANSWERS') && f.text.includes('My written reading answer.') && /My answer: B\./.test(f.text) && f.text.includes('One possible answer:'), 'reading Done page downloads all answers, lettered, with the model answer for written ones');
  await go('#/work'); const items = await page.$$('.work-item summary'); for (const it of items) await it.click();
  f = await grab('.work-item[open] button:has-text("Download all my answers")');
  check(f.text.includes('My written reading answer.'), 'My work offers the reading answers too');

  // fix-it end page
  await go('#/learn/fix/fix-commas'); await page.fill('#fix-box', 'We bought bread, milk, eggs and cheese.'); await page.click('button:has-text("Check")');
  for (let i = 1; i <= 8; i++) await page.click('.fix-actions button:not([hidden])' + (i === 1 ? '' : ''), { timeout: 3000 }).catch(() => {});
  for (let g = 0; g < 10 && !(await page.$('.fix-list')); g++) { const b = await page.$('button:has-text("Next question"), button:has-text("Finish and see the answers"), button:has-text("See the answers")'); if (b) await b.click(); await page.waitForTimeout(60); }
  await page.waitForSelector('.fix-list');
  f = await grab('button:has-text("Download these answers")');
  check(f.text.includes('Sentence 1:') && f.text.includes('One way to write it:') && f.text.includes('We bought bread, milk, eggs and cheese.'), 'the fix-it answers page downloads');

  await browser.close();
  console.log('PROBLEMS:', problems.length ? problems : 'none');
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
