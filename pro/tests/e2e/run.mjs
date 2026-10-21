// Browser tests for the whole paid site: starts the real server (fake AI, fake Stripe, throw-away data) and
// drives it like a learner, a parent and a payer.   node tests/e2e/run.mjs [screenshot folder]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startApp, fakeServer, stripeSignature, stripeEvent, STRIPE_SECRET } from '../helpers.mjs';
import { sha256 } from '../../server/util.js';

const { chromium } = createRequire(import.meta.url)('/opt/node-tools/node_modules/playwright');
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ns-e2e-'));
const problems = []; const external = new Set();
const check = (c, m) => { if (!c) problems.push(m); console.log(c ? 'ok  ' : 'FAIL', m); };

const stripe = await fakeServer((req, res) => {
  res.writeHead(200, { 'content-type': req.url.startsWith('/pay') ? 'text/html' : 'application/json' });
  if (req.url.startsWith('/pay')) return res.end('<html><body>fake checkout</body></html>');
  if (req.url.includes('checkout/sessions')) return res.end(JSON.stringify({ id: 'cs_1', url: stripe.url + '/pay/cs_1' }));
  res.end('{}');
});
const ctx = await startApp({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_BASE_URL: stripe.url, STRIPE_PRICE_MONTHLY: 'price_m', STRIPE_PRICE_PASS: 'price_p', PRICE_MONTHLY_LABEL: '£6.99 a month', PRICE_PASS_LABEL: '90-day pass £14.99', ADMIN_EMAILS: 'boss@example.com' });
const BASE = ctx.base;
await ctx.app.store.putCode(sha256('PILOT2026'), { days: 30, maxUses: 10, uses: 0, label: 'Pilot' });

const browser = await chromium.launch();
async function person(opts = {}) {
  const c = await browser.newContext({ viewport: { width: opts.w || 1200, height: 900 }, acceptDownloads: true, isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
  const page = await c.newPage();
  page.on('pageerror', (e) => problems.push('pageerror ' + e.message));
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console ' + m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && !r.url().startsWith(stripe.url)) external.add(r.url()); });
  return { c, page };
}
async function go(page, hash) { await page.goto(BASE + '/' + hash); await page.waitForSelector('h1'); await page.waitForTimeout(80); }
async function signIn(page, email) {
  await go(page, '#/account'); await page.fill('#signin-email', email); await page.click('button:has-text("Email me a link")');
  await page.waitForSelector('a:has-text("Open the link")'); await page.click('a:has-text("Open the link")');
  await page.waitForSelector('button:has-text("Sign in")'); await page.click('button:has-text("Sign in")');
  await page.waitForSelector('h1:has-text("Your account")');
}
const theme = (page) => page.$$eval('.theme-card .st-name', (e) => e.map((x) => x.textContent));
const pageText = (page) => page.textContent('main');

// ---------------- 1. a visitor with no account ----------------
{
  const { c, page } = await person();
  await go(page, '');
  await page.waitForSelector('.theme-grid');
  check((await theme(page)).length === 4, 'visitor sees the themes');
  check(await page.$eval('#account-link', (a) => a.textContent) === 'Sign in', 'header offers Sign in');
  check(/free taster/.test(await pageText(page)), 'the home page says it is the free taster');
  const counts = await page.$$eval('.theme-card .st-count', (e) => e.map((x) => x.textContent));
  check(counts.every((t) => !/of 9 done|of 8 done/.test(t)), 'counts only include what is open: ' + counts.join(' | '));
  await page.screenshot({ path: SHOTS + '/home-free.png', fullPage: true });
  await go(page, '#/theme/pandas'); await page.waitForSelector('.stops');
  check((await page.$$('.stop .draft-tag')).length >= 3 && /more here with Plus/.test(await pageText(page)), 'locked missions are tagged Plus and the page says how many more');
  // a free mission works end to end
  await page.click('.stop a:not(:has(.draft-tag)) >> nth=0');
  for (let g = 0; g < 30; g++) {
    if ((await page.textContent('h1')).trim() === 'Mission done') break;
    if (await page.$('fieldset.options')) { await page.click('fieldset.options label.option >> nth=1'); if (await page.$('fieldset.options input[type=checkbox]')) await page.click('fieldset.options label.option >> nth=0'); await page.click('button:has-text("Check my answer")'); }
    else if (await page.$('textarea[id^="open-"]')) { await page.fill('textarea[id^="open-"]', 'x'); await page.click('button:has-text("Show the model answer")'); }
    await page.locator('.actions a.btn:not(.quiet)').last().click(); await page.waitForTimeout(40);
  }
  check((await page.textContent('h1')).trim() === 'Mission done', 'a free mission can be finished without an account');
  // a locked one does not open
  await go(page, '#/theme/pandas'); await page.click('.stop a:has(.draft-tag) >> nth=0');
  await page.waitForSelector('.locked-card');
  check(/part of Plus/.test(await pageText(page)) && !!(await page.$('a:has-text("See Plus")')), 'a locked mission shows what Plus is, not the lesson');
  await go(page, '#/reading/rl-pandas/0'); check(!!(await page.$('.locked-card')), 'typing a locked address directly does not open it either');
  await go(page, '#/writing/w-pandas-1/write'); check(!!(await page.$('.locked-card')), 'nor a locked writing task');
  await go(page, '#/learn'); check((await page.$$('.draft-tag')).length >= 1, 'locked marking tasks are tagged');
  await go(page, '#/plans'); await page.waitForSelector('button:has-text("£6.99 a month")'); check(/90-day pass £14.99/.test(await pageText(page)) && /£6.99 a month/.test(await pageText(page)), 'plans show the prices set on the server');
  await go(page, '#/toolkit'); check((await page.$$('.tool-list a')).length >= 18, 'the whole toolkit is open');
  // feedback needs an account
  await go(page, '#/writing/w-pandas-4/write'); await page.fill('#draft', 'Hi everyone, I think it depends on the day and the weather.');
  await go(page, '#/writing/w-pandas-4/send');
  check(!!(await page.$('a:has-text("Sign in")')) && !(await page.$('button:has-text("Get feedback")')), 'without an account the Send step offers Copy and a sign-in prompt, not marking');
  await c.close();
}

// ---------------- 2. sign in, use a code, get feedback ----------------
const learnerEmail = 'learner@example.com';
const L = await person(); const lp = L.page;
{
  await signIn(lp, learnerEmail);
  check(await lp.$eval('#account-link', (a) => a.textContent) === 'Account', 'after signing in the header says Account');
  check(/free taster/.test(await pageText(lp)), 'a new account starts on the free taster');
  await lp.fill('#redeem-code', 'pilot-2026'); await lp.click('button:has-text("Use this code")');
  await lp.waitForSelector('#account-link .plan-badge');
  check(/Plus until/.test(await pageText(lp)), 'a promo code switches Plus on at once');
  await go(lp, '#/theme/pandas'); await lp.waitForSelector('.stops');
  check((await lp.$$('.stop .draft-tag')).length === 0, 'nothing is locked any more');
  await go(lp, '#/reading/rl-pandas/0'); check(!(await lp.$('.locked-card')), 'a long mission opens now');
  // marking
  await go(lp, '#/writing/w-pandas-4/write');
  await lp.fill('#draft', 'Hi everyone, I think a day at the zoo is worth it. Last summer I watched a giant panda eat bamboo for ten minutes and it was amazing. The tickets were expensive though, so I took my own lunch.');
  await go(lp, '#/writing/w-pandas-4/send');
  await lp.waitForSelector('button:has-text("Get feedback")');
  await lp.click('button:has-text("Get feedback")'); await lp.waitForSelector('.feedback h3');
  check(/Two things that worked/.test(await lp.textContent('.feedback')) && (await lp.$$('.feedback blockquote')).length === 2, 'feedback shows two things that worked, with quotes');
  check(/left this month/.test(await lp.textContent('.status')), 'it says how many feedbacks are left');
  await lp.click('button:has-text("Show my marks")'); check(/Composition: \d+ out of 9/.test(await lp.textContent('.score-box')), 'marks only appear when she asks');
  await lp.screenshot({ path: SHOTS + '/feedback.png', fullPage: true });
  await go(lp, '#/account'); check(/1 of \d+ AI feedbacks used/.test(await pageText(lp)), 'the account page counts the feedback used');
  await go(lp, '#/learn/mark/mark-advice-train'); check(!(await lp.$('.locked-card')) && !!(await lp.$('.task-card')), 'every marking task is open on Plus');
}

// ---------------- 3. work follows her to another device ----------------
{
  await go(lp, '#/writing/w-israel-4/write'); await lp.fill('#draft', 'Typed on the first device.');
  await go(lp, '#/account'); await lp.click('button:has-text("Sync now")'); await lp.waitForFunction(() => /Saved to your account/.test(document.getElementById('sync-line').textContent));
  const { c: c2, page: p2 } = await person();
  await signIn(p2, learnerEmail);
  await go(p2, '#/writing/w-israel-4/write');
  check(await p2.inputValue('#draft') === 'Typed on the first device.', 'a second device signs in and finds her draft');
  await p2.fill('#draft', 'Typed on the first device. Then carried on on the second.');
  await go(p2, '#/account'); await p2.click('button:has-text("Sync now")'); await p2.waitForFunction(() => /Saved to your account/.test(document.getElementById('sync-line').textContent));
  await go(lp, '#/account'); await lp.click('button:has-text("Sync now")'); await lp.waitForFunction(() => /Saved to your account/.test(document.getElementById('sync-line').textContent)); await lp.waitForTimeout(300);
  await go(lp, '#/writing/w-israel-4/write');
  check(/carried on on the second/.test(await lp.inputValue('#draft')), 'and the first device gets the newer words back');
  // background sync: no button pressed
  await go(p2, '#/writing/w-israel-4/write'); await p2.fill('#draft', 'Typed on the first device. Then carried on on the second. And a third line, synced by itself.');
  await p2.waitForTimeout(5500);
  const server = (await ctx.app.store.getSync((await ctx.app.store.getUserByEmail(learnerEmail)).id)).data['writing:w-israel-4:L1'].draft;
  check(/synced by itself/.test(server), 'typing syncs by itself a few seconds later');
  // offline: work is kept, then sync catches up
  await p2.context().setOffline(true);
  await p2.fill('#draft', 'Offline words that must not be lost.'); await p2.waitForTimeout(300);
  await go(p2, '#/account').catch(() => {});
  await p2.context().setOffline(false);
  await p2.reload(); await p2.waitForSelector('h1'); await p2.waitForTimeout(800);
  await go(p2, '#/writing/w-israel-4/write');
  check(await p2.inputValue('#draft') === 'Offline words that must not be lost.', 'work typed while offline is kept on the device');
  await p2.waitForTimeout(500);
  await go(p2, '#/account'); await p2.click('button:has-text("Sync now")'); await p2.waitForFunction(() => /Saved to your account/.test(document.getElementById('sync-line').textContent));
  const after = (await ctx.app.store.getSync((await ctx.app.store.getUserByEmail(learnerEmail)).id)).data['writing:w-israel-4:L1'].draft;
  check(after === 'Offline words that must not be lost.', 'and it reaches the account when she is back online');
  await c2.close();
}

// ---------------- 4. a parent ----------------
{
  await go(lp, '#/reading/r-pandas/0');   // finish something so there is progress to see
  for (let g = 0; g < 30; g++) {
    if ((await lp.textContent('h1')).trim() === 'Mission done') break;
    if (await lp.$('fieldset.options')) { await lp.click('fieldset.options label.option >> nth=1'); await lp.click('button:has-text("Check my answer")'); }
    else if (await lp.$('textarea[id^="open-"]')) { await lp.fill('textarea[id^="open-"]', 'x'); await lp.click('button:has-text("Show the model answer")'); }
    await lp.locator('.actions a.btn:not(.quiet)').last().click(); await lp.waitForTimeout(40);
  }
  await go(lp, '#/account'); await lp.waitForSelector('button:has-text("Make a code to share")');
  await lp.click('button:has-text("Make a code to share")'); await lp.waitForSelector('.the-code');
  const code = await lp.textContent('.the-code'); check(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code), 'the learner gets a short code: ' + code);
  await lp.click('button:has-text("Sync now")'); await lp.waitForTimeout(600);
  const { c: pc, page: pp } = await person();
  await signIn(pp, 'mum@example.com');
  await pp.waitForSelector('#family-code'); await pp.fill('#family-code', code); await pp.click('button:has-text("Link to a learner")');
  await pp.waitForSelector('a:has-text("See progress")');
  await pp.click('a:has-text("See progress")'); await pp.waitForSelector('dl.stats');
  const t = await pageText(pp);
  check(/le\*\*\*@example.com/.test(t) && /Read only/.test(t) && /Panda Week/.test(t), 'the parent sees a read-only progress page with recent work');
  check(!/Hi everyone/.test(t) && /Their writing is private/.test(t), 'but not her writing');
  await pp.screenshot({ path: SHOTS + '/parent.png', fullPage: true });
  await go(lp, '#/account'); await lp.reload(); await lp.waitForSelector('.family-row input[type=checkbox]'); await lp.check('.family-row input[type=checkbox]'); await lp.waitForTimeout(400);
  await pp.reload(); await pp.waitForSelector('dl.stats');
  check(/Writing they chose to share/.test(await pageText(pp)) && /giant panda eat bamboo/.test((await pp.$$eval('.shared-text', (e) => e.map((x) => x.textContent).join(' '))) + (await pp.$$eval('details', (d) => d.map((x) => x.textContent).join(' ')))), 'once she ticks the box, the parent can read her writing');
  await lp.click('button:has-text("Stop sharing")'); await lp.waitForTimeout(500);
  await pp.reload(); await pp.waitForSelector('h1'); await pp.waitForTimeout(400);
  check(/not available any more/.test(await pageText(pp)), 'when she stops sharing the parent loses access straight away');
  await pc.close();
}

// ---------------- 5. paying ----------------
{
  const { c: bc, page: bp } = await person();
  await signIn(bp, 'payer@example.com');
  await go(bp, '#/plans'); await bp.waitForSelector('button:has-text("£6.99 a month")');
  await Promise.all([bp.waitForURL(stripe.url + '/**'), bp.click('button:has-text("£6.99 a month")')]);
  check(/fake checkout/.test(await bp.textContent('body')), 'the monthly button sends her to the payment page');
  const form = new URLSearchParams(stripe.calls.find((x) => x.url.includes('checkout/sessions')).body);
  const uid = (await ctx.app.store.getUserByEmail('payer@example.com')).id;
  check(form.get('client_reference_id') === uid && form.get('mode') === 'subscription', 'the payment is tied to her account');
  const ev = stripeEvent('checkout.session.completed', { mode: 'subscription', payment_status: 'paid', client_reference_id: uid, customer: 'cus_7', subscription: 'sub_7' });
  const wh = await fetch(BASE + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': stripeSignature(ev) }, body: ev });
  check(wh.status === 200, 'the payment company tells us she paid');
  await go(bp, '#/account'); await bp.waitForSelector('#account-link .plan-badge');
  check(/Plus until/.test(await pageText(bp)) && !!(await bp.$('button:has-text("Manage billing")')), 'Plus switches on and she can manage billing');
  // download my data, then delete
  const [dl] = await Promise.all([bp.waitForEvent('download'), bp.click('button:has-text("Download my data")')]);
  const exp = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check(exp.account.email === 'payer@example.com' && exp.account.plan.tier === 'plus', 'she can download everything held about her');
  await bp.fill('#delete-confirm', 'DELETE'); await bp.click('button:has-text("Delete my account")');
  await bp.waitForSelector('.theme-grid');
  check(await bp.$eval('#account-link', (a) => a.textContent) === 'Sign in' && (await ctx.app.store.getUserByEmail('payer@example.com')) === null, 'deleting the account signs her out and removes it');
  check(stripe.calls.some((x) => x.method === 'DELETE' && x.url.includes('sub_7')), 'and cancels her subscription');
  await bc.close();
}

// ---------------- 6. phone, keyboard, admin, sign out ----------------
{
  const { c, page } = await person({ w: 360, mobile: true });
  for (const h of ['', '#/theme/pandas', '#/plans', '#/account', '#/reading/rl-pandas/0', '#/make']) {
    await go(page, h); const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(o <= 0, `no sideways scroll on a phone at ${h || 'home'}`);
    await page.screenshot({ path: SHOTS + '/phone' + (h.replace(/[#/]+/g, '_') || '_home') + '.png', fullPage: true });
  }
  await c.close();
  const k = await person(); await go(k.page, '');
  const order = []; for (let i = 0; i < 9; i++) { await k.page.keyboard.press('Tab'); order.push(await k.page.evaluate(() => (document.activeElement.textContent || '').trim().slice(0, 12))); }
  check(order.includes('Sign in'), 'the Sign in link can be reached with the keyboard: ' + order.join(' | '));
  await k.c.close();
  const a = await person(); await signIn(a.page, 'boss@example.com'); await go(a.page, '');
  check(!!(await a.page.$('button:has-text("Admin: unchecked missions")')), 'an admin account gets the drafts switch');
  check(await a.page.$eval('#account-link', (e) => e.textContent) === 'Account', 'admin is just an account');
  await go(a.page, '#/account'); await a.page.click('button:has-text("Sign out")'); await a.page.waitForSelector('.theme-grid');
  check(await a.page.$eval('#account-link', (e) => e.textContent) === 'Sign in', 'signing out works');
  const bad = await a.page.evaluate(() => fetch('/api/mark', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.status));
  check(bad === 403 || bad === 401, 'a request without the site header is refused (' + bad + ')');
  await a.c.close();
}

await browser.close(); await ctx.close(); await stripe.close();
console.log('\nScreenshots in', SHOTS);
console.log('EXTERNAL:', external.size ? [...external] : 'none');
console.log('PROBLEMS:', problems.length ? problems : 'none');
process.exit(problems.length ? 1 : 0);
