## Context

Full design rationale lives in
`docs/superpowers/specs/2026-09-22-email-deliverability-and-branding-design.md`
(the approved brainstorm output) — this document is the OpenSpec-scoped summary.

Every email currently flows through one choke point:
`scheduleEmail(sender, recipient, subject, plain, html)` in
`packages/back/services/mailer.js` → `INSERT INTO email_queue` →
`sendNextEmailBatch()` (scheduled job) → CloudMailin. Callers: verification
(`routes/users/logic.js`), search notifications (`jobs/notifications.js`),
invites + admin alerts (`jobs/send-invites.js`), and admin alerts
(`job-scheduling.js`, `jobs/check-beatport-genres.js`).

Current state / constraints:
- Deliverability is broken: apex SPF covers only inbound Namecheap forwarding;
  `_dmarc` is a stray CNAME (not a policy). The Resend `send.` subdomain SPF +
  MX (`send.forge.rmta.net`) and `resend._domainkey` DKIM are already published
  and correct. A leftover CloudMailin `feedback-smtp.cloudmta.net` CNAME
  remains and must be cleaned up at cutover.
- Templates are bare hardcoded HTML; no `List-Unsubscribe`, no suppression.
- The repo uses `NATURAL JOIN` heavily → strict column naming rules apply.
- UI-visible changes require paired demo-test/demo-preview (repo BLOCKING rule).
- No deployment hosts in source — URLs come from `fomoplayer_shared/config`.

## Goals / Non-Goals

**Goals:**
- Authenticated, aligned SPF+DKIM+DMARC mail from `@fomoplayer.com` via Resend,
  meeting Gmail/Yahoo bulk-sender rules.
- Swap CloudMailin → Resend at the choke point without changing the queue/retry
  model or the non-prod mock behaviour; make retries safe via idempotency.
- One shared branded, email-client-safe layout for user-facing mail + clearer
  copy.
- Global account-wide opt-out with RFC 8058 one-click unsubscribe and a
  no-login page.

**Non-Goals:**
- Per-notification-type email preferences; a logged-in Settings opt-out toggle.
- Resend Audiences/Broadcasts (we keep self-hosted transactional sends and own
  the suppression list).
- Any change to apex web TLS (Railway + Let's Encrypt already works; unused
  PositiveSSL is irrelevant; do NOT add a Sectigo-only CAA record).

## Decisions

- **Provider at the choke point, per-row send.** Replace `MessageClient` with
  `resend.emails.send({from,to,subject,html,text,headers},{idempotencyKey})`.
  Chose per-row over `batch.send` because the queue tracks per-row
  `sent`/`error`/`attempt_count` 1:1; volume is far under Resend's 10 req/s.
  `idempotencyKey = String(email_queue_id)` makes retries non-duplicating
  (Resend dedupes within 24h). Alternative (batch.send) rejected: complicates
  per-row status mapping for marginal throughput we don't need.
- **Preserve non-prod mock.** Keep routing dev/test sends to
  `${apiURL}/mock/email` (transport switch on `isProduction`/`EMAIL_TRANSPORT`)
  so demo-preview/browser tests are unchanged. Alternative (call Resend in
  tests) rejected: external dependency + cost + flakiness.
- **Wrap branding at send time.** `email_queue` stores a content *fragment* +
  `email_queue_category`; `sendNextEmailBatch` wraps it in the shared layout
  and computes the per-recipient unsubscribe URL/headers. Centralises
  branding/headers/suppression in one place; keeps callers thin. Alternative
  (wrap at schedule time) rejected: would duplicate token/URL logic across
  callers and bake stale chrome into queued rows.
- **Category drives behaviour.** `verification | invite | notification |
  admin`. Suppressible = `notification` + `invite`; those get the branded
  footer + `List-Unsubscribe` headers + suppression checks. `verification` is
  transactional/user-initiated → branded but exempt from suppression/headers.
  `admin` → plain, internal.
- **Suppression keyed by email address, not account.** New `email_unsubscribe`
  table keyed by `email_unsubscribe_address` (unique) because invites target
  waiting-list addresses with no account. Global do-not-email list covers both.
- **Stateless HMAC token.** `base64url(address).base64url(HMAC_SHA256(address,
  EMAIL_UNSUBSCRIBE_SECRET))`; endpoint recomputes + constant-time compares. No
  pre-provisioned tokens, no DB lookup to validate; a row is written only on
  actual opt-out. Dedicated secret so rotation is isolated from sessions.
- **RFC 8058 split.** `POST /api/email/unsubscribe` is the machine one-click
  target → 200 empty body, no auth/CSRF. `GET /email/unsubscribe` is the human
  footer link → branded no-login confirm page whose button POSTs (so
  scanners/prefetchers can't silently opt users out) + resubscribe.
- **Design/branding = variant C + app button.** Light-minimal, table-based,
  inline-styled, ≤600px, Lato stack, magenta `#b40089`; CTA matches the app
  button exactly (`bg #b40089`, `1px solid #530059`, `radius 4px`, white).
  Mockups: `docs/email-redesign/mockups/`.
- **DMARC as documented manual step.** Records are environment-specific and not
  infra-as-code here; the change ships a checklist, not a wizard.

## Risks / Trade-offs

- **Dual-sender window during rollout** → migrate the transport in one deploy;
  remove CloudMailin DNS (`feedback-smtp.cloudmta.net`) only after Resend is
  verified sending, so bounce handling isn't disrupted mid-flight.
- **DMARC `p=none` isn't enforcing yet** → start at `p=none` with `rua`
  reporting, confirm SPF/DKIM/DMARC pass (mail-tester / Postmaster), then
  tighten to `quarantine`/`reject`.
- **One-click endpoint is unauthenticated** → tokens are HMAC-signed and
  address-scoped; endpoint only ever suppresses/removes the token's own
  address; rate-limit and log source. GET never mutates (POST-only opt-out)
  to defeat link prefetchers.
- **Verification exempt from suppression** could re-mail an opted-out address →
  acceptable: verification is user-initiated (they just entered the address)
  and transactional, not marketing.
- **Web-font (Lato) unavailable in many clients** → rely on the
  `-apple-system,…,sans-serif` fallback; layout doesn't depend on Lato metrics.
- **`email_queue` legacy rows have null category** → treated as non-suppressible
  and sent as today (backward compatible); only new rows get branded/suppressed.

## Migration Plan

1. Apply migrations (`email_unsubscribe`; `email_queue` columns) and config
   (`RESEND_API_KEY`, `EMAIL_UNSUBSCRIBE_SECRET`, optional
   `EMAIL_UNSUBSCRIBE_MAILTO`; drop `CLOUDMAILIN_*`). Backward compatible.
2. Deploy mailer transport swap + template module + unsubscribe routes/pages
   together.
3. Publish the `_dmarc` TXT in Namecheap (replace stray CNAME); confirm Resend
   domain fully verified; send test mail; verify SPF+DKIM+DMARC pass.
4. Remove leftover CloudMailin DNS (`feedback-smtp.cloudmta.net` CNAME).
5. After monitoring `rua` reports, tighten DMARC `p=none` → `quarantine` →
   `reject`.

Rollback: revert the deploy (transport falls back to prior behaviour); the new
migrations are additive and safe to leave in place; DMARC can be reverted to
`p=none` if reports show misconfiguration.

## Open Questions

None blocking. DMARC tightening cadence and whether to set
`EMAIL_UNSUBSCRIBE_MAILTO` are decided during rollout.
