import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startApp, signIn, client } from './helpers.mjs';

const admin = (dir, ...args) => spawnSync(process.execPath, [new URL('../server/admin.mjs', import.meta.url).pathname, ...args], { env: { ...process.env, DATA_STORE: 'file', DATA_DIR: dir }, encoding: 'utf8' });

test('the admin tool grants, revokes and makes codes, against the same data the site uses', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-admin-'));
  let r = admin(dir, 'grant', 'tutor@example.com', '90'); assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).plan.tier, 'plus');
  r = admin(dir, 'code', 'new', '--days', '30', '--uses', '3', '--label', 'Pilot', '--code', 'MYPILOT1'); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /MYPILOT1/);
  const ctx = await startApp({ DATA_STORE: 'file', DATA_DIR: dir });
  const t = await signIn(ctx, 'tutor@example.com'); assert.equal((await t.get('/api/me')).json.plan.tier, 'plus', 'the grant is visible on the site');
  const s = await signIn(ctx, 'student@example.com'); assert.equal((await s.post('/api/redeem', { code: 'mypilot1' })).status, 200);
  await ctx.close();
  r = admin(dir, 'revoke', 'tutor@example.com'); assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).plan.tier, 'free');
  assert.notEqual(admin(dir, 'grant', 'nope', '5').status, 0);
  assert.notEqual(admin(dir, 'grant', 'a@example.com', '-5').status, 0);
  assert.notEqual(admin(dir, 'user', 'ghost@example.com').status, 0);
  assert.notEqual(admin(dir, 'explode').status, 0);
});
