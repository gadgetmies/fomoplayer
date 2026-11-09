## 1. Migrations & schema

- [x] 1.1 Add `email_unsubscribe` table (`email_unsubscribe_id` PK,
  `email_unsubscribe_address` text UNIQUE, `email_unsubscribe_created_at`
  timestamptz default now(), `email_unsubscribe_source` text) with up/down SQL
  under `migrations/sqls/`
- [x] 1.2 Add `email_queue_category`, `email_queue_skipped_reason`,
  `email_queue_provider_message_id` (all nullable) to `email_queue` with
  up/down SQL
- [x] 1.3 Verify migrations apply and roll back cleanly; confirm column naming
  keeps existing `NATURAL JOIN` chains intact

## 2. Config & dependencies

- [x] 2.1 Add `resend` and remove `cloudmailin` in `packages/back/package.json`
- [x] 2.2 Add `RESEND_API_KEY`, `EMAIL_UNSUBSCRIBE_SECRET`, and optional
  `EMAIL_UNSUBSCRIBE_MAILTO`; remove `CLOUDMAILIN_USERNAME`/`CLOUDMAILIN_API_KEY`
  in `.env.development` and env docs (keep `*_EMAIL_SENDER`)
- [x] 2.3 Expose the new email settings via `config.js` /
  `fomoplayer_shared/config` as needed; ensure all unsubscribe/manage URLs are
  built from `apiURL`/`frontendURL` (no hardcoded hosts)

## 3. Provider migration (Resend at the choke point)

- [x] 3.1 Replace CloudMailin `MessageClient` with the Resend client in
  `services/mailer.js`, initialised from `RESEND_API_KEY`
- [x] 3.2 Send each queued row via `resend.emails.send({from,to,subject,html,
  text,headers}, { idempotencyKey: String(email_queue_id) })`; handle the
  `{ data, error }` return (non-null `error` = failed attempt) and keep the
  existing per-row status bookkeeping
- [x] 3.3 Store `data.id` in `email_queue_provider_message_id` on success
- [x] 3.4 Add the transport switch so non-production posts the rendered email
  to `${apiURL}/mock/email` (preserving current dev/test behaviour)
- [x] 3.5 Extend `scheduleEmail` to accept and persist a `category`

## 4. Branded templates

- [x] 4.1 Create `services/email-templates.js` with `renderLayout(...)`
  (table-based, inline-styled, ≤600px, Lato stack, `#b40089`, wordmark,
  preheader, footer) and the app-styled CTA button (`#b40089`, `1px solid
  #530059`, radius 4px, white)
- [x] 4.2 Add content builders `renderVerification`, `renderInvite`,
  `renderNotification` returning `{ subject, contentHtml, text, category }`
  with rewritten, clear copy
- [x] 4.3 Wrap user-facing content fragments in the shared layout at send time
  in `sendNextEmailBatch`; leave `admin` category plain
- [x] 4.4 Update callers (`routes/users/logic.js`, `jobs/notifications.js`,
  `jobs/send-invites.js`) to use the builders and pass categories; keep admin
  alert callers plain
- [x] 4.5 Restyle `routes/static/email_verification_success.html` /
  `email_verification_fail.html` to the new branding

## 5. Unsubscribe

- [x] 5.1 Add unsubscribe token module: generate
  `base64url(address).base64url(HMAC_SHA256(address, EMAIL_UNSUBSCRIBE_SECRET))`
  and constant-time validate
- [x] 5.2 Add suppression DB helpers: add (ON CONFLICT DO NOTHING), remove,
  and exists-check by address
- [x] 5.3 Add `POST /api/email/unsubscribe` (unauthenticated, CSRF-exempt):
  validate token, suppress, return `200` empty body
- [x] 5.4 Add `GET /email/unsubscribe` branded no-login confirmation page whose
  button POSTs; success view offers resubscribe
- [x] 5.5 Add `POST /api/email/resubscribe`: validate token, remove suppression
- [x] 5.6 Add `List-Unsubscribe` + `List-Unsubscribe-Post` headers for
  `notification`/`invite` sends (HTTPS URL always, `mailto:` only when
  `EMAIL_UNSUBSCRIBE_MAILTO` set); none for `verification`/`admin`
- [x] 5.7 Enforce send-time suppression skip for suppressible categories
  (mark `email_queue_skipped_reason = 'suppressed'`); exempt `verification`;
  optional schedule-time pre-filter in notification/invite jobs

## 6. Tests

- [x] 6.1 Token: round-trip encode/decode, tamper rejection, `+`/unicode
  address survives base64url
- [x] 6.2 Layout: unsubscribe URL present for `notification`/`invite`, absent
  for `verification`; app-styled CTA present; preheader present
- [x] 6.3 Suppression: suppressed recipient skipped and marked; non-suppressed
  sends; verification bypasses suppression
- [x] 6.4 Endpoints: valid one-click POST → 200 empty body + row inserted
  (idempotent on repeat); invalid token → 4xx; GET renders page; resubscribe
  removes the row
- [x] 6.5 Migration test: up/down apply; suppression NATURAL JOIN sanity
- [x] 6.6 Add paired `demo-test` (local) + `demo-preview` (UI/API-seeded) under
  `packages/back/test/browser/` for the user-visible unsubscribe page, sharing
  code per the demo-tests skill; include both fenced blocks in the PR body

## 7. DNS & rollout (deploy checklist)

- [ ] 7.1 Publish `_dmarc.fomoplayer.com` TXT
  `v=DMARC1; p=none; rua=mailto:dmarc@fomoplayer.com; adkim=r; aspf=r`
  (replace the stray CNAME) in Namecheap
- [ ] 7.2 Confirm the Resend domain is fully verified; send a test email;
  verify SPF+DKIM+DMARC pass (mail-tester / Google Postmaster)
- [ ] 7.3 Remove leftover CloudMailin DNS (the `feedback-smtp.cloudmta.net`
  CNAME) after Resend is confirmed sending
- [ ] 7.4 After monitoring `rua` reports, tighten DMARC `p=none` →
  `quarantine` → `reject`
