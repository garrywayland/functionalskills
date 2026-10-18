// End-to-end click-through for Next Stop.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = 'http://127.0.0.1:8766/';
const SHOTS = process.argv[2];
const problems = [];
const external = new Set();

function watch(page, label) {
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(label + ' console ' + m.type() + ': ' + m.text()); });
  page.on('pageerror', e => problems.push(label + ' pageerror: ' + e.message));
  page.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) external.add(r.url()); });
}

async function setLevel(page, L) {
  await page.click(`label[for="level-${L}"]`);
}

async function doReading(page, id, L) {
  await page.goto(BASE + '#/reading/' + id + '/0');
  await page.waitForSelector('h1');
  let guard = 0;
  while (guard++ < 30) {
    const h1 = (await page.textContent('h1')).trim();
    if (h1 === 'Mission done') break;
    if (await page.$('fieldset.options')) {
      await page.click('fieldset.options label.option >> nth=0');
      if (await page.$('fieldset.options input[type=checkbox]')) await page.click('fieldset.options label.option >> nth=1');
      await page.click('button:has-text("Check my answer")');
      await page.waitForSelector('.feedback');
    } else if (await page.$('textarea[id^="open-"]')) {
      await page.fill('textarea[id^="open-"]', 'A short answer.');
      await page.click('button:has-text("Show the model answer")');
      await page.waitForSelector('.model');
      await page.click('.model .checks input >> nth=0');
    }
    const next = page.locator('.actions a.btn:not(.quiet)').last();
    await next.click();
    await page.waitForTimeout(30);
  }
  await page.click('button:has-text("Show how many matched")');
  const score = await page.textContent('.score-box');
  return score.trim();
}

async function doWriting(page, id) {
  await page.goto(BASE + '#/writing/' + id + '/task');
  await page.waitForSelector('.task-card');
  await page.click('a:has-text("Next: Plan")');
  await page.fill('#plan-opening', 'Say why I am writing.');
  await page.fill('#plan-b0', 'First point notes.');
  await page.click('a:has-text("Next: Write")');
  await page.fill('#draft', 'Dear Sam, I am writing to apply. This is a short test draft with some words in it.');
  await page.waitForTimeout(500);
  const wc = await page.textContent('.word-count');
  await page.click('.checks input >> nth=0');
  await page.click('a:has-text("Next: Send")');
  const block = await page.inputValue('#marking');
  await page.click('button:has-text("Copy")');
  await page.waitForTimeout(200);
  const status = await page.textContent('.status');
  return { wc, blockLen: block.length, hasAnswer: block.includes('short test draft'), status: status.trim(), block };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  watch(page, 'desktop');
  await page.goto(BASE);
  await page.waitForSelector('.theme-grid');
  const reading = require('/home/user/functionalskills/content/reading.json').missions.concat(require('/home/user/functionalskills/content/reading-long.json').missions);
  const writing = require('/home/user/functionalskills/content/writing.json').missions;
  let sampleBlock = {};
  for (const L of ['L1', 'L2']) {
    await page.goto(BASE);
    await setLevel(page, L);
    for (const m of reading) {
      if (m.levels && !m.levels.includes(L)) {
        await page.goto(BASE + '#/reading/' + m.id + '/0');
        console.log(L, m.id, '→ hidden at this level, notice shown:', (await page.textContent('.notice')).trim().slice(0, 40));
        continue;
      }
      console.log(L, m.id, '→', await doReading(page, m.id, L));
    }
    for (const m of writing) {
      const r = await doWriting(page, m.id);
      console.log(L, m.id, '→', r.wc, '| block', r.blockLen, 'chars | answer in block:', r.hasAnswer, '|', r.status.slice(0, 30));
      if (m.id === 'w-pandas-1') sampleBlock[L] = r.block;
    }
    await page.goto(BASE);
    // toolkit
    await page.goto(BASE + '#/toolkit');
    const links = await page.$$eval('.tool-list a', as => as.map(a => a.getAttribute('href')));
    for (const href of links) {
      await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('nextstop:drill:')).forEach(k => localStorage.removeItem(k)));
      await page.goto(BASE + href);
      await page.reload();
      await page.click('fieldset.options label.option >> nth=0');
      await page.click('button:has-text("Check my answer")');
      await page.waitForSelector('.feedback');
    }
    console.log(L, 'toolkit pages ok:', links.length);
  }
  require('fs').writeFileSync(SHOTS + '/block-L1.txt', sampleBlock.L1);
  require('fs').writeFileSync(SHOTS + '/block-L2.txt', sampleBlock.L2);

  // Phone width screenshots + horizontal overflow check
  const phone = await browser.newContext({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await phone.newPage();
  watch(p, 'phone');
  const views = ['#/', '#/reading/r-transport/0', '#/reading/r-transport/2', '#/writing/w-israel-2/task', '#/writing/w-israel-2/write', '#/toolkit', '#/toolkit/spag/commas'];
  for (const v of views) {
    await p.goto(BASE + v);
    await p.waitForSelector('h1');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) problems.push('phone overflow ' + overflow + 'px at ' + v);
    await p.screenshot({ path: SHOTS + '/phone' + v.replace(/[#/]+/g, '_') + '.png', fullPage: true });
  }
  await page.goto(BASE + '#/reading/r-geography/3');
  await page.screenshot({ path: SHOTS + '/desktop_question.png' });
  await page.goto(BASE);
  await page.screenshot({ path: SHOTS + '/desktop_home.png', fullPage: true });

  // Keyboard only: tab from top to the level switch, switch level with arrows, open a mission, answer with keyboard
  const k = await (await browser.newContext()).newPage();
  watch(k, 'keyboard');
  await k.goto(BASE);
  await k.waitForSelector('.theme-grid');
  const order = [];
  for (let i = 0; i < 8; i++) { await k.keyboard.press('Tab'); order.push(await k.evaluate(() => (document.activeElement.textContent || document.activeElement.id || document.activeElement.tagName).trim().slice(0, 30))); }
  console.log('tab order:', order.join(' | '));
  await k.focus('#level-L1');
  await k.keyboard.press('ArrowRight');
  console.log('after arrow, level checked:', await k.$eval('#level-L2', e => e.checked));
  await k.goto(BASE + '#/reading/r-pandas/2');
  await k.waitForSelector('fieldset.options');
  // Tab until a radio is focused
  for (let i = 0; i < 15; i++) { await k.keyboard.press('Tab'); if (await k.evaluate(() => document.activeElement.type === 'radio')) break; }
  await k.keyboard.press('ArrowDown');
  for (let i = 0; i < 5; i++) { await k.keyboard.press('Tab'); if (await k.evaluate(() => document.activeElement.textContent === 'Check my answer')) break; }
  await k.keyboard.press('Enter');
  console.log('keyboard answer feedback shown:', !!(await k.$('.feedback')), '| focus on feedback:', await k.evaluate(() => document.activeElement.classList.contains('feedback')));

  // Storage unavailable
  const ns = await browser.newContext();
  await ns.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  const s = await ns.newPage();
  watch(s, 'nostorage');
  await s.goto(BASE);
  await s.waitForSelector('.theme-grid');
  await s.click('label[for="level-L2"]');
  await s.goto(BASE + '#/writing/w-geography-2/write');
  await s.fill('#draft', 'Words typed without storage.');
  await s.goto(BASE + '#/writing/w-geography-2/send');
  console.log('no-storage: draft kept in memory:', (await s.inputValue('#marking')).includes('without storage'), '| level L2:', (await s.inputValue('#marking')).includes('Level: Level 2'));

  // Reduced motion: confirm no transitions apply
  const rm = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  await rm.goto(BASE); await rm.waitForSelector('.btn');
  console.log('reduced motion transition:', await rm.$eval('.btn', e => getComputedStyle(e).transitionDuration));

  await browser.close();
  console.log('EXTERNAL REQUESTS:', external.size ? [...external] : 'none');
  console.log('PROBLEMS:', problems.length ? problems : 'none');
})().catch(e => { console.error(e); process.exit(1); });
