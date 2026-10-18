import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire('/home/user/functionalskills/server/');
const Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk');
const { chromium } = createRequire('/opt/node-tools/')('playwright');
const { createApp, loadConfig } = await import('/home/user/functionalskills/server/index.js');

const SITE = 'http://127.0.0.1:8767';
const ANSWER = 'Dear team, I would like to ask about the trip next spring. We are three friends and we love food. Please tell me about the meals.';
const feedback = { composition_mark: 8, spag_mark: 6,
  worked: [{ what: 'You said clearly why you were writing.', quote: 'I would like to ask about the trip next spring' }, { what: 'You mentioned who is travelling.', quote: 'We are three friends' }],
  try_next: { what: 'Add a question about special needs.', example: 'For example: "Do you offer vegetarian meals?"' } };

const fake = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(feedback) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 200 } })); }); });
await new Promise(r => fake.listen(0, '127.0.0.1', r));
const client = new Anthropic({ apiKey: 'sk-test', baseURL: `http://127.0.0.1:${fake.address().port}`, maxRetries: 0 });
const service = http.createServer(createApp(loadConfig({ ALLOWED_ORIGIN: SITE }), client, () => {}));
await new Promise(r => service.listen(8791, '127.0.0.1', r));
const endpoint = 'http://127.0.0.1:8791';

const problems = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', e => problems.push('pageerror ' + e.message));
const sent = [];
page.on('request', r => { if (r.url().startsWith(endpoint)) sent.push({ method: r.method(), body: r.postData() }); });
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION/.test(m.text())) problems.push('console ' + m.text()); });

await page.goto(SITE + '/#/writing/w-israel-1/write');
await page.waitForSelector('#draft');
await page.fill('#draft', ANSWER);
await page.goto(SITE + '/#/writing/w-israel-1/send');
console.log('h1:', (await page.textContent('h1')).trim());
await page.click('button:has-text("Get feedback")');
await page.waitForSelector('.feedback h3');
console.log('worked items:', await page.$$eval('ul.worked li', l => l.length), '| quotes:', await page.$$eval('ul.worked blockquote', l => l.map(x => x.textContent)));
console.log('try:', (await page.textContent('.try-example')).trim());
console.log('marks hidden before click:', !(await page.$('.score-box')));
await page.click('button:has-text("Show my marks")');
console.log('marks:', (await page.textContent('.score-box')).replace(/\s+/g, ' ').slice(0, 130));
const payload = JSON.parse(sent.find(s => s.method === 'POST').body);
console.log('payload keys:', Object.keys(payload).sort().join(','));
console.log('payload has name/other personal data:', JSON.stringify(payload).toLowerCase().includes('name'));
await page.goto(SITE + '/#/progress'); await page.waitForSelector('.log-table');
console.log('logged in progress:', (await page.$$eval('.log-table tbody tr', r => r.length)) + ' row(s)');
// reload: saved feedback comes back, marks hidden again
await page.goto(SITE + '/#/writing/w-israel-1/send'); await page.reload(); await page.waitForSelector('.feedback h3');
console.log('saved feedback after reload:', !!(await page.$('ul.worked')), '| marks hidden again:', !(await page.$('.score-box')));
// edit draft -> stale note
await page.goto(SITE + '/#/writing/w-israel-1/write'); await page.fill('#draft', ANSWER + ' Thank you.');
await page.goto(SITE + '/#/writing/w-israel-1/send'); await page.waitForSelector('.feedback h3');
console.log('stale note shown:', /changed your writing/.test(await page.textContent('.feedback')));
// phone width
const ph = await (await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 })).newPage();
await ph.goto(SITE + '/#/writing/w-israel-1/write'); await ph.fill('#draft', ANSWER); await ph.goto(SITE + '/#/writing/w-israel-1/send');
console.log('phone overflow px:', await ph.evaluate(() => document.documentElement.scrollWidth - innerWidth));
await page.screenshot({ path: process.argv[2] + '/feedback-desktop.png', fullPage: true });
// service down
await new Promise(r => { service.closeAllConnections(); service.close(r); });
await page.goto(SITE + '/#/writing/w-israel-1/write'); await page.fill('#draft', ANSWER + ' Again.');
await page.goto(SITE + '/#/writing/w-israel-1/send');
await page.click('button:has-text("Get new feedback")');
await page.waitForFunction(() => /Could not reach/.test(document.querySelector('.status').textContent));
console.log('service down message:', (await page.textContent('.status')).trim());
console.log('button usable again:', await page.isEnabled('button:has-text("Get new feedback")'));
console.log('copy still there:', !!(await page.$('button:has-text("Copy")')));
await browser.close(); fake.close();
console.log('PROBLEMS:', problems.length ? problems : 'none');
process.exit(0);
