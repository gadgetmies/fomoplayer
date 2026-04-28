# Login Failed Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline `loginFailed` paragraph in `UserLogin.js` with a dedicated error view that clearly signals failure and provides a "← Back to login" link to `/`.

**Architecture:** A single conditional at the top of `render()` in `UserLogin.js` checks `window.location.search.includes('loginFailed=true')`. When true, it returns an error view (heading + message + link). When false, the normal login UI renders unchanged.

**Tech Stack:** React (class component), existing button CSS classes.

---

### Task 1: Implement the login-failed error view in UserLogin.js

**Files:**
- Modify: `packages/front/src/UserLogin.js:70-97`

- [ ] **Step 1: Read the current render method**

Open `packages/front/src/UserLogin.js` and locate lines 70–97. Note the existing inline check at lines 95–97 that will be replaced.

- [ ] **Step 2: Replace the inline paragraph with a top-level conditional that renders the error view**

Replace the `render()` method so that when `loginFailed=true` is in the URL the entire method returns the error view instead of the normal UI. The `loginFailed` check currently sits *inside* the logged-out branch (line 95); move it *above* everything else so no login UI appears alongside the error.

The updated `render()` should look like this:

```jsx
render() {
  if (window.location.search.includes('loginFailed=true')) {
    return (
      <div className={this.props.className}>
        <h2>Login failed</h2>
        <p>
          Your login attempt was not successful. This can happen when registration is closed and no
          invite code was provided, or if there was a problem during authentication.
        </p>
        <a href="/" className="button button-push_button button-push_button-large button-push_button-primary">
          ← Back to login
        </a>
      </div>
    )
  }

  return (
    <div className={this.props.className}>
      {this.state.loggedIn ? (
        // ... (unchanged logged-in branch)
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <a
              href={this.props.googleLoginPath}
              className={`button button-push_button login-button button-push_button-${this.props.size} button-push_button-primary`}
            >
              Login {this.state.signUpAvailable && '/ Sign up'} with Google
            </a>
            {this.state.loginError ? 'Login failed' : ''}
          </div>
          {/* removed: loginFailed paragraph that was here */}
          {/* ... (rest of sign-up section unchanged) */}
        </>
      )}
    </div>
  )
}
```

Concretely, the diff is:
1. Add the early-return block before `return (` on line 71.
2. Delete lines 95–97 (the old `window.location.search.includes('loginFailed=true')` paragraph).

- [ ] **Step 3: Verify the file compiles**

```bash
cd /Users/gadgetmies/Documents/Projects/Code/multi_store_player/.worktrees/cli-agent-skill/packages/front
npx react-scripts build 2>&1 | tail -20
```

Expected: build succeeds (exit 0) with no JSX errors.

- [ ] **Step 4: Commit**

```bash
git add packages/front/src/UserLogin.js
git commit -m "Show dedicated login-failed error view with back-to-login link"
```
