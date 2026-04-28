# Login Failed Page — Design Spec

## Goal

Show a clear, dedicated error view when Google OIDC login fails, with a link back to the login page so the user can retry.

## Background

The backend redirects to `/?loginFailed=true` on any OIDC authentication failure (e.g. sign-up closed with no invite code, token verification error). Currently `UserLogin.js` shows a small inline paragraph at this URL but leaves the full login UI visible alongside it, which is ambiguous. The user needs a clearer signal that login failed and an explicit path to retry.

## Design

### Behaviour

- When `/?loginFailed=true` is the current URL, `UserLogin.js` renders an **error view** instead of the normal login UI.
- When the URL has no `loginFailed` param, `UserLogin.js` renders the normal login UI, unchanged.

### Error view content

1. **Heading** — "Login failed"
2. **Message** — "Your login attempt was not successful. This can happen when registration is closed and no invite code was provided, or if there was a problem during authentication."
3. **Link** — "← Back to login" pointing to `/`, which loads the clean login page with no `loginFailed` param.

### Implementation scope

- **Modified file:** `packages/front/src/UserLogin.js` only.
- **No backend changes** — the backend already redirects to `/?loginFailed=true`.
- **No new routes** — `/` renders the existing login page; stripping the param is sufficient.
- **No App.js changes** — the check is self-contained inside `UserLogin.js`.

### Styling

Follow the existing conventions in the login page:
- Dark background context (rendered inside the existing dark container in `App.js`)
- Same font sizes and spacing as surrounding elements
- The "← Back to login" link uses the existing button class: `button button-push_button button-push_button-large button-push_button-primary`

## Out of scope

- Distinguishing between failure reasons (invite code vs. authentication error) — a single generic message is sufficient.
- Animations or transitions.
- Any changes to the backend redirect target.
