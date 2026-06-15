# Frontend Theme System

The frontend supports `dark` and `light` runtime themes. The active theme is stored in `localStorage` under `eopp_theme` and applied as `data-theme` on the document/root element.

## Where To Edit

- Theme token source: `frontend/src/ui/theme/tokens.js`
- AntD token mapping: `frontend/src/ui/theme/antdTheme.js`
- CSS variable mirror: `frontend/src/styles/01-variables.css`
- Runtime provider: `frontend/src/main.jsx`

When changing palette values, update both `tokens.js` and `01-variables.css` so AntD components and local CSS stay aligned.

## CSS Guidance

Prefer semantic variables in page and component CSS:

- Surfaces: `--bs-body-bg`, `--surface`, `--surface-raised`, `--surface-muted`, `--surface-sunken`
- Borders: `--border`, `--border-soft`, `--border-strong`, `--border-bright`
- Text: `--text`, `--text-heading`, `--text-muted`, `--text-subtle`, `--text-disabled`
- Tables: `--table-header-bg`, `--table-row-hover-bg`, `--table-row-selected-bg`
- Focus and interaction: `--focus-ring`, `--hover-muted-bg`, `--accent-surface-*`
- Statuses: `--success-*`, `--warning-*`, `--danger-*`, `--info-*`

Avoid adding new raw palette colors to shared UI or page CSS. Keep raw colors only for true one-off visuals, such as print/PDF invoice output or image/canvas inspection surfaces where fixed white/black styling is intentional.

## Adding A Theme Value

1. Add the semantic variable to both dark and light blocks in `01-variables.css`.
2. If AntD also needs the value, add it to `darkThemeTokens` and `lightThemeTokens` in `tokens.js`.
3. Use the semantic variable from feature CSS instead of repeating a hex or rgba value.
4. Check dense admin tables and modals in both themes after the change.
