// All settings come from environment variables, with safe defaults. Nothing secret is ever in the repo.
export function loadConfig(env = process.env) {
  const num = (k, d) => (env[k] !== undefined && env[k] !== '' && !Number.isNaN(Number(env[k])) ? Number(env[k]) : d);
  const list = (k) => (env[k] || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const production = env.NODE_ENV === 'production';
  const cfg = {
    production,
    devMode: env.DEV_MODE === '1',
    port: num('PORT', 8080),
    baseUrl: (env.BASE_URL || `http://localhost:${num('PORT', 8080)}`).replace(/\/+$/, ''),
    sessionSecret: env.SESSION_SECRET || '',
    sessionDays: num('SESSION_DAYS', 30),
    sessionCookie: env.SESSION_COOKIE || (production ? '__Host-ns' : 'ns'),   // behind Firebase Hosting this must be __session
    adminEmails: list('ADMIN_EMAILS'),
    brand: env.BRAND_NAME || 'Next Stop',
    planName: env.PLAN_NAME || 'Plus',

    dataStore: env.DATA_STORE || 'memory',            // memory | file | firestore
    dataDir: env.DATA_DIR || './.data',
    firestoreProject: env.FIRESTORE_PROJECT || env.GOOGLE_CLOUD_PROJECT || '',

    mailer: env.MAILER || 'console',                  // console | resend
    mailFrom: env.MAIL_FROM || '',
    resendKey: env.RESEND_API_KEY || '',
    resendBase: env.RESEND_BASE_URL || 'https://api.resend.com',

    stripeKey: env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    stripeBase: (env.STRIPE_BASE_URL || 'https://api.stripe.com').replace(/\/+$/, ''),
    stripeApiVersion: env.STRIPE_API_VERSION || '2025-03-31.basil',
    priceMonthly: env.STRIPE_PRICE_MONTHLY || '',
    pricePass: env.STRIPE_PRICE_PASS || '',
    passDays: num('PASS_DAYS', 90),
    graceDays: num('GRACE_DAYS', 3),
    priceMonthlyLabel: env.PRICE_MONTHLY_LABEL || '',
    pricePassLabel: env.PRICE_PASS_LABEL || '',

    markingProvider: env.MARKING_PROVIDER || 'off',   // anthropic | vertex | fake | off
    anthropicModel: env.MODEL || 'claude-sonnet-5-5',
    anthropicEffort: env.EFFORT || 'medium',
    useFallbacks: env.USE_FALLBACKS !== '0',
    vertexProject: env.VERTEX_PROJECT || env.FIRESTORE_PROJECT || env.GOOGLE_CLOUD_PROJECT || '',
    vertexLocation: env.VERTEX_LOCATION || 'europe-west2',
    vertexModel: env.VERTEX_MODEL || 'gemini-2.5-flash',
    vertexBaseUrl: env.VERTEX_BASE_URL || '',
    markTimeoutMs: num('TIMEOUT_MS', 90000),
    quotaMonthlyMarks: num('QUOTA_MONTHLY_MARKS', 40),
    marksPerUserPerHour: num('MARKS_PER_USER_PER_HOUR', 8),
    marksDailyCap: num('MARKS_DAILY_CAP', 300),

    maxBodyBytes: num('MAX_BODY_BYTES', 60000),
    maxSyncBytes: num('MAX_SYNC_BYTES', 3_000_000),
    authPerEmailPerHour: num('AUTH_PER_EMAIL_PER_HOUR', 5),
    authPerIpPerHour: num('AUTH_PER_IP_PER_HOUR', 30),
    apiPerIpPerMinute: num('API_PER_IP_PER_MINUTE', 240),
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === '1' : production,
    trustedProxyHops: Math.max(1, num('TRUSTED_PROXY_HOPS', 1)),             // how many proxy addresses are added on the right of X-Forwarded-For by Google, not by the visitor
    contentDir: env.CONTENT_DIR || '',
    webDir: env.WEB_DIR || '',
  };
  return cfg;
}

// Refuse to start in a configuration that would be unsafe or silently broken.
export function checkConfig(cfg) {
  const problems = [];
  if (cfg.production) {
    if (cfg.devMode) problems.push('DEV_MODE must not be on in production (it would show sign-in links on screen).');
    if (cfg.sessionSecret.length < 32) problems.push('SESSION_SECRET must be set to a long random value (at least 32 characters).');
    if (!/^https:\/\//.test(cfg.baseUrl)) problems.push('BASE_URL must be the public https address.');
    if (cfg.dataStore === 'memory') problems.push('DATA_STORE=memory would lose everything on restart. Use firestore.');
    if (cfg.mailer === 'console') problems.push('MAILER=console cannot send real emails. Use resend.');
  } else if (cfg.sessionSecret.length < 16) {
    cfg.sessionSecret = 'dev-only-secret-not-for-production-use';
  }
  if (cfg.sessionCookie.startsWith('__Host-') && !/^https:\/\//.test(cfg.baseUrl)) problems.push('A cookie name starting __Host- needs an https BASE_URL (set SESSION_COOKIE for development).');
  if (cfg.mailer === 'resend' && (!cfg.resendKey || !cfg.mailFrom)) problems.push('MAILER=resend needs RESEND_API_KEY and MAIL_FROM.');
  if (cfg.stripeKey && !cfg.stripeWebhookSecret) problems.push('STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is not.');
  if (cfg.markingProvider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) problems.push('MARKING_PROVIDER=anthropic needs ANTHROPIC_API_KEY.');
  if (cfg.markingProvider === 'vertex' && !cfg.vertexProject) problems.push('MARKING_PROVIDER=vertex needs VERTEX_PROJECT (or GOOGLE_CLOUD_PROJECT).');
  if (!['anthropic', 'vertex', 'fake', 'off'].includes(cfg.markingProvider)) problems.push('MARKING_PROVIDER must be anthropic, vertex, fake or off.');
  if (cfg.production && cfg.markingProvider === 'fake') problems.push('MARKING_PROVIDER=fake must not be used in production.');
  return problems;
}
