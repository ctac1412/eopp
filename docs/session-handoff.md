# Session handoff

Snapshot for the next Codex session. Keep this file short and update it when a session changes important project assumptions.

## Current priority

We are stabilizing the browser extension around the current EOPP frontend contracts. Do not release, push, deploy, bump plugin version, build CRX, or update `plugins/update.xml` unless the user explicitly asks.

The user wants changes in larger batches: avoid frequent commits and avoid test runs after every tiny edit. For extension code, `npm run typecheck` is the main quick check; `npm run build` is useful but can need sandbox escalation because esbuild may not read `vite.config.ts` inside the sandbox.

## Extension contract facts

Site source is saved as `eopp_original.js`.

Known enums from site:

- `EoppTransportType`: `Cargo = 1`, `Tso = 2`, `Special = 3`, `TsoSpecial = 4`.
- Vehicle subtype: `Truck = 1`, `Trailer = 2`.
- Facility mode: `Unspecified = 0`, `Timeslot = 1`, `Special = 2`, `Queue = 3`, `Stopped = 4`.

Site chooses vehicle id from reservation `vehicleData.find(subTypeId == Truck)`, not blindly `vehicleData[0]`.

Site computes transport type like:

```ts
isTsoMode
  ? isSpecialCargo ? TsoSpecial : Tso
  : isSpecialCargo ? Special : Cargo
```

`encryptedSettings` is a site `localStorage` key. When present, the site treats TSO mode as enabled and sends that value as `encryptedTso`. In normal mode `encryptedTso` is `null`.

`typeOfTransportation` in reservation raw is not the same as submit `transportType`; do not use it for EOPP submit payloads.

## Raw objects

Reservation raw is returned by:

```text
GET https://eopp.epd-portal.ru/reservations-api/v1/{reservationId}
```

Important fields:

- `id`: reservation id.
- `reservationRequestCode`: display number.
- `facilityId`: selected APP id.
- `vehicleData`: source for truck `vehicleId`.
- `isSpecialCargo`: source for transport type.
- `reservedSlots`: may matter for reschedule.

Facility raw is returned by:

```text
GET https://eopp.epd-portal.ru/facility/Facility/get-facility/{facilityId}
```

Important fields:

- `id`, `name`, `tz`, `isWorks`, `isReadonly`.
- `settings.approveReservation`.
- `settings.nonArrival.tsoBooking`.
- `mode.modeType`.
- `mode.reservationLock`.
- `mode.isFacilityStopped`.

Available dates contract:

```text
GET /reservations-api/v1/timeslot/AvailableDates
  ?facilityId=...
  &fromDate=YYYY-MM-DD
  &transportType=...
  &vehicleId=...
```

Response example:

```json
[
  "2026-05-22",
  "2026-05-23",
  "2026-05-24",
  "2026-05-25",
  "2026-05-26",
  "2026-05-27",
  "2026-05-28"
]
```

Current decision: add local contract/call first, do not integrate into pipeline yet. Later decide whether to use it for date validation/default date selection.

## Extension files touched/important

- `yandex-browser-plugin/src/api/eopp-contract.ts`
  Centralizes EOPP enums and builders: truck vehicle id, TSO/encryptedTso, transport type, captcha context, submit payloads.

- `yandex-browser-plugin/src/index.tsx`
  On plugin open it fetches reservation raw, then facility raw by `facilityId`. It also has page-request cache/interceptor plumbing with fallback fetch.

- `yandex-browser-plugin/page-interceptor.js`
  Injected into page context to intercept site `fetch`/XHR responses. It currently tracks reservation raw and facility raw. It worked in manual testing. No noisy logs should remain, only warnings on parse errors.

- `yandex-browser-plugin/vite.config.ts`
  Generates manifest and copies `page-interceptor.js`. Content script uses `run_at: document_start`; `page-interceptor.js` is in `web_accessible_resources`.

- `yandex-browser-plugin/src/types.ts`
  Contains typed `EoppReservationRaw`, `EoppFacilityRaw`, `EoppVehicleData`, `AvailableDatesResponse`.

- `yandex-browser-plugin/src/api/stages.ts`
  Uses eopp-contract builders for current captcha/validate/submit payloads. A separate `getAvailableDates` function should exist or be added here, but it should not be wired into pipeline until explicitly decided.

- `yandex-browser-plugin/src/components/ConfigForm.tsx`
  Computed fields should not be editable in popup: reservation id, vehicle id, transport type, APP/facility. Show compact read-only summary instead. Keep hidden/debug controls only if useful.

## Current UI direction

Popup summary should show:

- reservation: `reservationRequestCode` or short id.
- APP: `facilityRaw.name` or `facilityId`.
- truck: truck `regNumber` or short vehicle id.
- type: computed `Cargo/TSO/Special/TSO Special`.
- APP mode: `facilityRaw.mode.modeType`.

Do not expose technical computed fields as normal editable inputs.

## Known workflow notes

Captcha contracts changed:

- Generate request is now `{ payload: { facilityId, timeSlotData, reservationId, encryptedTso } }`.
- Generate response is now `{ token, front: { tiles, variantsCapture, type } }`.
- Validate request is `{ captchaToken, answer, payload: { reservationId, facilityId, timeSlotData, encryptedTso } }`.
- Validate response is `{ isValid: true, successToken }`.

SubmitDraft from site:

```ts
{
  reservationId,
  facilityId,
  arrivalDatePlan: modeType === Queue ? null : date,
  intervalIndex,
  transportType: getTransportationType(),
  modeType,
  isTso,
  encryptedTso,
  captchaToken
}
```

Reschedule from site uses `transportType` from special cargo/cargo and includes `encryptedTso`.

## Open questions

- Whether to use `AvailableDates` before `AvailableSlots` in the pipeline. For now, no.
- Whether page interceptor should also cache `AvailableDates`. User paused that path and asked first for local contracts/calls.
- Whether `modeType` fallback should remain `Timeslot` when `facilityRaw` is missing. Current assumption: yes.

## Verification status

Recent extension checks:

- `npm run typecheck` passed after adding `AvailableDatesResponse` and `getAvailableDates`.
- Latest `npm run build` attempt was blocked by environment usage/sandbox escalation limit, not by code errors.

## Git/worktree note

The worktree may have unrelated frontend/admin changes from the user. Do not revert them. Before editing, check `git status --short`.
