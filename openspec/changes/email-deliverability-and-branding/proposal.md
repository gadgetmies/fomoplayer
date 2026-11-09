## Why

Fomo Player's outbound email is unauthenticated, unbranded, and lacks a real
unsubscribe path: the apex SPF only covers inbound forwarding, DMARC is a
broken CNAME, templates are bare hardcoded HTML, and there is no
`List-Unsubscribe` header or no-login opt-out. This causes spam-foldering,
fails the Gmail/Yahoo bulk-sender rules, and looks untrustworthy. We are also
replacing CloudMailin with Resend, whose sending DNS is already provisioned —
so now is the moment to fix all four together.

## What Changes

- **Deliverability**: complete SPF+DKIM+DMARC for `@fomoplayer.com` — the
  Resend `send.` subdomain SPF and `resend._domainkey` DKIM are already
  correct; publish a valid `_dmarc` TXT (documented manual Namecheap step,
  replacing the stray CNAME) so mail passes aligned SPF/DKIM/DMARC.
- **Provider migration** (**BREAKING** for env/config): replace CloudMailin
  with Resend at the single send choke point (`services/mailer.js`), using
  `idempotencyKey = email_queue_id`; keep the `email_queue` + retry model and
  the non-prod mock-email endpoint. Add `RESEND_API_KEY`; remove
  `CLOUDMAILIN_USERNAME`/`CLOUDMAILIN_API_KEY`.
- **Branding**: a shared, email-client-safe branded HTML layout (light-minimal
  design with the app's exact CTA button) applied at send time across
  verification, invite, and notification emails, with rewritten copy; admin
  alerts stay plain.
- **Unsubscribe**: global (account-wide) opt-out with RFC 8058 one-click —
  a new `email_unsubscribe` suppression table keyed by address, a stateless
  HMAC token, `POST /api/email/unsubscribe` (one-click, 200 empty body) and a
  no-login `GET /email/unsubscribe` confirmation/resubscribe page,
  `List-Unsubscribe` + `List-Unsubscribe-Post` headers on notification/invite
  only, and send-time suppression skipping. Verification email is exempt.
- **Schema**: add `email_unsubscribe`; add `email_queue_category`,
  `email_queue_skipped_reason`, `email_queue_provider_message_id` to
  `email_queue`.

## Capabilities

### New Capabilities
- `email-delivery`: how transactional/notification mail is sent — the Resend
  provider integration, the queue/retry/idempotency model, category tagging,
  and the domain authentication (SPF/DKIM/DMARC) required for deliverability.
- `email-branding`: the shared branded, email-client-safe layout and the
  content/copy contract for verification, invite, and notification emails
  (and the plain-mail exemption for admin alerts).
- `email-unsubscribe`: global opt-out and RFC 8058 one-click unsubscribe — the
  suppression store, stateless token, unsubscribe/resubscribe endpoints and
  no-login page, `List-Unsubscribe` headers, and send-time suppression rules.

### Modified Capabilities
<!-- None: no existing capability spec covers email sending, branding, or
     unsubscribe; all behaviour introduced here is new. -->

## Impact

- **Code**: `packages/back/services/mailer.js` (transport swap, wrapping,
  headers, suppression), new `packages/back/services/email-templates.js`,
  callers in `routes/users/logic.js`, `jobs/notifications.js`,
  `jobs/send-invites.js`, `job-scheduling.js`,
  `jobs/check-beatport-genres.js`; new unsubscribe routes + restyled static
  pages under `routes/static/`.
- **Schema/migrations**: new `email_unsubscribe` table; new `email_queue`
  columns (`migrations/sqls/*-up.sql`/`-down.sql`).
- **Dependencies**: remove `cloudmailin`, add `resend` in
  `packages/back/package.json`.
- **Config/env**: add `RESEND_API_KEY`, `EMAIL_UNSUBSCRIBE_SECRET`, optional
  `EMAIL_UNSUBSCRIBE_MAILTO`; remove `CLOUDMAILIN_*`; keep `*_EMAIL_SENDER`;
  all URLs from config (no hardcoded hosts). Update `.env.development`.
- **DNS (external, manual)**: publish the `_dmarc` TXT in Namecheap; verify
  the Resend domain; then tighten DMARC from `p=none`.
- **Tests**: token, layout, suppression, endpoints, migration, plus a required
  paired `demo-test`/`demo-preview` for the user-visible unsubscribe page.
- **Non-goals**: per-notification-type preferences, a logged-in Settings
  toggle, Resend Audiences/Broadcasts, and any change to the apex web TLS.
