## ADDED Requirements

### Requirement: Global email suppression list

The system SHALL maintain a global, account-wide opt-out keyed by email
address in a new `email_unsubscribe` table. The table SHALL follow the
repo's naming conventions: `email_unsubscribe_id` (PK),
`email_unsubscribe_address` (unique), `email_unsubscribe_created_at`, and
`email_unsubscribe_source`. Keying by address (not account id) SHALL allow
suppressing invite recipients that have no account.

#### Scenario: An address is suppressed once

- **WHEN** an address is added to the suppression list and the same address
  is submitted again
- **THEN** the second insert is a no-op (idempotent) and a single suppression
  row exists

### Requirement: Stateless unsubscribe token

The system SHALL generate an unsubscribe token of the form
`base64url(address).base64url(HMAC_SHA256(address, EMAIL_UNSUBSCRIBE_SECRET))`.
Validation SHALL recompute the HMAC over the decoded address and compare it in
constant time. No token SHALL need to be pre-provisioned or stored to be
validated.

#### Scenario: Valid token resolves to its address

- **WHEN** a token generated for an address is validated
- **THEN** validation succeeds and yields that address

#### Scenario: Tampered token is rejected

- **WHEN** a token whose address or signature has been altered is validated
- **THEN** validation fails and no suppression change is made

### Requirement: RFC 8058 one-click unsubscribe endpoint

The system SHALL expose `POST /api/email/unsubscribe` as an unauthenticated,
CSRF-exempt one-click target. Given a valid token it SHALL add the address to
the suppression list and respond `200` with an empty body. It SHALL be honoured
promptly (well within the 48-hour requirement).

#### Scenario: One-click POST suppresses and returns empty 200

- **WHEN** a mailbox provider POSTs to `/api/email/unsubscribe` with a valid
  token and body `List-Unsubscribe=One-Click`
- **THEN** the address is suppressed and the response is `200` with an empty
  body

#### Scenario: Invalid token is rejected

- **WHEN** `/api/email/unsubscribe` is POSTed with an invalid token
- **THEN** the response is a `4xx` error and no suppression row is created

### Requirement: No-login unsubscribe and resubscribe pages

The system SHALL expose `GET /email/unsubscribe` as a branded, no-login
confirmation page whose confirm button issues the POST to suppress the
address, so that link prefetchers and scanners cannot opt users out via a bare
GET. After suppression the page SHALL offer a resubscribe action backed by
`POST /api/email/resubscribe`, which removes the address from the suppression
list for a valid token.

#### Scenario: GET shows a confirmation page and does not mutate

- **WHEN** a user opens `GET /email/unsubscribe` with a valid token
- **THEN** a branded confirmation page is shown and no suppression change
  occurs until the user confirms

#### Scenario: Resubscribe removes suppression

- **WHEN** a suppressed user submits resubscribe with a valid token
- **THEN** the address is removed from the suppression list

### Requirement: List-Unsubscribe headers on suppressible mail

The system SHALL add `List-Unsubscribe` and `List-Unsubscribe-Post:
List-Unsubscribe=One-Click` headers to emails of category `notification` and
`invite`. The `List-Unsubscribe` value SHALL contain the HTTPS one-click URL
and, only when `EMAIL_UNSUBSCRIBE_MAILTO` is configured, a `mailto:` variant.
Emails of category `verification` and `admin` SHALL NOT carry these headers.

#### Scenario: Notification email carries one-click headers

- **WHEN** a `notification` email is sent
- **THEN** it includes a `List-Unsubscribe` header with the HTTPS unsubscribe
  URL and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`

#### Scenario: Verification email carries no unsubscribe headers

- **WHEN** a `verification` email is sent
- **THEN** it includes neither `List-Unsubscribe` nor `List-Unsubscribe-Post`

### Requirement: Suppressed recipients are skipped at send time

The system SHALL, before sending a suppressible-category email, skip
recipients present in the suppression list, marking the queued row with
`email_queue_skipped_reason = 'suppressed'` so it is not retried. Verification
emails SHALL be exempt and always send regardless of suppression.

#### Scenario: Suppressed notification is skipped

- **WHEN** a `notification` email is due for a suppressed address
- **THEN** it is not sent and the row is marked
  `email_queue_skipped_reason = 'suppressed'`

#### Scenario: Verification bypasses suppression

- **WHEN** a `verification` email is due for a suppressed address
- **THEN** it is still sent
