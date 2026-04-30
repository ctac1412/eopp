# Refactor Plan: content.js → React + Shadow DOM + TypeScript

## Status: [x] Phase 1: Infrastructure — package.json, tsconfig.json, vite.config.ts, manifest.json
## Status: [x] Phase 2: Types + API Layer — types.ts, constants.ts, api/client.ts, api/background.ts, api/stages.ts, api/pipeline.ts
## Status: [x] Phase 3: Zustand Store — store.ts
## Status: [x] Phase 4: React Components — Modal, ConfigForm, Scheduler, StatusBar + hooks useInjector, useScheduler, useClock
## Status: [x] Phase 5: Shadow DOM + Entry Point — index.tsx, App.tsx
## Status: [x] Phase 6: Build + Manifest — vite build, Makefile
## Status: [ ] Phase 7: Testing — localhost + eopp.epd-portal.ru

---

## Architecture

```
yandex-browser-plugin/
├── src/
│   ├── index.tsx              — entry: button + Shadow DOM + mount
│   ├── App.tsx                — root React component
│   ├── types.ts               — TypeScript interfaces
│   ├── constants.ts           — facilityId, URL, TZ_OFFSET
│   ├── store.ts               — Zustand store
│   ├── content.css            — inline CSS (injected into Shadow DOM)
│   ├── vite-env.d.ts          — CSS ?inline module declaration
│   ├── api/
│   │   ├── client.ts          — fetch + retryOn429
│   │   ├── background.ts      — port messaging
│   │   ├── stages.ts          — 5 stages (pure async functions)
│   │   └── pipeline.ts        — main(), selectBestSlot, usedSlotIds
│   ├── components/
│   │   ├── Modal.tsx
│   │   ├── ConfigForm.tsx
│   │   ├── Scheduler.tsx
│   │   └── StatusBar.tsx
│   └── hooks/
│       ├── useInjector.ts
│       ├── useScheduler.ts
│       └── useClock.ts
├── content.css                — button styles only (global, for the floating button)
├── background.js              — unchanged
├── manifest.json              — js: ["dist/content.js"]
├── dist/
│   └── content.js             — 502 KB (155 KB gzipped)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── icon.png
└── icon128.png
```

## Key Decisions

- **Shadow DOM** for style isolation from host page
- **React 18 + Zustand** — same stack as main frontend
- **TypeScript strict mode**
- **Single IIFE bundle** via Vite → dist/content.js
- **CSS inlined** via `?inline` import into Shadow DOM
- **background.js** stays vanilla JS (unchanged)

## Build Commands

```bash
make install-extension    # npm install
make build-extension      # vite build → dist/content.js
```
