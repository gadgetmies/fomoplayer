## ADDED Requirements

### Requirement: The top bar search MUST show its icon centred

The top bar search SHALL show its magnifying glass (or, with content, its
clear button) whether or not the input has focus and whichever page is open,
vertically centred in the bar.

#### Scenario: Unfocused on Discover
- **WHEN** the user is on Discover and the search input does not have focus
- **THEN** the magnifying glass shows, centred in the bar

### Requirement: Going back to a search MUST show it at once

Going back or forward to a search SHALL open the search results and show that
search's terms in the top bar immediately, before its results arrive.

#### Scenario: Back from Settings
- **WHEN** the user searched for `label:Vision Recordings concussion`, opened Settings and goes back
- **THEN** both terms show in the top bar before the search request completes

### Requirement: Navigating away MUST either keep the search with a way back or clear it

Opening another track list (Discover, a cart) or Notifications SHALL empty
the top bar search, artist, label and text terms and typed text alike.
Opening any other page (Settings, Admin) SHALL keep the search in the top bar
and show a "Show results" link, styled as an outlined pill (navigation, not an
action; the icon alone on narrow screens), that opens its results again.
Hovering or tapping the link SHALL NOT move it or resize the search bar.

#### Scenario: Settings
- **WHEN** the user opens Settings with a search active
- **THEN** the search's terms stay in the top bar and "Show results" opens its results

#### Scenario: Discover
- **WHEN** the user opens Discover with a search active
- **THEN** the top bar search is empty

#### Scenario: Notifications
- **WHEN** the user opens Notifications with a search active
- **THEN** the top bar search is empty
