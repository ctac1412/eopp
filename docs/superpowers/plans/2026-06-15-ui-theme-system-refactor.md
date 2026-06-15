# UI Theme System Refactor Plan

## Summary

Refactor frontend colors and typography into a shared theme system with runtime support for `dark` and `light` themes. The first implementation phase should create the theme infrastructure and preserve the current dark look as the default.

## Phase 1: Theme Runtime And Shared Tokens

- Replace the single `eoppTokens` export with named theme definitions:
  - `darkThemeTokens`
  - `lightThemeTokens`
  - shared typography/density tokens
- Add a small theme runtime around `ConfigProvider` in `frontend/src/main.jsx`:
  - store active theme in `localStorage`, e.g. `eopp_theme`
  - default to `dark`
  - set `data-theme="dark"` or `data-theme="light"` on the app/root element
  - pass generated AntD theme into `ConfigProvider`
- Change `frontend/src/ui/theme/antdTheme.js` from static `antdTheme` to a function like `createAntdTheme(mode)` or `createAntdTheme(tokens)`.
- Mirror theme values into CSS variables in `frontend/src/styles/01-variables.css`:
  - `:root, [data-theme="dark"]` for dark
  - `[data-theme="light"]` for light
- Add a minimal theme switch control in a shared-visible place:
  - recommended: admin header actions in `AdminPage.jsx`
  - button/segmented control: `Темная` / `Светлая`
  - persisted immediately to `localStorage`
- Keep current dark palette visually close to current behavior.
- Light theme can be basic but usable: readable text, light surfaces, visible borders, AntD components not broken.

## Phase 2: Replace Local Palette And Typography Hardcodes

- Replace repeated hardcoded colors in shared UI CSS:
  - `frontend/src/ui/styles/layout.css`
  - `frontend/src/styles/03-components.css`
- Replace high-impact admin CSS hardcodes in `frontend/src/styles/05-pages.css`.
- Replace repeated palette values with semantic CSS variables:
  - background, surfaces, raised surfaces
  - borders and strong/soft borders
  - heading/body/muted/subtle/disabled text
  - table header, row hover, selected row
  - focus ring
  - status colors
- Convert repeated font-family/font-size decisions to typography variables where practical.
- Leave true one-off feature accents only when they are not part of the reusable palette.
- Ensure both dark and light themes use the same semantic variable names.

## Phase 3: Visual Tuning And Theme Readiness

- Tune the dark theme to recover the old design's readability:
  - less harsh base background
  - clearer body and muted text
  - calmer borders
  - less heavy selected-row purple
  - readable dense tables
- Tune the light theme enough for real use:
  - no low-contrast text
  - tables/cards/forms/modals readable
  - statuses remain distinct
- Add short docs explaining future theme edits:
  - edit theme values in `frontend/src/ui/theme/tokens.js`
  - keep AntD mapping in `frontend/src/ui/theme/antdTheme.js`
  - avoid new raw palette colors in page CSS
- Verify key screens in both themes:
  - admin reports usage log
  - invoices
  - companies or users table
  - one modal

## Acceptance Criteria

- Dark/light switching works without reload or with only a controlled rerender.
- Selected theme persists across reloads.
- Future palette swaps are mostly centralized.
- Dense admin screens remain readable in both themes.

## Assumptions

- Default theme remains dark.
- Phase 1 includes the actual dark/light switch, not only token preparation.
- Light theme starts as functional and readable, not fully polished.
- No backend changes are needed.
- Execution should start with Phase 1 only, then verify before Phase 2.
