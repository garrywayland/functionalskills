// Does everything she types or picks survive a reload (and going away and coming back)?
//   node tests/browser/persist-test.js      (site served at BASE)
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8766/';
const problems = [];
const check = (c, m) => { if (!c) problems.push(m); console.log(c ? 'ok  ' : 'FAIL', m); };
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on('pageerror', e => problems.push('pageerror ' + e.message));
  const go = async (hash) => { await page.goto(BASE + hash); await page.waitForSelector('h1'); };
  const reload = async () => { await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(150); };
  await go(''); await page.evaluate(() => localStorage.clear());

  // Reading: closed, true/false, multi, match, open (long L2 mission has all kinds)
  await page.click('label[for="level-L2"]');
  const m = require('../../content/reading-long.json').missions.find(x => x.id === 'rl2-pandas') || require('../../content/reading-long.json').missions.find(x => (x.levels || []).includes('L2'));
  const kinds = {};
  m.questions.forEach((q, i) => { if (!kinds[q.type]) kinds[q.type] = i; });
  console.log('L2 mission', m.id, 'question kinds at steps', JSON.stringify(kinds));
  const steps = {}; // find the step number of each question by walking
  await go('#/reading/' + m.id + '/0');
  for (let s = 0; s < 40; s++) {
    const url = page.url().split('#')[1];
    if (await page.$('fieldset.options input[type=radio]')) {
      await page.click('fieldset.options label.option >> nth=1'); await page.reload(); await page.waitForSelector('h1');
      const checked = await page.$eval('fieldset.options input[type=radio]:checked', e => e.value).catch(() => null);
      check(checked === '1', 'choice answer survives reload at ' + url);
      await page.click('button:has-text("Check my answer")'); await page.reload(); await page.waitForSelector('h1');
      check(!!(await page.$('.feedback')), 'checked state and feedback survive reload at ' + url);
      steps.choice = true;
    } else if (await page.$('fieldset.options input[type=checkbox]')) {
      await page.click('fieldset.options label.option >> nth=0'); await page.click('fieldset.options label.option >> nth=1'); await page.reload(); await page.waitForSelector('h1');
      check((await page.$$('fieldset.options input:checked')).length === 2, 'multi-tick answers survive reload at ' + url); steps.multi = true;
      await page.click('button:has-text("Check my answer")');
    } else if (await page.$('select[id^="match-"]')) {
      const sel = await page.$$('select[id^="match-"]:not([disabled])');
      await sel[0].selectOption('2'); await page.reload(); await page.waitForSelector('h1');
      check(await page.$eval('select[id^="match-"]:not([disabled])', e => e.value) === '2', 'match choice survives reload at ' + url); steps.match = true;
      for (const s2 of await page.$$('select[id^="match-"]:not([disabled])')) await s2.selectOption('1');
      await page.click('button:has-text("Check my answer")');
    } else if (await page.$('textarea[id^="open-"]')) {
      await page.fill('textarea[id^="open-"]', 'my typed answer'); await page.reload(); await page.waitForSelector('h1');
      check(await page.inputValue('textarea[id^="open-"]') === 'my typed answer', 'open answer survives reload at ' + url); steps.open = true;
      await page.click('button:has-text("Show the model answer")'); await page.click('.model .checks input >> nth=0'); await page.reload(); await page.waitForSelector('h1');
      check(!!(await page.$('.model')) && await page.$eval('.model .checks input', e => e.checked), 'model answer and self-check tick survive reload'); 
    }
    if ((await page.textContent('h1')).trim() === 'Mission done') break;
    await page.locator('.actions a.btn:not(.quiet)').last().click(); await page.waitForTimeout(40);
    if (steps.choice && steps.multi && steps.match && steps.open) break;
  }
  for (const k of ['choice', 'multi', 'match', 'open']) check(!!steps[k], 'tested a ' + k + ' question');
  // short mission with tfns / factopinion
  await go('#/reading/r-pandas/0');
  for (let s = 0; s < 20; s++) {
    const labels = await page.$$('fieldset.options label.option');
    if (labels.length === 3 || labels.length === 2) {
      await labels[labels.length - 1].click(); await page.reload(); await page.waitForSelector('h1');
      check(!!(await page.$('fieldset.options input:checked')), 'true/false or fact/opinion answer survives reload'); break;
    }
    await page.locator('.actions a.btn:not(.quiet)').last().click(); await page.waitForTimeout(40);
  }
  // Reading position survives leaving and coming back
  await go('#/reading/r-pandas/3'); await go('#/'); await go('#/reading/r-pandas'); await page.waitForTimeout(300);
  check(/Question 3 of/.test(await page.textContent('main')), 'reading remembers where she was (position)');

  // Writing
  await page.click('label[for="level-L1"]');
  await go('#/writing/w-pandas-4/plan'); await page.fill('#plan-opening', 'My opening idea'); await reload();
  check(await page.inputValue('#plan-opening') === 'My opening idea', 'plan survives reload');
  await go('#/writing/w-pandas-4/write'); await page.fill('#draft', 'Typed draft words here.'); await page.click('.checks input >> nth=0'); await reload();
  check(await page.inputValue('#draft') === 'Typed draft words here.' && await page.$eval('.checks input', e => e.checked), 'draft and checklist survive reload');
  check(/My opening idea/.test(await page.textContent('.pane-plan')), 'plan appears beside the draft');

  // Toolkit practice
  await go('#/toolkit/spag/commas'); await page.waitForSelector('fieldset.options');
  await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('nextstop:drill:')).forEach(k => localStorage.removeItem(k))); await reload();
  const firstPrompt = await page.textContent('#practice-q');
  await page.click('fieldset.options label.option >> nth=2'); await reload();
  check(await page.$eval('fieldset.options input:checked', e => e.value) === '2' && (await page.textContent('#practice-q')) === firstPrompt, 'toolkit answer and question survive reload (same question, same choice)');
  await page.click('button:has-text("Check my answer")'); await page.click('button:has-text("Next question")'); await reload();
  check(/Question 2 of/.test(await page.textContent('.step-count')), 'toolkit position survives reload');
  await page.click('button:has-text("Back")'); 
  check(!!(await page.$('.feedback')) && await page.$eval('fieldset.options input:checked', e => e.value) === '2', 'going Back shows the earlier answer and its feedback');

  // Learn: mark
  await go('#/learn/mark/mark-forum-zoo/a2'); await page.selectOption('#pick-comp', '5'); await page.selectOption('#pick-spag', '3'); await reload();
  check(await page.inputValue('#pick-comp') === '5' && await page.inputValue('#pick-spag') === '3', 'marking choices survive reload (before revealing)');
  await page.click('button:has-text("Show what we thought")'); await reload();
  check(!!(await page.$('.feedback')), 'revealed marking feedback is still there after reload');

  // Learn: fix it
  await go('#/learn/fix/fix-commas'); await page.fill('#fix-box', 'half typed'); await reload();
  check(await page.inputValue('#fix-box') === 'half typed', 'fix-it text survives reload');
  await page.fill('#fix-box', 'We bought bread, milk, eggs and cheese.'); await page.click('button:has-text("Check")'); await page.click('button:has-text("Next question")'); await reload();
  check(/Sentence 2 of 8/.test(await page.textContent('main')), 'fix-it position survives reload');
  await page.click('button:has-text("Next question")'); await page.fill('#fix-box', 'typed on three'); await go('#/'); await go('#/learn/fix/fix-commas');
  check(/Sentence 3 of 8/.test(await page.textContent('main')) && await page.inputValue('#fix-box') === 'typed on three', 'fix-it remembers where she was after leaving');
  for (let i = 3; i <= 8; i++) await page.click(i === 8 ? 'button:has-text("Finish")' : 'button:has-text("Next question")');
  await reload();
  check(/The answers/.test(await page.textContent('main')), 'fix-it answers page survives reload');

  await browser.close();
  console.log('PROBLEMS:', problems.length ? problems : 'none');
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
