---
id: 104
title: Accessibility audit & remediation
effort: L
created: 2026-05-07
---

# Accessibility audit & remediation

## Why

Music apps are background-use apps — VoiceOver / TalkBack users
rely on them heavily, often eyes-off. A11y is not optional.

## What

- Audit every screen with VoiceOver (iOS) and TalkBack (Android):
  every interactive element has a meaningful label, traversal
  order is sensible, dynamic type up to the largest setting still
  fits.
- Hit targets ≥ 44×44 pt (iOS) / 48×48 dp (Android).
- Colour-contrast meets WCAG 2.1 AA; no information conveyed by
  colour alone.
- Reduce-motion respected for list animations and onboarding
  transitions.
- Document remediation fixes in `notes.md`.

## Acceptance criteria

- [ ] Every interactive element has an `accessibilityLabel`.
- [ ] Tab navigation, list scrolling, and player controls all
      work with the screen reader.
- [ ] Dynamic type at largest setting does not clip critical text
      anywhere.
- [ ] Reduce-motion disables non-essential animation.
