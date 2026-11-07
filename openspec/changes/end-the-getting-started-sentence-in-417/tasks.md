# Tasks

## 1. README fix

- [ ] 1.1 In `README.md`, add a full stop after the wiki link at the end of the sentence `To get started, please [visit the wiki](https://github.com/gadgetmies/fomoplayer/wiki/Getting-started)`; verify with `grep -n 'Getting-started)\.$' README.md` and that `git diff --stat master` shows only `README.md` outside `openspec/`

## 2. Verification

- [ ] 2.1 Run the repository verification `yarn test` and confirm it passes (the change is documentation-only, so no test outcome should differ from `master`)
