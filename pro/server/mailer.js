// Sending the sign-in email. "console" prints it (development only). "resend" uses the Resend email service.
export function makeMailer(cfg, log = () => {}) {
  if (cfg.mailer === 'resend') {
    return {
      kind: 'resend',
      async sendSignIn(to, link) {
        const res = await fetch(cfg.resendBase + '/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + cfg.resendKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: cfg.mailFrom, to: [to], subject: `Your ${cfg.brand} sign-in link`,
            text: `Hello,\n\nPress this link to sign in to ${cfg.brand}. It works once and expires in 15 minutes.\n\n${link}\n\nIf you did not ask for this, you can ignore this email. Nobody can sign in without the link.\n`,
          }),
        });
        if (!res.ok) throw new Error('email provider answered ' + res.status);
      },
    };
  }
  return {
    kind: 'console',
    sent: [],
    async sendSignIn(to, link) { this.sent.push({ to, link }); log('mail (console)', { sent: true }); },
  };
}
