## 1. Shared pieces

- [ ] 1.1 `abTiming.js` (A↔B mapping, loop region, matched-at / tempo formatting) + Jest tests
- [ ] 1.2 Fix `queryNotifications` display-name regexes + back-end regression test

## 2. Bell and routing

- [ ] 2.1 App: unread-count polling, events/matches/similar loaders, `/notifications/*` route with Player `panelOnly`
- [ ] 2.2 TopBar: Notifications link with bell + badge

## 3. Notifications page

- [ ] 3.1 Activity tab: rows, New dot, why, play with source, mark all read, empty state
- [ ] 3.2 Samples tab: samples table (upload/delete/play), matches table, Sounds like + follow suggestions
- [ ] 3.3 Subscriptions tab: grouped list with bells, add search
- [ ] 3.4 Preview: A/B control, loop-match, matched-at/tempo details for A/B pairs

## 4. Settings

- [ ] 4.1 Notifications tab → Email; redirect `/settings/notifications`; remove moved sections
- [ ] 4.2 Bells on followed artists / labels

## 5. Verify and ship

- [ ] 5.1 Demo tests `notifications-page-local.js` / `-preview.js` with shared steps
- [ ] 5.2 Front-end unit tests, browser tests, full back-end suite
- [ ] 5.3 Atomic commits, push, PR with demo blocks, preview deploy
