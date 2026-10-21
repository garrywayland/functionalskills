// A parent (or tutor) can see a learner's progress, only if the learner shares it.
//  - The learner makes a one-time code that lasts a week.
//  - The parent signs in with their own email and enters the code.
//  - The parent sees progress only (what was done and when). The learner can choose to share her writing too,
//    and can stop sharing at any time. Either side can remove the link.
import crypto from 'node:crypto';
import { HttpError, sha256, randomId, isoNow, maskEmail } from './util.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PARENTS = 4;
const MAX_LEARNERS = 20;

function newCode() {
  let s = '';
  for (const b of crypto.randomBytes(10)) s += ALPHABET[b % ALPHABET.length];
  return s;
}
const display = (c) => c.slice(0, 5) + '-' + c.slice(5);
const clean = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const dayStr = (d) => d.toISOString().slice(0, 10);

export function makeFamily({ store, content, limiter }) {
  function summarise(data, withWriting) {
    const log = Array.isArray(data.log) ? data.log : [];
    const done = data.done && typeof data.done === 'object' ? data.done : {};
    const byLevel = {};
    for (const lvl of ['L1', 'L2']) {
      const ids = Object.keys(done[lvl] || {}).filter((k) => done[lvl][k]);
      byLevel[lvl] = {
        reading: ids.filter((i) => content.mission('reading', i)).length,
        writing: ids.filter((i) => content.mission('writing', i)).length,
        practice: ids.filter((i) => i.startsWith('tool-') || i.startsWith('learn-')).length,
      };
    }
    const themes = {};
    for (const lvl of Object.keys(done)) for (const id of Object.keys(done[lvl] || {})) { const t = content.themeOf(id); if (t) themes[t] = (themes[t] || 0) + 1; }
    const days = {};
    const since = Date.now() - 28 * 86400_000;
    for (const e of log) if (Date.parse(e.date) >= since) days[e.date] = (days[e.date] || 0) + 1;
    const recent = log.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 12)
      .map((e) => ({ date: e.date, kind: e.kind, title: String(e.title || '').slice(0, 120), level: e.level, topic: e.topic || '' }));
    const out = {
      byLevel, themes, activeDaysLast28: Object.keys(days).length, perDay: days, recent,
      lastActive: log.length ? log.map((e) => e.date).sort().pop() : null, totalFinished: log.length,
    };
    if (withWriting) {
      out.writing = [];
      for (const [key, rec] of Object.entries(data)) {
        const m = key.match(/^writing:([A-Za-z0-9_-]+):(L1|L2)$/);
        if (!m || !rec || typeof rec.draft !== 'string' || !rec.draft.trim()) continue;
        const mission = content.mission('writing', m[1]);
        out.writing.push({ id: m[1], level: m[2], title: mission ? mission.title : 'A writing task', words: rec.draft.trim().split(/\s+/).length, text: rec.draft.slice(0, 8000), updated: rec.t || 0 });
      }
      out.writing.sort((a, b) => b.updated - a.updated);
    }
    return out;
  }

  return {
    async invite(user) {
      const mine = await store.listLinks('learner', user.id);
      if (mine.length >= MAX_PARENTS) throw new HttpError(400, `You can share with up to ${MAX_PARENTS} people. Remove one first.`);
      const code = newCode();
      await store.putInvite(sha256(code), { learnerId: user.id, exp: Date.now() + 7 * 86400_000 });
      return { code: display(code), expiresInDays: 7 };
    },

    async accept(user, codeRaw) {
      if (!limiter.allow('accept:' + user.id, 10, 3600_000)) throw new HttpError(429, 'Too many tries. Please wait a little and try again.');
      const code = clean(codeRaw);
      if (code.length !== 10) throw new HttpError(400, 'That code does not look right. It has ten letters and numbers.');
      const rec = await store.takeInvite(sha256(code));
      if (!rec || rec.exp < Date.now()) throw new HttpError(400, 'That code has expired or been used. Ask the learner for a new one.');
      if (rec.learnerId === user.id) throw new HttpError(400, 'That is your own code. Give it to the person you want to share with.');
      const existing = (await store.listLinks('parent', user.id));
      if (existing.some((l) => l.learnerId === rec.learnerId)) return { already: true };
      if (existing.length >= MAX_LEARNERS) throw new HttpError(400, 'You are already linked to the most learners we allow.');
      await store.createLink({ id: randomId(), learnerId: rec.learnerId, parentId: user.id, createdAt: isoNow(), shareWriting: false });
      return { linked: true };
    },

    async list(user) {
      const asLearner = await store.listLinks('learner', user.id);
      const asParent = await store.listLinks('parent', user.id);
      return {
        asLearner: await Promise.all(asLearner.map(async (l) => ({ id: l.id, with: (await store.getUser(l.parentId))?.email || 'a deleted account', shareWriting: !!l.shareWriting, since: l.createdAt }))),
        asParent: await Promise.all(asParent.map(async (l) => {
          const u = await store.getUser(l.learnerId);
          const s = await store.getSync(l.learnerId);
          const last = s && Array.isArray(s.data.log) && s.data.log.length ? s.data.log.map((e) => e.date).sort().pop() : null;
          return { id: l.id, learner: u ? maskEmail(u.email) : 'a deleted account', shareWriting: !!l.shareWriting, since: l.createdAt, lastActive: last };
        })),
      };
    },

    async setShareWriting(user, id, on) {
      const l = await store.getLink(id);
      if (!l || l.learnerId !== user.id) throw new HttpError(404, 'Not found.');
      await store.updateLink(id, { shareWriting: !!on });
      return { ok: true };
    },

    async remove(user, id) {
      const l = await store.getLink(id);
      if (!l || (l.learnerId !== user.id && l.parentId !== user.id)) throw new HttpError(404, 'Not found.');
      await store.deleteLink(id);
      return { ok: true };
    },

    async summary(user, id) {
      const l = await store.getLink(id);
      if (!l || l.parentId !== user.id) throw new HttpError(404, 'Not found.');
      const s = await store.getSync(l.learnerId);
      const u = await store.getUser(l.learnerId);
      return { learner: u ? maskEmail(u.email) : 'a deleted account', shareWriting: !!l.shareWriting, summary: summarise(s ? s.data : {}, !!l.shareWriting), readOnly: true };
    },
    summarise,
    dayStr,
  };
}
