# Email deliverability & branding — deploy / DNS rollout checklist

These steps are **manual, environment-specific, and external** (Namecheap DNS +
Resend dashboard). They are intentionally not infra-as-code. Run them in order
at cutover. Corresponds to tasks 7.1–7.4 of the
`email-deliverability-and-branding` change.

## Prerequisites (already shipped in code / config)

- `RESEND_API_KEY` set in the production environment.
- `EMAIL_UNSUBSCRIBE_SECRET` set (rotate independently of `SESSION_SECRET`).
- Optional `EMAIL_UNSUBSCRIBE_MAILTO` (adds a `mailto:` List-Unsubscribe variant).
- `CLOUDMAILIN_USERNAME` / `CLOUDMAILIN_API_KEY` removed from the environment.
- Migrations applied (`email_unsubscribe`, new `email_queue` columns).

## 7.1 Publish the DMARC policy (Namecheap)

Replace the stray `_dmarc` **CNAME** with a **TXT** record:

```
Host:  _dmarc
Type:  TXT
Value: v=DMARC1; p=none; rua=mailto:dmarc@fomoplayer.com; adkim=r; aspf=r
```

Leave the already-correct Resend records in place:
- `send` subdomain SPF (`v=spf1 include:...`) and its MX (`send.forge.rmta.net`).
- `resend._domainkey` DKIM TXT.

## 7.2 Verify Resend + confirm alignment

1. In the Resend dashboard, confirm the `fomoplayer.com` domain shows **all
   records verified** (SPF, DKIM, DMARC).
2. Send a test email (e.g. trigger a verification email to a mailbox you own, or
   use Resend's test send).
3. Confirm the message passes **SPF, DKIM, and DMARC with alignment** via
   [mail-tester.com](https://www.mail-tester.com/) and/or Google Postmaster
   Tools. `From:` must stay on `@fomoplayer.com` so DKIM aligns to the org domain.

## 7.3 Decommission CloudMailin DNS

Once Resend is confirmed sending in production, remove the leftover CloudMailin
record:

```
Host:  (the feedback-smtp / bounce host)
Type:  CNAME
Value: feedback-smtp.cloudmta.net
```

Do this **after** step 7.2 so bounce handling isn't disrupted mid-flight.

## 7.4 Tighten DMARC (after monitoring)

Monitor `rua` aggregate reports for ~1–2 weeks. Once SPF/DKIM/DMARC pass
consistently for legitimate mail:

1. `p=none` → `p=quarantine` (optionally `pct=` ramp).
2. After continued clean reports, `p=quarantine` → `p=reject`.

Revert to `p=none` if reports show a misconfiguration.
