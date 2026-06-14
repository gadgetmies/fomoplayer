## Purpose

Define how per-API-key rate limits are assigned at mint time: admin-owned keys
receive effectively-unlimited limits so analyser workloads cannot trip `429`s,
while non-admin keys keep the default per-minute and per-day caps. Limits are
baked into the key row at mint time and not recomputed per request, so admin
status changes after the fact do not retroactively widen or narrow an existing
key.

## Requirements

### Requirement: Admin-owned API keys are minted with unlimited rate limits

The system SHALL store effectively-unlimited rate limits on an API key row
when that key is minted for an account that qualifies as an admin, instead of
the default per-minute and per-day limits. An account qualifies as admin when
one of its OIDC subjects appears in the `ADMIN_USER_SUBS` configuration — the
same rule used for admin authorization at request time.

This applies to every API-key minting path, including `/cli-token` and
`/api-keys/exchange-handoff`. The limits are baked into the key row at mint
time and are not recomputed on later requests.

#### Scenario: Admin account mints a key

- **WHEN** an API key is minted for an account whose OIDC subject is listed in
  `ADMIN_USER_SUBS`
- **THEN** the stored key's per-minute and per-day rate limits are set to the
  unlimited values (`1000000000` each)
- **AND** requests authenticated with that key are not rejected with `429`
  under normal analyser load

#### Scenario: Admin mints via either route

- **WHEN** an admin account mints a key through `/cli-token`
- **OR** through `/api-keys/exchange-handoff`
- **THEN** the resulting key receives the unlimited rate limits in both cases

### Requirement: Non-admin API keys keep the default rate limits

The system SHALL continue to mint non-admin API keys with the existing default
rate limits, and minting paths that do not supply explicit limits SHALL fall
back to those defaults.

#### Scenario: Non-admin account mints a key

- **WHEN** an API key is minted for an account whose OIDC subject is not listed
  in `ADMIN_USER_SUBS`
- **THEN** the stored key's per-minute limit is 60 and its per-day limit is
  1000

#### Scenario: Limits frozen at mint time

- **WHEN** an account's admin status changes after a key has been minted
- **THEN** the previously minted key keeps the rate limits it was minted with
  until a new key is minted
