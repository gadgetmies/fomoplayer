## ADDED Requirements

### Requirement: Outbound mail is sent via Resend

The system SHALL send all queued email through Resend
(`resend.emails.send`) in production, replacing CloudMailin. The Resend
client SHALL be configured from the `RESEND_API_KEY` environment variable.
CloudMailin configuration (`CLOUDMAILIN_USERNAME`, `CLOUDMAILIN_API_KEY`)
SHALL be removed.

#### Scenario: Production send uses Resend

- **WHEN** `sendNextEmailBatch` processes an unsent `email_queue` row in
  production
- **THEN** it calls `resend.emails.send` with the row's `from`, `to`,
  `subject`, `html`, and `text`, and marks the row sent on success

#### Scenario: Missing API key fails fast

- **WHEN** the backend attempts to send mail in production and
  `RESEND_API_KEY` is unset
- **THEN** sending fails with a clear configuration error rather than
  silently dropping mail

### Requirement: The queue and retry model are preserved

The system SHALL keep the `email_queue` table as the single send choke point,
continue selecting unsent rows in `email_queue_requested` order limited by
`EMAIL_SEND_BATCH`, and continue recording `email_queue_sent`,
`email_queue_last_error`, `email_queue_last_attempt`, and
`email_queue_attempt_count`. Resend returns `{ data, error }` and does not
throw for API errors; the sender SHALL treat a non-null `error` as a failed
attempt.

#### Scenario: Send failure is recorded, not lost

- **WHEN** `resend.emails.send` returns a non-null `error` for a queued row
- **THEN** the row remains unsent and its `email_queue_last_error`,
  `email_queue_last_attempt`, and `email_queue_attempt_count` are updated

#### Scenario: Provider message id is stored

- **WHEN** a send succeeds and Resend returns `data.id`
- **THEN** the value is stored in `email_queue_provider_message_id`

### Requirement: Sends are idempotent across retries

The system SHALL pass an idempotency key equal to the row's
`email_queue_id` on each Resend send so that re-processing a row (e.g. after
a crash between send and status update) does not deliver a duplicate email.

#### Scenario: Re-processing a row does not duplicate delivery

- **WHEN** the same `email_queue` row is sent twice within Resend's
  idempotency window
- **THEN** Resend treats the second call as idempotent and the recipient
  receives the message once

### Requirement: Non-production sends use the mock endpoint

The system SHALL, when not in production, route sends to the existing
`${apiURL}/mock/email` endpoint instead of contacting Resend, preserving
current development and browser-test behaviour.

#### Scenario: Development send is mocked

- **WHEN** `sendNextEmailBatch` runs with `NODE_ENV !== 'production'`
- **THEN** the rendered email is posted to `${apiURL}/mock/email` and no
  request is made to Resend

### Requirement: Queued emails are categorised

The system SHALL tag each queued email with an `email_queue_category` of
`verification`, `invite`, `notification`, or `admin`. Category SHALL
determine branding, `List-Unsubscribe` headers, and suppression behaviour
(defined in the email-branding and email-unsubscribe capabilities). Legacy
rows with a null category SHALL be sent as before (unbranded,
non-suppressed).

#### Scenario: Category is persisted with the queued email

- **WHEN** an email is scheduled via `scheduleEmail` with a category
- **THEN** the value is stored in `email_queue_category` on the queued row

### Requirement: Sending domain authentication is documented and aligned

The system's sending domain SHALL be authenticated so that mail from
`@fomoplayer.com` passes SPF, DKIM, and DMARC with alignment, meeting
Gmail/Yahoo bulk-sender requirements. The change SHALL document the required
DNS state: the Resend `send.` subdomain SPF/return-path and
`resend._domainkey` DKIM (already published), plus a valid
`_dmarc.fomoplayer.com` TXT policy (starting at `p=none`) that replaces the
existing stray CNAME. `From` addresses SHALL remain on `@fomoplayer.com` so
DKIM aligns to the organisational domain.

#### Scenario: DMARC record is published and mail aligns

- **WHEN** the documented `_dmarc` TXT policy is published and a test email
  is sent via Resend
- **THEN** the message passes SPF, DKIM, and DMARC alignment checks

#### Scenario: Legacy provider DNS is decommissioned

- **WHEN** Resend is verified and sending in production
- **THEN** the leftover CloudMailin DNS (the `feedback-smtp.cloudmta.net`
  CNAME) is removed
