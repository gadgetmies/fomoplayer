# Email deliverability & branding overhaul — design

Date: 2026-09-22
Change slug: `email-deliverability-and-branding`

## Problem

Fomo Player's outbound email is unreliable and unbranded:

- **Deliverability is broken.** The apex SPF only authorises Namecheap
  email forwarding, there was no DKIM for the sending path, and
  `_dmarc.fomoplayer.com` is a stray CNAME (to a Railway host) rather than
  a valid DMARC policy. Verification, invite, and notification mail is
  therefore prone to spam-foldering or rejection, and fails the Gmail/Yahoo
  (Feb 2024) bulk-sender requirements.
- **Emails are unbranded.** All templates are hardcoded HTML strings with no
  logo/wordmark, colours, shared layout, or preheader — they do not look
  reputable.
- **No real unsubscribe.** Only search-notification emails link to
  `/settings/notifications` (login required). There is no `List-Unsubscribe`
  header, no one-click unsubscribe, no no-login opt-out, and no
  account-level suppression.

The provider (CloudMailin) is also being replaced with **Resend**, which the
user has already begun provisioning in DNS.

## Goals

1. **Deliverability**: authenticated mail (SPF + DKIM + DMARC aligned) from
   `@fomoplayer.com` via Resend, meeting Gmail/Yahoo bulk-sender rules.
2. **Provider migration**: replace CloudMailin with Resend at the single send
   choke point, keeping the existing queue, retry, and dev/test mock behaviour.
3. **Branding**: a shared, reputable, email-client-safe branded layout applied
   to all user-facing mail, plus clearer copy.
4. **Unsubscribe**: a global (account-wide) opt-out with RFC 8058 one-click
   unsubscribe (`List-Unsubscribe` + `List-Unsubscribe-Post`) and a no-login
   confirmation/resubscribe page.

## Non-goals

- Per-notification-type email preferences (explicitly scoped out — global
  opt-out only).
- A logged-in Settings toggle for the global opt-out (scoped out; management
  happens via the unsubscribe/resubscribe pages and the existing per-search
  notification controls).
- Moving notification sending to Resend Audiences/Broadcasts (we keep
  self-hosted transactional sends and own the suppression list).
- Changing the apex web TLS setup (Railway + Let's Encrypt already works; the
  unused Namecheap PositiveSSL product is irrelevant and left as-is; **do not**
  add a Sectigo-only CAA record — it would break Railway's Let's Encrypt
  renewal).

## Key architectural fact — the single choke point

Every email flows through:

```
scheduleEmail(sender, recipient, subject, plain, html)   // services/mailer.js
  -> INSERT INTO email_queue
  -> sendNextEmailBatch()  (scheduled job) -> provider send
```

Callers: `routes/users/logic.js` (verification), `jobs/notifications.js`
(search results), `jobs/send-invites.js` (invites + admin alert),
`job-scheduling.js` & `jobs/check-beatport-genres.js` (admin alerts).

All four workstreams land at this choke point so callers stay thin and
branding/suppression/headers are applied uniformly.

## Workstream 1 — DNS / deliverability

Resend's subdomain model is already provisioned and verified correct:

| Host | Type | Status |
| --- | --- | --- |
| `send.fomoplayer.com` (SPF + return-path MX → Resend "Forge", `send.forge.rmta.net`) | CNAME/TXT/MX | ✅ correct |
| `resend._domainkey.fomoplayer.com` (DKIM, `p=…` present) | TXT | ✅ correct |
| apex SPF (`include:spf.efwd.registrar-servers.com`) — inbound forwarding | TXT | ✅ leave as-is |

**The only remaining change** (manual, in Namecheap — not in this repo):
delete the stray `_dmarc` CNAME and add:

```
Host: _dmarc     Type: TXT
Value: v=DMARC1; p=none; rua=mailto:dmarc@fomoplayer.com; adkim=r; aspf=r
```

Start at `p=none` (monitor via `rua`), then tighten to `quarantine` → `reject`
once Resend mail is confirmed passing. Because `From:` stays `@fomoplayer.com`,
DKIM (`d=fomoplayer.com`) aligns directly and SPF aligns via relaxed alignment
with the `send.` subdomain return-path.

This workstream ships as **documentation + a checklist** in the change (records
are environment-specific and not infra-as-code in this repo). No wizard.

## Workstream 2 — Provider migration (CloudMailin → Resend)

`services/mailer.js`:

- Replace `const { MessageClient } = require('cloudmailin')` with
  `const { Resend } = require('resend')`; init with `RESEND_API_KEY`.
- In `sendNextEmailBatch`, send per queue row via
  `resend.emails.send({ from, to, subject, html, text, headers },
  { idempotencyKey })` where **`idempotencyKey = String(email_queue_id)`** so
  queue retries never double-send. Resend returns `{ data, error }` (does not
  throw for API errors) — check `error`, keep the existing per-row
  `email_queue_last_error` / `attempt_count` bookkeeping.
- `from` becomes `"Fomo Player <${sender}>"` (Resend camelCase; senders stay
  the existing `@fomoplayer.com` env vars).
- Store the returned `data.id` in a new `email_queue_provider_message_id`.
- **Non-prod stays mocked**: keep the current behaviour of routing dev/test
  sends to `${apiURL}/mock/email` instead of calling Resend, so
  demo-preview/browser tests are unaffected. Implement as a small transport
  switch on `isProduction` (or an explicit `EMAIL_TRANSPORT` env) — prod →
  Resend, otherwise → POST rendered email to the mock endpoint.
- Package: remove `cloudmailin`, add `resend` in `packages/back/package.json`.

Per-row send (not `batch.send`) keeps a 1:1 mapping to the queue's per-row
status columns; volume is far under Resend's 10 req/s limit.

## Workstream 3 — Branding (shared layout + copy)

New module `packages/back/services/email-templates.js`.

**Chosen visual direction: "variant C — light minimal" with the app button.**
Reference mockups live in `docs/email-redesign/mockups/`
(`email-c-minimal.html/.png`).

- `renderLayout({ previewText, wordmark, heading, contentHtml, footerNote,
  manageUrl, unsubscribeUrl })` → email-safe **table-based, ≤560–600px,
  fully inline-styled** HTML (email clients strip `<style>`). Elements:
  - thin magenta (`#b40089`) top rule; uppercase magenta **"FOMO PLAYER"**
    wordmark (text — there is no logo asset; brand identity is colour + type);
  - white background, `#111` headings, `#666` body, generous whitespace,
    `'Lato', -apple-system, …, sans-serif` stack;
  - hidden preheader span for `previewText`;
  - **CTA button matching the app exactly**: background `#b40089`, `1px solid
    #530059` border, `border-radius:4px`, white text (from the shared theme
    button style used by the extension);
  - footer: reason-for-receipt line + `Manage notifications` +
    `Unsubscribe from all emails` links (unsubscribe present only for
    suppressible categories).
- Per-email builders returning `{ subject, contentHtml, text, category }`:
  - `renderVerification({ verificationUrl })` — category `verification`
    (transactional; no unsubscribe footer/header).
  - `renderInvite({ inviteUrl })` — category `invite` (suppressible).
  - `renderNotification({ followText, searchUrl, tracks, storeNames })` —
    category `notification` (suppressible).
- Admin alerts (`admin` category) stay plain text/HTML — internal ops mail, no
  branding, no unsubscribe.
- Rewrite verification/invite/notification copy for clarity and reputability
  (why received, one prominent CTA, "ignore if you didn't request this" on
  verification).
- Colours are sourced from the shared theme (`#b40089`, `#9f0076`, `#530059`)
  — kept in sync with `packages/shared/theme.js`.

Layout is applied at **send time** in `sendNextEmailBatch` (wrapping the stored
content fragment), so the per-recipient unsubscribe URL/token and headers are
computed consistently in one place. `email_queue` stores the content fragment +
category; the branded chrome is added on send.

## Workstream 4 — Unsubscribe (global opt-out + one-click)

### Data model

New table `email_unsubscribe`, keyed by **email address** (not account id,
because invites go to waiting-list addresses with no account), following the
repo's naming rules (non-FK columns prefixed with the table name):

- `email_unsubscribe_id` — serial PK
- `email_unsubscribe_address` — text, UNIQUE (the suppressed address)
- `email_unsubscribe_created_at` — timestamptz default now()
- `email_unsubscribe_source` — text (`one-click` | `landing-page` | `mailto`),
  nullable

`email_queue` gains:
- `email_queue_category` — text (`verification` | `invite` | `notification` |
  `admin`), nullable for legacy rows
- `email_queue_skipped_reason` — text, nullable (e.g. `suppressed`)
- `email_queue_provider_message_id` — text, nullable

### Token (stateless, no pre-provisioning)

`token = base64url(address) + "." + base64url(HMAC_SHA256(address, secret))`.
The endpoint splits, base64url-decodes the address, recomputes the HMAC with
`EMAIL_UNSUBSCRIBE_SECRET`, and constant-time compares. No DB lookup needed to
validate; suppression rows are only written on actual opt-out. Reuse of a
dedicated secret (not `sessionSecret`) so rotation is isolated.

### Endpoints (unauthenticated, CSRF-exempt, mounted before auth guards)

- `POST /api/email/unsubscribe` — the RFC 8058 one-click target. Validates the
  token, `INSERT ... ON CONFLICT DO NOTHING` into `email_unsubscribe`, returns
  **HTTP 200 with an empty body** (mailbox providers POST directly; the user is
  never redirected). Honoured within seconds (well under the 48h rule).
- `GET /email/unsubscribe` — human fallback (the footer link): a **branded,
  no-login confirmation page** with an "Unsubscribe" button that POSTs, so
  link-prefetchers/scanners cannot silently opt people out. Success view then
  offers **Resubscribe**.
- `POST /api/email/resubscribe` — validates token, deletes the suppression row.

Static/rendered pages follow the existing pattern of
`routes/static/email_verification_*.html`, restyled to the new branding.

### Headers (suppressible categories only: `notification`, `invite`)

```
List-Unsubscribe: <https://<apiURL>/api/email/unsubscribe?token=…>[, <mailto:…>]
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

The `mailto:` variant is included only when `EMAIL_UNSUBSCRIBE_MAILTO` is set
(a monitored forwarding address). `verification` and `admin` categories get no
unsubscribe header.

### Suppression enforcement

- **Send time** (authoritative): in `sendNextEmailBatch`, for suppressible
  categories, skip recipients present in `email_unsubscribe`, marking the row
  `email_queue_skipped_reason = 'suppressed'` and `email_queue_sent = NOW()` so
  it is not retried forever.
- **Schedule time** (optimisation): notification/invite jobs can pre-filter
  suppressed addresses to avoid queueing at all.
- **Verification is exempt** — it is transactional and user-initiated (the user
  just entered the address), so it always sends regardless of suppression.

## Configuration / env changes

- Add `RESEND_API_KEY`; remove `CLOUDMAILIN_USERNAME` / `CLOUDMAILIN_API_KEY`.
- Add `EMAIL_UNSUBSCRIBE_SECRET` (HMAC key).
- Add optional `EMAIL_UNSUBSCRIBE_MAILTO`.
- Keep `*_EMAIL_SENDER` vars (senders remain `@fomoplayer.com`).
- All unsubscribe/manage URLs are built from `apiURL` / `frontendURL`
  (config), sender domain from env — **no hardcoded hosts** (config policy).
- Update `.env.development` and any env documentation accordingly.

## Migrations

1. `email_unsubscribe` table (per naming rules above).
2. `email_queue` add `email_queue_category`, `email_queue_skipped_reason`,
   `email_queue_provider_message_id`.

Follow the existing `migrations/sqls/*-up.sql` / `-down.sql` convention.

## Testing

- **Token**: round-trip encode/decode, tamper rejection (bad HMAC → rejected),
  address with `+`/unicode survives base64url.
- **Layout**: renders unsubscribe URL for `notification`/`invite`, omits it for
  `verification`; contains the app-styled CTA; preheader present.
- **Suppression**: suppressed recipient is skipped and marked; non-suppressed
  sends; verification bypasses suppression.
- **Endpoints**: `POST /api/email/unsubscribe` with valid token → 200 empty
  body + row inserted (idempotent on repeat); invalid token → 400; `GET`
  renders the confirmation page; resubscribe deletes the row.
- **Migration**: up/down apply cleanly; naming-convention NATURAL JOIN sanity.
- **Demo tests** (repo BLOCKING rule): the unsubscribe confirmation/success
  page is user-visible → add a paired `demo-test` (local) and `demo-preview`
  (UI/API-seeded) under `packages/back/test/browser/`, sharing code, with both
  fenced blocks in the PR body.

## Rollout

1. Migrations + config first (backward compatible; legacy queue rows have null
   category and send unbranded/unsuppressed as today).
2. Ship mailer transport swap + template module + endpoints together.
3. Add DMARC TXT in Namecheap; verify Resend domain fully; send test mail;
   confirm SPF+DKIM+DMARC pass (e.g. mail-tester / Google Postmaster).
4. Tighten DMARC policy from `p=none` after monitoring.

## Open questions

None blocking. DMARC policy tightening cadence and whether to set
`EMAIL_UNSUBSCRIBE_MAILTO` can be decided during rollout.
