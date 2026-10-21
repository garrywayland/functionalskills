// Progress sync. The browser sends everything it has; the server merges it with what it holds, using the
// same rules as "Restore from a file" (nothing is lost, the newest copy of the same thing wins), saves the
// result and sends it back. Two devices converge without anyone choosing which one is right.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, isoNow } from './util.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const B = require(path.join(here, '..', 'web', 'js', 'backup.js'));

export function makeSync({ cfg, store }) {
  return {
    async get(uid) {
      const s = await store.getSync(uid);
      return { data: s ? s.data : {}, updatedAt: s ? s.updatedAt : null };
    },

    async merge(uid, incomingRaw) {
      if (!incomingRaw || typeof incomingRaw !== 'object' || Array.isArray(incomingRaw)) throw new HttpError(400, 'That did not look right.');
      const parsed = B.parse(JSON.stringify({ app: B.APP, version: B.VERSION, saved: '', data: incomingRaw }));
      if (!parsed.ok) throw new HttpError(400, 'That did not look right.');
      const existing = (await store.getSync(uid))?.data || {};
      const { changes } = B.merge(existing, parsed.data);
      const result = { ...existing, ...changes };
      if (JSON.stringify(result).length > cfg.maxSyncBytes) throw new HttpError(413, 'There is too much saved to sync. Please download a copy of your work and clear out old packs.');
      let updatedAt = (await store.getSync(uid))?.updatedAt || null;
      if (Object.keys(changes).length || !updatedAt) { updatedAt = isoNow(); await store.putSync(uid, { data: result, updatedAt }); }
      return { data: result, updatedAt, skipped: parsed.skipped };
    },
  };
}
