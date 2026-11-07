# Tasks

## 1. Documentation

- [x] 1.1 Delete the bullet "Frontend will use relative `/api` automatically when no explicit API URL is configured." from the "Recommended (same domain, path-based routing)" list in `PREVIEW_DEPLOYMENT.md`, leaving the other three bullets unchanged; verify with `grep -c 'relative \`/api\`' PREVIEW_DEPLOYMENT.md` returning 1 and `git diff` showing a single removed line

## 2. Verification

- [x] 2.1 Run the repository verification command `yarn test` and confirm it passes (the change is documentation-only, so no failures are expected from it)
