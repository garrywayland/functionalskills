#!/usr/bin/env node
// Small admin tool, run by you (in Cloud Shell, or on your computer with DATA_STORE=file).
//   node server/admin.mjs grant someone@example.com 90        give 90 days of Plus
//   node server/admin.mjs revoke someone@example.com          end Plus now
//   node server/admin.mjs user someone@example.com            show their plan
//   node server/admin.mjs code new --days 30 --uses 20 --label "Tutor pilot"   make a promo code (printed once)
import crypto from 'node:crypto';
import { loadConfig } from './config.js';
import { openStore } from './store/index.js';
import { normaliseEmail, sha256 } from './util.js';
import { extend, planSummary, revoke } from './entitlements.js';

const [cmd, ...rest] = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < rest.length; i++) { if (rest[i].startsWith('--')) { flags[rest[i].slice(2)] = rest[i + 1]; i++; } else pos.push(rest[i]); }
const cfg = loadConfig();
const store = await openStore(cfg);
const fail = (m) => { console.error(m); process.exit(1); };

try {
  if (cmd === 'grant' || cmd === 'revoke' || cmd === 'user') {
    const email = normaliseEmail(pos[0]); if (!email) fail('Give a valid email address.');
    let user = await store.getUserByEmail(email);
    if (!user && cmd === 'grant') user = await store.createUser(email);
    if (!user) fail('No account with that email yet.');
    if (cmd === 'grant') {
      const days = Number(pos[1]); if (!(days > 0 && days <= 3650)) fail('Give a number of days, for example 90.');
      const plan = extend(user, days, 'admin', { renews: false });
      await store.updateUser(user.id, { plan }); user = await store.getUser(user.id);
    }
    if (cmd === 'revoke') { await store.updateUser(user.id, { plan: revoke(user.plan) }); user = await store.getUser(user.id); }
    console.log(JSON.stringify({ email: user.email, plan: planSummary(user) }, null, 2));
  } else if (cmd === 'code' && pos[0] === 'new') {
    const days = Number(flags.days); const uses = Number(flags.uses || 1);
    if (!(days > 0 && days <= 3650)) fail('Give --days, for example --days 30.');
    const code = flags.code ? String(flags.code).toUpperCase().replace(/[^A-Z0-9]/g, '') : [...crypto.randomBytes(12)].map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
    if (code.length < 8) fail('A code needs at least 8 letters or numbers, so it cannot be guessed. Leave out --code to get a random one.');
    await store.putCode(sha256(code), { days, maxUses: uses, uses: 0, label: flags.label || '', exp: flags.expires ? new Date(flags.expires).toISOString() : null });
    console.log(`Code: ${code}\nGives ${days} days of Plus, up to ${uses} time${uses === 1 ? '' : 's'}. Only the hash is stored, so write the code down now.`);
  } else fail('Commands: grant <email> <days> | revoke <email> | user <email> | code new --days N [--uses N] [--label text] [--code CODE] [--expires YYYY-MM-DD]');
} finally { await store.close(); }
