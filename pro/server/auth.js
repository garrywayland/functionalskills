// Sign in by email link: no passwords to leak, forget or reuse.
//  1. The learner types an email address. We email a link that works once for 15 minutes.
//  2. The link opens the site, which asks her to press Sign in (so an email scanner that opens the link
//     cannot use it up), and that call sets a session cookie.
import crypto from 'node:crypto';
import { HttpError, sha256, randomToken, safeEqual, normaliseEmail } from './util.js';

const TOKEN_MINUTES = 15;

export function makeAuth({ cfg, store, mailer, limiter }) {
  const cookieName = cfg.production ? '__Host-ns' : 'ns';
  const sign = (payload) => crypto.createHmac('sha256', cfg.sessionSecret).update(payload).digest('base64url');

  function makeSession(user) {
    const payload = Buffer.from(JSON.stringify({ u: user.id, v: user.sessionVersion || 1, e: Date.now() + cfg.sessionDays * 86400_000 })).toString('base64url');
    return payload + '.' + sign(payload);
  }

  function cookieHeader(value, maxAgeSeconds) {
    const parts = [`${cookieName}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
    if (cfg.production || cfg.baseUrl.startsWith('https://')) parts.push('Secure');
    return parts.join('; ');
  }

  async function userFromCookies(cookies) {
    const raw = cookies[cookieName];
    if (!raw || !raw.includes('.')) return null;
    const [payload, sig] = raw.split('.');
    if (!safeEqual(sig, sign(payload))) return null;
    let p;
    try { p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
    if (!p || typeof p.u !== 'string' || p.e < Date.now()) return null;
    const user = await store.getUser(p.u);
    if (!user || (user.sessionVersion || 1) !== p.v) return null;
    return user;
  }

  return {
    cookieName,
    userFromCookies,
    clearCookie: () => cookieHeader('', 0),

    // Always answers the same way, so nobody can use it to find out who has an account.
    async requestLink(emailRaw, ip) {
      const email = normaliseEmail(emailRaw);
      if (!email) throw new HttpError(400, 'Please type a valid email address.');
      if (!limiter.allow('auth-ip:' + ip, cfg.authPerIpPerHour, 3600_000) || !limiter.allow('auth-email:' + email, cfg.authPerEmailPerHour, 3600_000)) {
        throw new HttpError(429, 'That is a lot of sign-in emails. Please wait a little and try again.');
      }
      const token = randomToken(32);
      await store.putToken(sha256(token), { email, exp: Date.now() + TOKEN_MINUTES * 60_000 });
      const link = `${cfg.baseUrl}/#/signin/${token}`;
      try { await mailer.sendSignIn(email, link); } catch { throw new HttpError(502, 'We could not send the email just now. Please try again in a minute.'); }
      return { link, email };   // the route only shows `link` in development mode
    },

    async verify(token, ip) {
      if (!limiter.allow('verify-ip:' + ip, 60, 3600_000)) throw new HttpError(429, 'Too many tries. Please wait a little.');
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw new HttpError(400, 'That link does not look right. Please ask for a new one.');
      const rec = await store.takeToken(sha256(token));
      if (!rec || rec.exp < Date.now()) throw new HttpError(400, 'That link has expired or has already been used. Please ask for a new one.');
      let user = await store.getUserByEmail(rec.email);
      const created = !user;
      if (!user) user = await store.createUser(rec.email);
      return { user, created, cookie: cookieHeader(makeSession(user), cfg.sessionDays * 86400) };
    },

    // Signs out every device at once.
    async revokeAll(user) { await store.updateUser(user.id, { sessionVersion: (user.sessionVersion || 1) + 1 }); },
  };
}
