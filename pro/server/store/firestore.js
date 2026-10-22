// The same data store, on Google Cloud Firestore. Not covered by the offline tests: run the contract test
// against the Firestore emulator before trusting it (see pro/README.md, "Testing the database").
import { Firestore } from '@google-cloud/firestore';
import { randomId, isoNow, sha256 } from '../util.js';

const CHUNK = 400_000;   // a Firestore document is limited to about 1 MiB, so progress is split into pieces

export class FirestoreStore {
  constructor({ projectId } = {}) {
    this.kind = 'firestore';
    this.db = new Firestore(projectId ? { projectId } : {});
  }
  col(n) { return this.db.collection(n); }

  // ----- users -----
  async getUser(id) { const s = await this.col('users').doc(id).get(); return s.exists ? s.data() : null; }
  async getUserByEmail(email) {
    const s = await this.col('emails').doc(sha256(email)).get();
    return s.exists ? this.getUser(s.data().uid) : null;
  }
  async getUserByStripeCustomer(cid) {
    const q = await this.col('users').where('stripeCustomerId', '==', cid).limit(1).get();
    return q.empty ? null : q.docs[0].data();
  }
  async createUser(email) {
    const emailRef = this.col('emails').doc(sha256(email));
    const id = randomId();
    const user = { id, email, createdAt: isoNow(), plan: null, stripeCustomerId: null, stripeSubscriptionId: null, sessionVersion: 1 };
    const winner = await this.db.runTransaction(async (tx) => {
      const e = await tx.get(emailRef);
      if (e.exists) return e.data().uid;
      tx.set(emailRef, { uid: id });
      tx.set(this.col('users').doc(id), user);
      return id;
    });
    return this.getUser(winner);
  }
  async updateUser(id, patch) {
    const ref = this.col('users').doc(id);
    await ref.update(patch);
    const s = await ref.get();
    return s.exists ? s.data() : null;
  }
  async deleteUser(id) {
    const u = await this.getUser(id);
    if (!u) return;
    await this.col('emails').doc(sha256(u.email)).delete();
    await this.deleteSync(id);
    const counters = await this.col('counters').where('uid', '==', id).get();
    await Promise.all(counters.docs.map((d) => d.ref.delete()));
    await this.col('users').doc(id).delete();
  }

  // ----- sign-in tokens (one use) -----
  async putToken(hash, rec) { await this.col('tokens').doc(hash).set(rec); }
  async takeToken(hash) {
    const ref = this.col('tokens').doc(hash);
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return null;
      tx.delete(ref);
      return s.data();
    });
  }
  async peekToken(hash) { const s = await this.col('tokens').doc(hash).get(); return s.exists ? s.data() : null; }
  async purgeTokens(now = Date.now()) {
    const q = await this.col('tokens').where('exp', '<', now).limit(400).get();
    await Promise.all(q.docs.map((d) => d.ref.delete()));
  }

  // ----- synced progress, in pieces -----
  async getSync(uid) {
    const meta = await this.col('sync').doc(uid).get();
    if (!meta.exists) return null;
    const { updatedAt, chunks } = meta.data();
    const parts = await Promise.all(Array.from({ length: chunks }, (_, i) => this.col('sync_chunks').doc(`${uid}_${i}`).get()));
    return { updatedAt, data: JSON.parse(parts.map((p) => (p.exists ? p.data().text : '')).join('')) };
  }
  async putSync(uid, doc) {
    const text = JSON.stringify(doc.data);
    const pieces = [];
    for (let i = 0; i < text.length; i += CHUNK) pieces.push(text.slice(i, i + CHUNK));
    if (!pieces.length) pieces.push('{}');
    const old = await this.col('sync').doc(uid).get();
    await Promise.all(pieces.map((t, i) => this.col('sync_chunks').doc(`${uid}_${i}`).set({ uid, text: t })));
    await this.col('sync').doc(uid).set({ updatedAt: doc.updatedAt, chunks: pieces.length });
    if (old.exists) for (let i = pieces.length; i < old.data().chunks; i++) await this.col('sync_chunks').doc(`${uid}_${i}`).delete();
  }
  async deleteSync(uid) {
    const meta = await this.col('sync').doc(uid).get();
    if (!meta.exists) return;
    for (let i = 0; i < meta.data().chunks; i++) await this.col('sync_chunks').doc(`${uid}_${i}`).delete();
    await this.col('sync').doc(uid).delete();
  }

  // ----- counters -----
  async incr(key, n = 1) {
    const ref = this.col('counters').doc(sha256(key));
    const uid = (key.match(/^[a-z]+:([0-9a-f]{32}):/) || [])[1] || null;
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const v = (s.exists ? s.data().n : 0) + n;
      tx.set(ref, { key, n: v, uid });
      return v;
    });
  }
  async getCount(key) { const s = await this.col('counters').doc(sha256(key)).get(); return s.exists ? s.data().n : 0; }

  // ----- family links -----
  async putInvite(hash, rec) { await this.col('invites').doc(hash).set(rec); }
  async takeInvite(hash) {
    const ref = this.col('invites').doc(hash);
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return null;
      tx.delete(ref);
      return s.data();
    });
  }
  async createLink(link) { await this.col('links').doc(link.id).set(link); return link; }
  async getLink(id) { const s = await this.col('links').doc(id).get(); return s.exists ? s.data() : null; }
  async updateLink(id, patch) {
    const ref = this.col('links').doc(id);
    const s = await ref.get();
    if (!s.exists) return null;
    await ref.update(patch);
    return (await ref.get()).data();
  }
  async deleteLink(id) { await this.col('links').doc(id).delete(); }
  async listLinks(role, uid) {
    const q = await this.col('links').where(role === 'learner' ? 'learnerId' : 'parentId', '==', uid).get();
    return q.docs.map((d) => d.data());
  }
  async deleteLinksFor(uid) {
    const [a, b, c] = await Promise.all([
      this.col('links').where('learnerId', '==', uid).get(),
      this.col('links').where('parentId', '==', uid).get(),
      this.col('invites').where('learnerId', '==', uid).get(),
    ]);
    await Promise.all([...a.docs, ...b.docs, ...c.docs].map((d) => d.ref.delete()));
  }

  // ----- promo codes -----
  async putCode(hash, rec) { await this.col('codes').doc(hash).set(rec); }
  async getCode(hash) { const s = await this.col('codes').doc(hash).get(); return s.exists ? s.data() : null; }
  async useCode(hash, now = Date.now()) {
    const ref = this.col('codes').doc(hash);
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return null;
      const c = s.data();
      if (c.exp && Date.parse(c.exp) < now) return null;
      if (c.maxUses && (c.uses || 0) >= c.maxUses) return null;
      const next = { ...c, uses: (c.uses || 0) + 1 };
      tx.set(ref, next);
      return next;
    });
  }

  // ----- payment events seen -----
  async firstTimeEvent(id) {
    const ref = this.col('events').doc(sha256(id));
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (s.exists) return false;
      tx.set(ref, { id, at: isoNow() });
      return true;
    });
  }

  async close() { await this.db.terminate(); }
}
