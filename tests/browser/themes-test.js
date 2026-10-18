// Themes and imported packs.  Needs the site served at BASE (python3 -m http.server 8766 in the repo).
// It also makes a throw-away copy of the site, imports the example pack into it and checks that drafts stay hidden.
//   node tests/browser/themes-test.js
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const { spawnSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const repo = path.resolve(__dirname, '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:8766/';
const problems = [], external = new Set();
const check = (cond, msg) => { if (!cond) problems.push(msg); console.log(cond ? 'ok  ' : 'FAIL', msg); };
function watch(page, label, base) {
  page.on('pageerror', e => problems.push(label + ' pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(label + ' console ' + m.text()); });
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) external.add(r.url()); });
}
(async () => {
  const browser = await chromium.launch();
  // 1. The real site
  let page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage(); watch(page, 'site', BASE);
  for (const L of ['L1', 'L2']) {
    await page.goto(BASE); await page.waitForSelector('.theme-grid');
    await page.click(`label[for="level-${L}"]`);
    const names = await page.$$eval('.theme-card .st-name', e => e.map(x => x.textContent));
    check(names.length >= 4 && !names.includes('Football'), `${L}: home lists ${names.join(', ')}`);
    for (const n of names) {
      await page.goto(BASE); await page.click(`.theme-card a:has-text("${n}")`);
      await page.waitForSelector('.stops');
      const links = await page.$$eval('.stops a', a => a.length);
      check(links > 0 && (await page.textContent('h1')).trim() === n, `${L}: theme ${n} has ${links} missions`);
      const first = await page.$eval('.stops a', a => a.getAttribute('href'));
      await page.goto(BASE + first); await page.waitForSelector('h1');
    }
  }
  await page.goto(BASE); await page.click('button:has-text("Pick one for me")'); await page.waitForTimeout(200);
  check(/#\/(reading|writing)\//.test(page.url()), 'Pick one for me goes to a mission: ' + page.url().split('#')[1]);
  await page.goto(BASE + '#/theme/nope'); check((await page.textContent('h1')).includes('not on the map'), 'unknown theme shows the calm not-found page');

  // 2. A copy of the site with an imported pack
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextstop-site-'));
  for (const d of ['content', 'css', 'js', 'img']) fs.cpSync(path.join(repo, d), path.join(dir, d), { recursive: true });
  fs.copyFileSync(path.join(repo, 'index.html'), path.join(dir, 'index.html'));
  fs.mkdirSync(path.join(dir, 'docs'));
  const run = (...a) => spawnSync('node', [path.join(repo, 'tools/import.mjs'), ...a], { env: { ...process.env, NEXTSTOP_ROOT: dir }, encoding: 'utf8' });
  const r1 = run(path.join(repo, 'docs/import/example-pack.json'));
  check(r1.status === 0, 'import ok: ' + r1.stdout.split('\n').pop().slice(0, 0) + (r1.stderr || '').slice(0, 200));
  const server = spawn('python3', ['-m', 'http.server', '8768'], { cwd: dir, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const B2 = 'http://127.0.0.1:8768/';
  page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage(); watch(page, 'pack', B2);
  await page.goto(B2); await page.waitForSelector('.theme-grid');
  check(!(await page.$$eval('.theme-card .st-name', e => e.map(x => x.textContent))).includes('Football'), 'draft theme hidden from the learner');
  await page.goto(B2 + '#/reading'); await page.waitForSelector('details.menu');
  check((await page.textContent('main')).indexOf('Saturday at Ashby') === -1, 'draft reading mission not in Reading menu');
  await page.click('button:has-text("Teacher view")');
  await page.goto(B2); await page.waitForSelector('.theme-grid');
  check((await page.$$eval('.theme-card .st-name', e => e.map(x => x.textContent))).includes('Football'), 'teacher view shows the Football theme');
  await page.click('.theme-card a:has-text("Football")'); await page.waitForSelector('.stops');
  check((await page.$$eval('.draft-tag', e => e.length)) >= 2, 'drafts are labelled Unchecked');
  await page.click('a:has-text("Saturday at Ashby")');
  // run through the mission
  for (let g = 0; g < 30; g++) {
    if ((await page.textContent('h1')).trim() === 'Mission done') break;
    if (await page.$('fieldset.options')) { await page.click('fieldset.options label.option >> nth=0'); if (await page.$('fieldset.options input[type=checkbox]')) await page.click('fieldset.options label.option >> nth=1'); await page.click('button:has-text("Check my answer")'); }
    else if (await page.$('textarea[id^="open-"]')) { await page.fill('textarea[id^="open-"]', 'x'); await page.click('button:has-text("Show the model answer")'); }
    await page.locator('.actions a.btn:not(.quiet)').last().click(); await page.waitForTimeout(40);
  }
  check((await page.textContent('h1')).trim() === 'Mission done', 'imported mission can be completed');
  await page.click('button:has-text("Teacher view")');
  await page.goto(B2); await page.waitForSelector('.theme-grid');
  check(!(await page.$$eval('.theme-card .st-name', e => e.map(x => x.textContent))).includes('Football'), 'teacher view can be switched off again');
  const r2 = run('--approve', 'football-example'); check(r2.status === 0, 'approve ok');
  await page.reload(); await page.waitForSelector('.theme-grid');
  check((await page.$$eval('.theme-card .st-name', e => e.map(x => x.textContent))).includes('Football'), 'after approval the theme shows without teacher view');
  const r3 = run(path.join(repo, 'docs/import/example-pack.json')); check(r3.status !== 0 && /already imported/.test(r3.stderr), 'importing the same pack twice is refused');
  server.kill(); await browser.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log('EXTERNAL:', external.size ? [...external] : 'none');
  console.log('PROBLEMS:', problems.length ? problems : 'none');
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
