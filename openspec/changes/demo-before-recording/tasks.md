## 1. Test helper

- [x] 1.1 `demoTest()` and `isBeforeChange` in `packages/back/test/lib/demo-test.js`; clear error when the before phase has no cases

## 2. Workflow

- [x] 2.1 `pr-demo-local.yml`: plan job turns the `demo-test` / `demo-test-before` blocks into the matrix
- [x] 2.2 Before job switches app code to `HEAD^1` keeping `packages/back/test`; phase-specific artifact, trace path and comment

## 3. Docs

- [x] 3.1 `demo-tests` skill: the optional block, `casesBeforeChange`, what the before phase can and cannot use, opening the PR early, re-recording on rebase
