# Tasks

## 1. README fixes

- [x] 1.1 In `README.md`, remove the trailing full stop from the `# Fomo Player - A Music Discovery App.` heading; verify with `head -1 README.md` that the line ends in `App`
- [x] 1.2 In `README.md`, add a full stop to the end of the sentence ending `on Bandcamp, Beatport and Spotify`; verify with `grep -n 'Spotify\.$' README.md`
- [x] 1.3 In `README.md`, change the screenshot `alt="image"` to `alt="Fomo Player track list"`; verify with `grep -n 'alt="Fomo Player track list"' README.md` and that `git diff --stat master` shows only `README.md` outside `openspec/`

## 2. Verification

- [ ] 2.1 Run the repository verification `yarn test` and confirm it passes (the change is documentation-only, so no test outcome should differ from `master`)
