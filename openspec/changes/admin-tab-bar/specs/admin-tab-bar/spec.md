## ADDED Requirements

### Requirement: Every admin page MUST show the admin tab bar

Each admin page (Radiator, Jobs, Duplicates, Mislabeled, Artist split) SHALL
show a tab bar with a tab per admin page, linking to that page, with the
current page's tab marked as selected.

#### Scenario: Moving between tools
- **WHEN** an admin on the Jobs page clicks the Mislabeled tab
- **THEN** the Mislabeled page opens and its tab is the selected one

#### Scenario: No hub buttons
- **WHEN** an admin opens any admin page
- **THEN** the page has no "Back to Radiator" button and the Radiator page has no row of tool buttons
