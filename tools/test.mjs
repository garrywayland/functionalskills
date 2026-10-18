// Tests for the drafting tools. They use a FAKE Anthropic server and a temporary copy of the content,
// so they cost nothing and change nothing.   Run with:  npm test   (inside the tools folder)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function tempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextstop-tools-'));
  fs.cpSync(path.join(repo, 'content'), path.join(dir, 'content'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.copyFileSync(path.join(repo, 'docs', 'exam-notes.md'), path.join(dir, 'docs', 'exam-notes.md'));
  return dir;
}

// A fake Anthropic server. `state.drafts` is a list of missions to hand out, one per drafting call.
async function startFake(state) {
  state.calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = JSON.parse(body);
      state.calls.push(json);
      const system = String(json.system || '');
      let text;
      if (/write careful, original/.test(system)) {
        const m = state.drafts[Math.min(state.draftCalls = (state.draftCalls || 0) + 1, state.drafts.length) - 1];
        text = '```json\n' + JSON.stringify(m) + '\n```';
      } else if (/ONLY the texts/.test(system)) {
        const answers = state.mission.questions.filter((q) => q.type === 'choice' || q.type === 'multi').map((q, i) => {
          let chosen = Array.isArray(q.answer) ? [...q.answer] : [q.answer];
          if (state.corrupt && i === 0) chosen = [(chosen[0] + 1) % q.options.length];
          return { id: q.id, chosen };
        });
        text = JSON.stringify({ answers });
      } else {
        text = JSON.stringify({ issues: state.reviewIssues || [], facts_to_check: [{ claim: 'Giant pandas eat mostly bamboo.', confidence: 'certain' }], level_ok: true, level_comment: 'Fine for Level 1.', originality_comment: 'Looks original.' });
      }
      const message = { id: 'msg_t', type: 'message', role: 'assistant', model: json.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
      if (json.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const ev = (name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
        ev('message_start', { type: 'message_start', message: { ...message, content: [], stop_reason: null } });
        ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
        ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
        ev('content_block_stop', { type: 'content_block_stop', index: 0 });
        ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } });
        ev('message_stop', { type: 'message_stop' });
        res.end();
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(message));
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  state.url = `http://127.0.0.1:${server.address().port}`;
  state.close = () => new Promise((r) => { server.closeAllConnections(); server.close(r); });
  return state;
}

function run(script, args, { root, fake }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, script), ...args], {
      cwd: root, env: { ...process.env, NEXTSTOP_ROOT: root, ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: fake ? fake.url : 'http://127.0.0.1:1' },
    });
    let out = ''; let err = '';
    child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

const good = () => structuredClone(readJson(path.join(repo, 'content', 'reading-long.json')).missions.find((m) => m.id === 'rl-pandas-2'));

test('draft: repairs a draft that fails the checks, then saves it', async () => {
  const root = tempRoot();
  const bad = good(); bad.texts[0].body = [{ p: 'Far too short.' }];
  const fake = await startFake({ drafts: [bad, good()] });
  const r = await run('draft.mjs', ['reading-long', '--topic', 'Pandas', '--feature', 'text box'], { root, fake });
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /Text A has \d+ words/);
  assert.equal(fake.draftCalls, 2);
  const secondUser = fake.calls[1].messages.at(-1).content;
  assert.match(String(secondUser), /automatic checks found these problems/);
  assert.match(String(fake.calls[0].messages[0].content), /GIANT pandas only/);
  const saved = readJson(path.join(root, 'drafts', 'rl-pandas-3.json'));
  assert.equal(saved.mission.id, 'rl-pandas-3');
  assert.deepEqual(saved.mission.levels, ['L1']);
  await fake.close();
});

test('draft: refuses an unknown topic and gives up cleanly when it cannot pass the checks', async () => {
  const root = tempRoot();
  let r = await run('draft.mjs', ['reading-long', '--topic', 'Football'], { root });
  assert.equal(r.code, 1);
  const bad = good(); bad.texts[0].body = [{ p: 'Too short.' }];
  const fake = await startFake({ drafts: [bad] });
  r = await run('draft.mjs', ['reading-long', '--topic', 'Pandas'], { root, fake });
  assert.equal(r.code, 1);
  assert.match(r.err, /Nothing was saved/);
  assert.ok(!fs.existsSync(path.join(root, 'drafts', 'rl-pandas-3.json')));
  await fake.close();
});

test('draft: writing tasks work too', async () => {
  const root = tempRoot();
  const w = structuredClone(readJson(path.join(repo, 'content', 'writing.json')).missions.find((m) => m.id === 'w-pandas-2'));
  const fake = await startFake({ drafts: [w] });
  const r = await run('draft.mjs', ['writing', '--topic', 'Pandas', '--task', '2', '--format', 'review'], { root, fake });
  assert.equal(r.code, 0, r.err + r.out);
  assert.ok(fs.existsSync(path.join(root, 'drafts', 'w-pandas-t2.json')));
  await fake.close();
});

test('review: passes a good draft, and catches a key the independent reader disagrees with', async () => {
  const root = tempRoot();
  const m = good(); m.id = 'rl-pandas-3';
  fs.mkdirSync(path.join(root, 'drafts'));
  const file = path.join(root, 'drafts', 'rl-pandas-3.json');
  fs.writeFileSync(file, JSON.stringify({ kind: 'reading-long', mission: m }));
  let fake = await startFake({ mission: m });
  let r = await run('review.mjs', [file], { root, fake });
  assert.equal(r.code, 0, r.err + r.out);
  assert.equal(readJson(file.replace('.json', '.review.json')).verdict, 'pass');
  assert.ok(!JSON.stringify(fake.calls[0]).includes('"why"'), 'the blind step must not see the answer key or explanations');
  await fake.close();

  fake = await startFake({ mission: m, corrupt: true });
  r = await run('review.mjs', [file], { root, fake });
  const review = readJson(file.replace('.json', '.review.json'));
  assert.equal(review.verdict, 'fix');
  assert.ok(review.issues.some((i) => i.severity === 'must' && /independent reader/.test(i.problem)));
  await fake.close();
});

test('merge: needs --i-have-read-it and a passing review, then adds the mission', async () => {
  const root = tempRoot();
  const m = good(); m.id = 'rl-pandas-3';
  fs.mkdirSync(path.join(root, 'drafts'));
  const file = path.join(root, 'drafts', 'rl-pandas-3.json');
  fs.writeFileSync(file, JSON.stringify({ kind: 'reading-long', mission: m }));
  let r = await run('merge.mjs', [file], { root });
  assert.equal(r.code, 1); assert.match(r.err, /Read the draft first/);
  r = await run('merge.mjs', [file, '--i-have-read-it'], { root });
  assert.equal(r.code, 1); assert.match(r.err, /no review yet/);
  fs.writeFileSync(file.replace('.json', '.review.json'), JSON.stringify({ verdict: 'fix', issues: [] }));
  r = await run('merge.mjs', [file, '--i-have-read-it'], { root });
  assert.equal(r.code, 1); assert.match(r.err, /must be fixed/);
  fs.writeFileSync(file.replace('.json', '.review.json'), JSON.stringify({ verdict: 'pass', issues: [] }));
  r = await run('merge.mjs', [file, '--i-have-read-it'], { root });
  assert.equal(r.code, 0, r.err + r.out);
  const ms = readJson(path.join(root, 'content', 'reading-long.json')).missions;
  const at = ms.findIndex((x) => x.id === 'rl-pandas-3');
  assert.ok(at > 0 && ms[at - 1].topic === 'Pandas' && (!ms[at + 1] || ms[at + 1].topic !== 'Pandas'), 'kept with its topic, after the last Pandas mission');
  r = await run('merge.mjs', [file, '--i-have-read-it'], { root });
  assert.equal(r.code, 1); assert.match(r.err, /already in the content/);
});

test('import: checks a pack, adds it as a hidden draft, then approves it', async () => {
  const root = tempRoot();
  const pack = path.join(repo, 'docs', 'import', 'example-pack.json');
  let r = await run('import.mjs', [pack, '--check-only'], { root });
  assert.equal(r.code, 0, r.err + r.out);
  assert.deepEqual(readJson(path.join(root, 'content', 'index.json')).packs, [], 'check-only changes nothing');
  r = await run('import.mjs', [pack], { root });
  assert.equal(r.code, 0, r.err + r.out);
  assert.deepEqual(readJson(path.join(root, 'content', 'index.json')).packs, ['packs/football-example.json']);
  const saved = readJson(path.join(root, 'content', 'packs', 'football-example.json'));
  assert.ok([...saved.reading, ...saved.writing].every((m) => m.status === 'draft'));
  r = await run('import.mjs', [pack], { root });
  assert.equal(r.code, 1); assert.match(r.err, /already imported/);
  r = await run('import.mjs', ['--approve', 'football-example'], { root });
  assert.equal(r.code, 0);
  const approved = readJson(path.join(root, 'content', 'packs', 'football-example.json'));
  assert.ok([...approved.reading, ...approved.writing].every((m) => m.status === undefined));
  r = await run('import.mjs', ['--remove', 'football-example'], { root });
  assert.equal(r.code, 0);
  assert.equal(fs.existsSync(path.join(root, 'content', 'packs', 'football-example.json')), false);
});

test('import: refuses a bad pack with plain reasons and changes nothing', async () => {
  const root = tempRoot();
  const bad = readJson(path.join(repo, 'docs', 'import', 'example-pack.json'));
  bad.reading[0].topic = 'Knitting';              // unknown theme
  bad.reading[0].questions[1].answer = 9;         // answer out of range
  bad.writing[0].id = 'w-pandas-1';               // id already used
  const file = path.join(root, 'bad.json');
  fs.writeFileSync(file, 'Here you go!\n```json\n' + JSON.stringify(bad) + '\n```');   // wrapped in chat text, like an AI reply
  const r = await run('import.mjs', [file], { root });
  assert.equal(r.code, 1);
  assert.match(r.err, /not a known theme/); assert.match(r.err, /answer index out of range/); assert.match(r.err, /already used/);
  assert.deepEqual(readJson(path.join(root, 'content', 'index.json')).packs, []);
  // a new theme can be added in the same step
  bad.reading[0].topic = 'Knitting'; bad.reading[0].questions[1].answer = 2; bad.writing[0].id = 'w-knit-1'; bad.writing[0].topic = 'Knitting';
  fs.writeFileSync(file, JSON.stringify(bad));
  let r2 = await run('import.mjs', [file, '--add-theme', 'Knitting'], { root });
  assert.equal(r2.code, 1); assert.match(r2.err, /one-line description/);
  r2 = await run('import.mjs', [file, '--add-theme', 'Knitting', '--blurb', 'Wool and patterns.'], { root });
  assert.equal(r2.code, 0, r2.err + r2.out);
  assert.ok(readJson(path.join(root, 'content', 'themes.json')).themes.some((t) => t.name === 'Knitting'));
});
