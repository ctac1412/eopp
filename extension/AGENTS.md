# EOPP Browser Extension Instructions

## Versioning

The extension version is defined in `package.json`.

- `vite.config.ts` reads `package.json` and writes that version into `dist/manifest.json` during build.
- Do not edit `dist/manifest.json` manually.
- For code changes in `extension/`, bump `package.json` and run `npm run build`.

## Build

```bash
cd extension
npm run build
DEV_BUILD=true npm run build
```

## Checks

Use the narrowest check that covers the change:

- `npm run typecheck` for TypeScript/API contract changes.
- `npm run build` before handing off extension code changes.
- `npm run format:check` only when formatting churn is suspected.

## Structure

| File | Purpose |
|---|---|
| `package.json` | Package metadata and extension version source |
| `vite.config.ts` | Build config and generated manifest writer |
| `background.js` | MV3 service worker and server proxy |
| `src/index.tsx` | Content-script entry point |
| `src/App.tsx` | Main injected modal |
| `src/api/pipeline.ts` | Booking pipeline orchestration |
| `src/api/stages.ts` | EOPP/API stage adapters |
| `src/api/eopp-contract.ts` | Current EOPP payload builders |
| `src/store.ts` | Zustand runtime state |
| `src/constants.ts` | Defaults and constants |
| `src/types.ts` | Shared TypeScript contracts |
