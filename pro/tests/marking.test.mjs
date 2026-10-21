import test from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { startApp, client, signIn, makePlus, fakeServer } from './helpers.mjs';
import { loadConfig, checkConfig } from '../server/config.js';
import { makeProvider, makeMarker } from '../server/marking/index.js';
import { buildUser, buildSystem } from '../server/marking/prompts.js';

const ANSWER = 'Dear Sam, I am writing to apply to be a volunteer. I love pandas and I would be very happy to help. I am free on Saturdays and I can bring my own gloves.';
const payload = (over = {}) => ({
  level: 'L1', task: 1, format: 'Email', context: 'A wildlife park is looking for volunteers.', audience: 'The volunteer coordinator.',
  purpose: 'To apply to volunteer.', instruction: 'Write an email applying to be a volunteer.',
  bullets: ['why you want to volunteer', 'the skills you would bring', 'when you are available'], answer: ANSWER, ...over,
});

async function plusUser(ctx, email = 'plus@example.com') { const c = await signIn(ctx, email); await makePlus(ctx, email); return c; }

test('marking needs a sign-in and the paid plan', async () => {
  const ctx = await startApp();
  assert.equal((await client(ctx.base).post('/api/mark', payload())).status, 401);
  const free = await signIn(ctx, 'free@example.com');
  const r = await free.post('/api/mark', payload());
  assert.equal(r.status, 402); assert.equal(r.json.code, 'plus_required');
  await ctx.close();
});

test('a paying learner gets feedback, shaped for the page, with a real quote', async () => {
  const ctx = await startApp(); const c = await plusUser(ctx);
  const r = await c.post('/api/mark', payload());
  assert.equal(r.status, 200); assert.equal(r.json.ok, true);
  const f = r.json.feedback;
  assert.equal(f.composition.max, 12); assert.equal(f.spag.max, 9);
  assert.equal(f.worked.length, 2); assert.ok(ANSWER.includes(f.worked[0].quote));
  assert.ok(f.target.what && f.target.example);
  assert.deepEqual(r.json.quota, { used: 1, limit: 40 });
  assert.equal((await c.get('/api/me')).json.quota.used, 1);
  await ctx.close();
});

test('monthly allowance: counted, refused when used up, and failures cost nothing', async () => {
  const ctx = await startApp({ QUOTA_MONTHLY_MARKS: '2' }); const c = await plusUser(ctx);
  assert.equal((await c.post('/api/mark', payload({ answer: ANSWER + ' TRIGGER_DOWN' }))).status, 502);
  assert.equal((await c.post('/api/mark', payload({ answer: ANSWER + ' TRIGGER_BUSY' }))).status, 503);
  assert.equal((await c.post('/api/mark', payload({ answer: ANSWER + ' TRIGGER_REFUSAL' }))).json.reason, 'declined');
  assert.equal((await c.get('/api/me')).json.quota.used, 0, 'errors and refusals are not charged');
  assert.equal((await c.post('/api/mark', payload())).status, 200);
  assert.equal((await c.post('/api/mark', payload())).status, 200);
  const r = await c.post('/api/mark', payload());
  assert.equal(r.status, 429); assert.equal(r.json.code, 'quota'); assert.match(r.json.error, /next month|Copy/);
  assert.equal((await c.get('/api/me')).json.quota.used, 2, 'a refused request is not counted');
  await ctx.close();
});

test('an overall daily limit protects the budget, and an hourly limit protects against runaway use', async () => {
  const ctx = await startApp({ MARKS_DAILY_CAP: '2', QUOTA_MONTHLY_MARKS: '50' });
  const a = await plusUser(ctx, 'a@example.com'); const b = await plusUser(ctx, 'b@example.com');
  assert.equal((await a.post('/api/mark', payload())).status, 200);
  assert.equal((await b.post('/api/mark', payload())).status, 200);
  const r = await a.post('/api/mark', payload()); assert.equal(r.status, 429); assert.equal(r.json.code, 'daily_cap');
  await ctx.close();
  const ctx2 = await startApp({ MARKS_PER_USER_PER_HOUR: '2' }); const c = await plusUser(ctx2);
  await c.post('/api/mark', payload()); await c.post('/api/mark', payload());
  assert.equal((await c.post('/api/mark', payload())).status, 429);
  await ctx2.close();
});

test('bad or extra input is refused before anything is spent', async () => {
  const ctx = await startApp(); const c = await plusUser(ctx);
  for (const bad of [{ answer: '   ' }, { level: 'L3' }, { name: 'A Learner' }, { answer: 'x'.repeat(6001) }, { bullets: [] }]) assert.equal((await c.post('/api/mark', payload(bad))).status, 400, JSON.stringify(Object.keys(bad)));
  assert.equal((await c.get('/api/me')).json.quota.used, 0);
  await ctx.close();
});

test('the learner\'s writing and the emails are never logged', async () => {
  const ctx = await startApp(); const c = await plusUser(ctx);
  await c.post('/api/mark', payload());
  const all = ctx.logs.join('\n');
  assert.ok(!all.includes('volunteer') && !all.includes('gloves') && !all.includes('plus@example.com'));
  assert.match(all, /"msg":"marked"/);
  await ctx.close();
});

test('marking can be switched off, and the page is told', async () => {
  const ctx = await startApp({ MARKING_PROVIDER: 'off' }); const c = await plusUser(ctx);
  assert.equal((await c.post('/api/mark', payload())).status, 503);
  assert.equal((await c.get('/api/me')).json.features.marking, false);
  await ctx.close();
});

// ---------- the AI behind it can be switched ----------

const feedbackJson = { composition_mark: 7, spag_mark: 5, worked: [{ what: 'You opened clearly.', quote: 'I am writing to apply to be a volunteer' }, { what: 'You gave your availability.', quote: 'I am free on Saturdays' }], try_next: { what: 'Add a skill with an example.', example: 'For example: "I helped at my school fair."' } };

test('Claude: same prompt, structured answer, and a refusal is "declined"', async () => {
  const state = { mode: 'ok' };
  const fake = await fakeServer((req, res, body) => {
    const json = JSON.parse(body || '{}');
    const msg = (stop, text) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: json.model, content: text === null ? [] : [{ type: 'text', text }], stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 300 } })); };
    if (state.mode === 'refusal') return msg('refusal', null);
    if (state.mode === 'auth') { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'bad key' } })); }
    return msg('end_turn', JSON.stringify(feedbackJson));
  });
  const client = new Anthropic({ apiKey: 'sk-test', baseURL: fake.url, maxRetries: 0 });
  const cfg = loadConfig({ MARKING_PROVIDER: 'anthropic' });
  const marker = makeMarker(makeProvider(cfg, { anthropicClient: client }));
  const out = await marker.mark(payload());
  assert.equal(out.ok, true); assert.equal(out.feedback.composition.mark, 7);
  const sent = JSON.parse(fake.calls[0].body);
  assert.equal(sent.model, 'claude-sonnet-5-5'); assert.equal(sent.system, buildSystem());
  assert.ok(JSON.stringify(sent.messages).includes(ANSWER.slice(0, 40)));
  state.mode = 'refusal'; assert.deepEqual((await marker.mark(payload())).reason, 'declined');
  state.mode = 'auth';
  await assert.rejects(() => marker.mark(payload()), (e) => e.status === 500 && !/bad key/.test(e.message));
  await fake.close();
});

test('Gemini on Vertex: same prompt, JSON answer is checked, blocks become "declined"', async () => {
  const seen = []; let mode = 'ok';
  const genai = { models: { async generateContent(args) {
    seen.push(args);
    if (mode === 'blocked') return { promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: {} };
    if (mode === 'cut') return { candidates: [{ finishReason: 'MAX_TOKENS' }], text: '{"composition_mark":' };
    if (mode === 'junk') return { candidates: [{ finishReason: 'STOP' }], text: 'not json' };
    if (mode === 'quota') { const e = new Error('quota'); e.status = 429; throw e; }
    return { candidates: [{ finishReason: 'STOP' }], text: JSON.stringify(feedbackJson), usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 250 } };
  } } };
  const cfg = loadConfig({ MARKING_PROVIDER: 'vertex', VERTEX_PROJECT: 'p', VERTEX_MODEL: 'gemini-test' });
  const marker = makeMarker(makeProvider(cfg, { genai }));
  const out = await marker.mark(payload());
  assert.equal(out.ok, true); assert.equal(out.feedback.spag.mark, 5); assert.equal(out.usage.in, 900);
  assert.equal(seen[0].model, 'gemini-test'); assert.equal(seen[0].contents, buildUser(payload())); assert.equal(seen[0].config.systemInstruction, buildSystem());
  assert.equal(seen[0].config.responseMimeType, 'application/json'); assert.ok(seen[0].config.responseJsonSchema.properties.composition_mark);
  assert.equal(seen[0].config.responseJsonSchema.$schema, undefined);
  mode = 'blocked'; assert.equal((await marker.mark(payload())).reason, 'declined');
  mode = 'cut'; await assert.rejects(() => marker.mark(payload()), (e) => e.status === 502);
  mode = 'junk'; await assert.rejects(() => marker.mark(payload()), (e) => e.status === 502);
  mode = 'quota'; await assert.rejects(() => marker.mark(payload()), (e) => e.status === 503);
});

test('the whole service works with either AI behind it, and both give the same shape', async () => {
  const genai = { models: { async generateContent() { return { candidates: [{ finishReason: 'STOP' }], text: JSON.stringify(feedbackJson), usageMetadata: {} }; } } };
  const fake = await fakeServer((req, res, body) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'x', content: [{ type: 'text', text: JSON.stringify(feedbackJson) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } })); });
  const results = {};
  for (const [name, env, deps] of [
    ['anthropic', { MARKING_PROVIDER: 'anthropic' }, { anthropicClient: new Anthropic({ apiKey: 'k', baseURL: fake.url, maxRetries: 0 }) }],
    ['vertex', { MARKING_PROVIDER: 'vertex', VERTEX_PROJECT: 'p' }, { genai }],
  ]) {
    const ctx = await startApp(env, deps); const c = await plusUser(ctx);
    const r = await c.post('/api/mark', payload()); assert.equal(r.status, 200, name);
    results[name] = r.json.feedback; await ctx.close();
  }
  assert.deepEqual(results.anthropic, results.vertex);
  await fake.close();
});

test('settings that would be unsafe or broken stop the service starting', () => {
  const bad = (env) => checkConfig(loadConfig(env));
  assert.ok(bad({ NODE_ENV: 'production', DEV_MODE: '1' }).some((p) => /DEV_MODE/.test(p)));
  assert.ok(bad({ NODE_ENV: 'production', SESSION_SECRET: 'short' }).some((p) => /SESSION_SECRET/.test(p)));
  assert.ok(bad({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), BASE_URL: 'http://x.example', DATA_STORE: 'memory', MAILER: 'console', MARKING_PROVIDER: 'fake' }).length >= 4);
  assert.deepEqual(bad({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), BASE_URL: 'https://x.example', DATA_STORE: 'firestore', MAILER: 'resend', RESEND_API_KEY: 'k', MAIL_FROM: 'a@x.example', MARKING_PROVIDER: 'vertex', VERTEX_PROJECT: 'p' }), []);
  assert.ok(bad({ MARKING_PROVIDER: 'anthropic' }).some((p) => /ANTHROPIC_API_KEY/.test(p)) || process.env.ANTHROPIC_API_KEY);
  assert.ok(bad({ MARKING_PROVIDER: 'gemini' }).some((p) => /must be/.test(p)));
  assert.ok(bad({ STRIPE_SECRET_KEY: 'sk_x' }).some((p) => /WEBHOOK/.test(p)));
});
