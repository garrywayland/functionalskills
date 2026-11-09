// Browser tests for the activity types in js/activities.js, on a phone-sized screen and with the keyboard.
// Serve the site first: python3 -m http.server 8766 --bind 127.0.0.1   then: node tests/browser/activities-test.js [screenshot folder]
const fs = require('fs'); const os = require('os'); const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ns-act-'));
const problems = [];
const check = (c, m) => { if (!c) problems.push(m); console.log(c ? 'ok  ' : 'FAIL', m); };
const quick = JSON.parse(fs.readFileSync(path.join(__dirname, '../../content/quick.json'), 'utf8')).missions;
const find = (id) => quick.find((m) => m.id === id);

const ctx = { base: 'http://127.0.0.1:8766' };
(async () => {
const browser = await chromium.launch();
const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await c.newPage();
page.on('pageerror', (e) => problems.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push('console ' + m.text()); });
const open = async (id, step) => { await page.goto(`${ctx.base}/#/reading/${id}/${step}`); await page.reload(); await page.waitForSelector('h1.question-prompt'); };
const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true });
const fits = async (n) => check((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, n + ': no sideways scroll on a phone');
const feedback = () => page.textContent('.feedback');
const checkBtn = 'button:has-text("Check my answer")';

// The lists show quick practice without signing in.
await page.goto(ctx.base + '/#/reading'); await page.waitForSelector('.line');
check((await page.$$('details.menu')).length > 0, 'the reading page loads');

// ---- sort ----
await open('qp-pandas-formal', 0);
check(/Quick practice/.test(await page.textContent('.eyebrow')), 'a quick practice mission says so');
check((await page.$('.look-back')) === null, 'no "show the text" when there is no text');
check(await page.isDisabled(checkBtn), 'sort: cannot check until every item has a group');
const sortQ = find('qp-pandas-formal').questions[0];
for (let i = 0; i < sortQ.items.length; i++) await page.check(`input[name="sort-q1-${i}"][value="${i === 0 ? 1 - sortQ.items[i].group : sortQ.items[i].group}"]`);
await shot('sort-before'); await fits('sort');
await page.click(checkBtn);
check(/4 of 5 match/.test(await feedback()), 'sort: says how many matched, calmly');
check((await page.$$('fieldset.sort-item .tag')).length === 5 && /Answer: Formal/.test(await page.textContent('fieldset.sort-item')), 'sort: shows the answer on the one that differed');
await shot('sort-after');
await page.reload(); await page.waitForSelector('.feedback');
check(await page.isDisabled('input[name="sort-q1-0"]'), 'sort: the checked answer is still there after a reload, and locked');

// ---- an ordinary multiple-choice question inside a quick mission ----
await open('qp-pandas-formal', 1);
await page.click('label.option:nth-of-type(2)'); await page.click(checkBtn);
check(/Yes/.test(await feedback()), 'choice: an ordinary question works inside quick practice');

// ---- spot ----
await open('qp-pandas-formal', 2);
await page.click('button.word:has-text("awesome")');
check((await page.getAttribute('button.word:has-text("awesome")', 'aria-pressed')) === 'true', 'spot: the chosen word is marked as pressed');
await shot('spot-before'); await fits('spot');
await page.click(checkBtn);
check(/It should be "suitable"/.test(await feedback()), 'spot: gives the corrected word and why');

// ---- gapfill ----
await open('qp-pandas-formal', 3);
check(await page.isDisabled(checkBtn), 'gapfill: cannot check with empty gaps');
await page.selectOption('select[aria-label="Gap 1"]', { label: 'moan' });
await page.selectOption('select[aria-label="Gap 2"]', { label: 'grateful' });
await page.selectOption('select[aria-label="Gap 3"]', { label: 'faithfully' });
await shot('gapfill-before'); await fits('gapfill');
await page.click(checkBtn);
check(/2 of 3 gaps match/.test(await feedback()) && /enquire/.test(await feedback()), 'gapfill: says how many matched and shows it filled in');
await shot('gapfill-after');

// ---- order, by keyboard only ----
await open('qp-transport-order', 0);
const orderQ = find('qp-transport-order').questions[0];
const shown = () => page.$$eval('.order-text', (els) => els.map((e) => e.textContent));
check((await shown()).join('|') !== orderQ.items.join('|'), 'order: starts mixed up');
await shot('order-before'); await fits('order');
for (let target = 0; target < orderQ.items.length; target++) {
  let at = (await shown()).indexOf(orderQ.items[target]);
  while (at > target) {
    await page.focus(`.order-item:nth-child(${at + 1}) button[aria-label^="Move up"]`); await page.keyboard.press('Enter');
    at = (await shown()).indexOf(orderQ.items[target]);
  }
}
check((await shown()).join('|') === orderQ.items.join('|'), 'order: can be put right using only the keyboard');
check(/Moved to place/.test(await page.textContent('[role="status"].visually-hidden')), 'order: each move is announced to a screen reader');
await page.click(checkBtn);
check(/Yes, that is the order/.test(await feedback()), 'order: confirms the right order');
check((await page.$$('.order-moves')).length === 0, 'order: the move buttons go once it is checked');

// ---- evidence ----
await open('qp-transport-order', 3);
await page.click('label.option:nth-of-type(1)'); await shot('evidence-before'); await fits('evidence');
await page.click(checkBtn);
check(/marked above/.test(await feedback()) && /Answer/.test(await page.textContent('label.option.is-answer')), 'evidence: marks the right sentence');

// ---- finishing a quick mission ----
await page.goto(`${ctx.base}/#/reading/qp-pandas-formal/4`); await page.reload(); await page.waitForSelector('h1');
check(/Mission done/.test(await page.textContent('h1')), 'a Level 1 learner reaches the end after four questions (the fifth is Level 2 only)');
await page.click('button:has-text("Show how many matched")');
check(/2 of 4 answers matched/.test(await page.textContent('.score-box')), 'the end screen counts the new types');
await page.click('summary:has-text("Look back at my answers")');
check(/I am writing to \[moan\]/.test(await page.textContent('.review-list')), 'look back shows her own gap answers');
await shot('done');

// ---- Make a pack: the prompt teaches the new types, and its own example passes the checks ----
await page.goto(ctx.base + '/#/make'); await page.reload(); await page.waitForSelector('#make-theme');
await page.fill('#make-theme', 'Football');
const made = await page.evaluate(() => {
  const prompt = Array.from(document.querySelectorAll('textarea, pre')).map((e) => e.value || e.textContent).find((t) => /QUICK PRACTICE MISSION/.test(t)) || '';
  const example = JSON.parse(prompt.slice(prompt.indexOf('{', prompt.indexOf('EXAMPLE (shortened'))));
  const errs = [], notes = [];
  window.NextStopRules.checkPackData(example, 'Example', errs, notes, { themeNames: ['Football'], formats: new Set(['forum']) });
  return { has: /order:.*gapfill:.*sort:.*spot:.*evidence:/s.test(prompt), errs, quick: example.reading.filter((m) => m.length === 'quick').length };
});
check(made.has, 'make a pack: the prompt explains all five new types');
check(made.quick === 1 && made.errs.length === 0, 'make a pack: the example in the prompt passes the content checks ' + JSON.stringify(made.errs));

await browser.close();
console.log('\nScreenshots in', SHOTS);
console.log('PROBLEMS:', problems.length ? problems : 'none');
process.exit(problems.length ? 1 : 0);
})();
