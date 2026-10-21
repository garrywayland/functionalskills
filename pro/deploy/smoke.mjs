#!/usr/bin/env node
// After deploying (or starting locally), check the basics.   node deploy/smoke.mjs https://your-site.example
const base = (process.argv[2] || 'http://localhost:8080').replace(/\/+$/, '');
let bad = 0;
const check = (c, m) => { if (!c) bad++; console.log(c ? 'ok  ' : 'FAIL', m); };
const get = async (p, init) => { const r = await fetch(base + p, init); return { r, text: await r.text() }; };

const health = await get('/api/health'); check(health.r.status === 200, 'health answers');
const home = await get('/'); check(home.r.status === 200 && /<title>/.test(home.text), 'the website loads');
const csp = home.r.headers.get('content-security-policy') || '';
check(/default-src 'self'/.test(csp) && !/unsafe-inline|unsafe-eval/.test(csp), 'the content security policy is strict');
check(home.r.headers.get('x-frame-options') === 'DENY' && home.r.headers.get('x-content-type-options') === 'nosniff', 'security headers are set');
if (base.startsWith('https://')) check(/max-age/.test(home.r.headers.get('strict-transport-security') || ''), 'HTTPS is enforced (HSTS)');
const me = JSON.parse((await get('/api/me')).text); check(me.signedIn === false && typeof me.features === 'object', 'the account service answers');
const content = JSON.parse((await get('/api/content')).text);
const locked = content.reading.missions.filter((m) => m.locked).length;
check(content.reading.missions.length > 0 && !content.entitled, `lessons are served (${content.reading.missions.length} reading, ${locked} locked for visitors)`);
check(content.reading.missions.filter((m) => m.locked).every((m) => !m.texts && !m.questions) && content.writing.missions.filter((m) => m.locked).every((m) => !m.bullets && !m.indicative), 'locked lessons are not sent to visitors');
check((await get('/api/sync')).r.status === 401, 'saved work needs a sign-in');
check((await get('/api/mark', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).r.status === 403, 'marking refuses requests that did not come from the site');
check((await get('/../package.json')).r.status === 404, 'files outside the website are not served');
const dev = await get('/api/auth/request', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NS': '1' }, body: JSON.stringify({ email: 'smoke-test@invalid.example' }) });
check(!/devLink/.test(dev.text), 'sign-in links are never shown on screen (development mode is off)');
console.log(me.features.marking ? 'Marking is switched on.' : 'Marking is off.', me.features.payments ? 'Payments are switched on.' : 'Payments are off.');
process.exit(bad ? 1 : 0);
