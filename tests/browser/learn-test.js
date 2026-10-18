// Click-through for the home page and the Learn section.  Run:  node tests/browser/learn-test.js <screenshot folder>
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8766/';
const OUT = process.argv[2] || '.';
const problems = []; const external = new Set();
const learn = require('../../content/learn.json');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
  page.on('pageerror', e => problems.push('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push('console ' + m.text()); });
  page.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) external.add(r.url()); });
  await page.goto(BASE); await page.waitForSelector('.theme-grid');
  console.log('themes:', await page.$$eval('.theme-card .st-name', e => e.map(x => x.textContent)));
  console.log('home counts:', await page.$$eval('.st-count', e => e.map(x => x.textContent)));
  await page.screenshot({ path: OUT + '/home.png', fullPage: true });
  for (const L of ['L1', 'L2']) {
    await page.click(`label[for="level-${L}"]`);
    await page.goto(BASE + '#/learn'); await page.waitForSelector('.tool-list');
    for (const t of learn.mark.filter(t => t.level === L)) {
      await page.goto(BASE + '#/learn/mark/' + t.id); await page.waitForSelector('.task-card');
      for (const s of t.samples) {
        await page.goto(BASE + '#/learn/mark/' + t.id + '/' + s.id); await page.waitForSelector('.sample-text');
        await page.selectOption('#pick-comp', String(s.composition));
        await page.selectOption('#pick-spag', { index: 1 });
        await page.click('button:has-text("Show what we thought")');
        await page.waitForSelector('.feedback');
        const txt = await page.textContent('.feedback');
        if (!txt.includes('the same as ours') && !txt.includes('away') && !txt.includes('different')) problems.push('no comparison for ' + s.id);
      }
      console.log(L, t.id, 'ok');
    }
    for (const f of learn.fix) {
      await page.goto(BASE + '#/learn/fix/' + f.id); await page.waitForSelector('.fix-item');
      const btns = await page.$$('.fix-item button');
      for (const b of btns) await b.click();
      await page.waitForSelector('.notice');
    }
    await page.goto(BASE + '#/learn');
    console.log(L, 'learn index done tags:', (await page.$$('.t-done')).length);
  }
  await page.goto(BASE + '#/progress'); await page.waitForSelector('.log-table');
  console.log('progress rows:', (await page.$$('.log-table tbody tr')).length, '| stats:', (await page.$$eval('.stats div', ds => ds.map(d => d.innerText.replace(/\s+/g, ' ')))).join(' | '));
  const phone = await (await browser.newContext({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  phone.on('pageerror', e => problems.push('phone ' + e.message));
  for (const v of ['#/', '#/learn', '#/learn/mark/mark-forum-zoo', '#/learn/mark/mark-forum-zoo/a2', '#/learn/fix/fix-commas', '#/reading', '#/writing']) {
    await phone.goto(BASE + v); await phone.waitForSelector('h1');
    const o = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (o > 0) problems.push('phone overflow ' + o + ' at ' + v);
    await phone.screenshot({ path: OUT + '/phone' + v.replace(/[#/]+/g, '_') + '.png', fullPage: true });
  }
  // keyboard: select by keyboard and reveal
  await page.click('label[for="level-L1"]');
  await page.goto(BASE + '#/learn/mark/mark-forum-zoo/a1'); await page.waitForSelector('#pick-comp');
  await page.focus('#pick-comp'); await page.keyboard.press('ArrowDown');
  await page.focus('button:has-text("Show what we thought")'); await page.keyboard.press('Enter');
  console.log('keyboard reveal:', !!(await page.waitForSelector('.feedback')));
  await browser.close();
  console.log('EXTERNAL:', external.size ? [...external] : 'none');
  console.log('PROBLEMS:', problems.length ? problems : 'none');
})().catch(e => { console.error(e); process.exit(1); });
