## ADDED Requirements

### Requirement: Shared branded email layout

The system SHALL provide a single shared layout used to render all
user-facing emails. The layout SHALL be email-client-safe: table-based,
fully inline-styled (no reliance on `<style>` blocks), constrained to a
maximum width of ~600px, and using a `'Lato', -apple-system, sans-serif`
font stack. It SHALL present the "Fomo Player" wordmark, the brand magenta
`#b40089`, a hidden preheader from the caller-supplied preview text, and a
footer.

#### Scenario: User-facing emails share one layout

- **WHEN** a verification, invite, or notification email is rendered
- **THEN** it is wrapped in the shared layout with the wordmark, brand
  colour, preheader, and footer

#### Scenario: Layout uses inline styles only

- **WHEN** the rendered HTML is inspected
- **THEN** all visual styling is applied via inline `style` attributes so it
  survives email clients that strip `<style>` blocks

### Requirement: Call-to-action button matches the app button

The primary call-to-action button in emails SHALL match the application's
button style exactly: background `#b40089`, a `1px solid #530059` border,
`4px` border radius, and white text.

#### Scenario: CTA button styling

- **WHEN** an email with a primary action is rendered
- **THEN** its button uses background `#b40089`, border `1px solid #530059`,
  radius `4px`, and white text

### Requirement: Branding is applied at send time

The system SHALL store the caller-authored content fragment plus category in
`email_queue` and apply the branded layout when the email is sent, so that
branding, unsubscribe links, and headers are produced in one place.

#### Scenario: Fragment is wrapped on send

- **WHEN** `sendNextEmailBatch` sends a categorised, user-facing row
- **THEN** the stored content fragment is wrapped in the shared branded
  layout before being handed to the provider

### Requirement: Per-email content builders and clearer copy

The system SHALL provide content builders for the verification, invite, and
notification emails that return a subject, an HTML content fragment, a plain
text alternative, and a category. Copy SHALL clearly state why the recipient
received the email and present a single prominent call to action; the
verification email SHALL include guidance to ignore it if unrequested.

#### Scenario: Verification email content

- **WHEN** a verification email is built for a verification URL
- **THEN** it produces category `verification`, a clear subject, a prominent
  verify action, and "ignore if you didn't request this" guidance

#### Scenario: Notification email content

- **WHEN** a search-notification email is built for new track results
- **THEN** it produces category `notification`, lists the matched tracks,
  and links to the search results as the primary action

### Requirement: Admin alerts remain plain

The system SHALL send admin alert emails (category `admin`) as plain,
unbranded content without the user-facing layout or unsubscribe affordances.

#### Scenario: Admin alert is not branded

- **WHEN** an admin alert is sent
- **THEN** it is delivered as plain content with no branded layout and no
  unsubscribe footer or header
