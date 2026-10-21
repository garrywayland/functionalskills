// The data store, in memory. The file store extends it, and the Firestore store has the same methods.
// Every method is async so the real database can be swapped in without changing any other code.
import { randomId, isoNow } from '../util.js';

export class MemoryStore {
  constructor() {
    this.users = new Map();
    this.emails = new Map();       // email -> uid
    this.tokens = new Map();       // hash -> { email, exp }
    this.syncs = new Map();        // uid -> { data, updatedAt }
    this.counters = new Map();     // key -> number
    this.invites = new Map();      // hash -> { learnerId, exp }
    this.links = new Map();        // id -> link
    this.codes = new Map();        // hash -> { days, maxUses, uses, exp, label }
    this.events = new Set();       // processed payment event ids
    this.kind = 'memory';
  }

  async changed() { /* the file store saves here */ }

  // ----- users -----
  async getUser(id) { const u = this.users.get(id); return u ? structuredClone(u) : null; }
  async getUserByEmail(email) { const id = this.emails.get(email); return id ? this.getUser(id) : null; }
  async getUserByStripeCustomer(cid) {
    for (const u of this.users.values()) if (u.stripeCustomerId === cid) return structuredClone(u);
    return null;
  }
  async createUser(email) {
    if (this.emails.has(email)) return this.getUserByEmail(email);
    const user = { id: randomId(), email, createdAt: isoNow(), plan: null, stripeCustomerId: null, stripeSubscriptionId: null, sessionVersion: 1 };
    this.users.set(user.id, user); this.emails.set(email, user.id);
    await this.changed();
    return structuredClone(user);
  }
  async updateUser(id, patch) {
    const u = this.users.get(id);
    if (!u) return null;
    Object.assign(u, structuredClone(patch));
    await this.changed();
    return structuredClone(u);
  }
  async deleteUser(id) {
    const u = this.users.get(id);
    if (!u) return;
    this.users.delete(id); this.emails.delete(u.email); this.syncs.delete(id);
    for (const [k] of this.counters) if (k.includes(':' + id + ':')) this.counters.delete(k);
    await this.changed();
  }

  // ----- sign-in tokens (one use) -----
  async putToken(hash, rec) { this.tokens.set(hash, structuredClone(rec)); await this.changed(); }
  async takeToken(hash) {
    const rec = this.tokens.get(hash);
    if (!rec) return null;
    this.tokens.delete(hash);
    await this.changed();
    return structuredClone(rec);
  }
  async purgeTokens(now = Date.now()) {
    for (const [h, r] of this.tokens) if (r.exp < now) this.tokens.delete(h);
    await this.changed();
  }

  // ----- synced progress (one document per user) -----
  async getSync(uid) { const s = this.syncs.get(uid); return s ? structuredClone(s) : null; }
  async putSync(uid, doc) { this.syncs.set(uid, structuredClone(doc)); await this.changed(); }
  async deleteSync(uid) { this.syncs.delete(uid); await this.changed(); }

  // ----- counters (usage, daily caps) -----
  async incr(key, n = 1) { const v = (this.counters.get(key) || 0) + n; this.counters.set(key, v); await this.changed(); return v; }
  async getCount(key) { return this.counters.get(key) || 0; }

  // ----- family links -----
  async putInvite(hash, rec) { this.invites.set(hash, structuredClone(rec)); await this.changed(); }
  async takeInvite(hash) {
    const rec = this.invites.get(hash);
    if (!rec) return null;
    this.invites.delete(hash); await this.changed();
    return structuredClone(rec);
  }
  async createLink(link) { this.links.set(link.id, structuredClone(link)); await this.changed(); return structuredClone(link); }
  async getLink(id) { const l = this.links.get(id); return l ? structuredClone(l) : null; }
  async updateLink(id, patch) { const l = this.links.get(id); if (!l) return null; Object.assign(l, patch); await this.changed(); return structuredClone(l); }
  async deleteLink(id) { this.links.delete(id); await this.changed(); }
  async listLinks(role, uid) {
    const field = role === 'learner' ? 'learnerId' : 'parentId';
    return [...this.links.values()].filter((l) => l[field] === uid).map((l) => structuredClone(l));
  }
  async deleteLinksFor(uid) {
    for (const [id, l] of this.links) if (l.learnerId === uid || l.parentId === uid) this.links.delete(id);
    for (const [h, i] of this.invites) if (i.learnerId === uid) this.invites.delete(h);
    await this.changed();
  }

  // ----- promo codes -----
  async putCode(hash, rec) { this.codes.set(hash, structuredClone(rec)); await this.changed(); }
  async getCode(hash) { const c = this.codes.get(hash); return c ? structuredClone(c) : null; }
  // Uses one redemption if the code is valid. Returns the code, or null if unknown, expired or used up.
  async useCode(hash, now = Date.now()) {
    const c = this.codes.get(hash);
    if (!c) return null;
    if (c.exp && Date.parse(c.exp) < now) return null;
    if (c.maxUses && c.uses >= c.maxUses) return null;
    c.uses = (c.uses || 0) + 1;
    await this.changed();
    return structuredClone(c);
  }

  // ----- payment events seen (so a repeat delivery does nothing) -----
  async firstTimeEvent(id) {
    if (this.events.has(id)) return false;
    this.events.add(id);
    await this.changed();
    return true;
  }

  async close() {}
}
