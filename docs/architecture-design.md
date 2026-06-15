# EOPP Architecture Notes

Updated: 2026-06-15.

This document records the current architecture after the legacy cleanup audit.
Historical domain-module sketches were removed because they referenced
nonexistent `domains/*/routes.py` files and an EventBus migration that is not
the runtime contract today.

## Current Server Shape

The FastAPI application is assembled from `server/src/app.py` and
`server/src/routes/__init__.py`. HTTP adapters live in `server/src/routes/*`.

Important route modules:

| Area | Current module |
|---|---|
| Captcha solve flow | `server/src/routes/captcha.py` |
| Usage lifecycle | `server/src/routes/usage.py` |
| Captcha records | `server/src/routes/captchas.py` |
| Admin, billing, RBAC views | `server/src/routes/admin.py` |
| Operators and realtime admin views | `server/src/routes/operator.py` |
| Distribution | `server/src/routes/distribution.py` |
| Shared slots | `server/src/routes/slots.py` |
| Mock EOPP API | `server/src/routes/mock.py` |

Protected captcha runtime code lives under `server/src/core/captcha_runtime/*`.
It must not import billing, CRM, admin routes, FastAPI adapters, DB
repositories, or access/audit modules. Adjacent behavior is injected through
contracts from the route layer.

## Side Work

Core endpoints should keep their response path short:

- `/solve-captcha`
- `/solve`
- `/register-usage`
- `/confirm-usage`
- `/fail-usage`

Side effects that can wait are queued through
`server/src/platform/jobs/queue.py::enqueue_deferred_job()` and handled by the
registry returned from `server/src/platform/jobs/registry.py::default_registry()`.

Current retained job-name compatibility:

| Legacy name | Current handler owner |
|---|---|
| `usage_enrich` | `server/src/modules/crm/jobs.py` |
| `billing_confirm` | `server/src/modules/billing/jobs.py` |

## Frontend And Extension Contracts

The admin frontend uses path-based tabs: `/admin/:tabId`. The old
`/admin?tab=...` redirect contract was removed.

The browser extension accepts the current captcha generation shapes:

- EOPP v2 `front`
- internal `puzzle`

The old top-level `{ variants: [{ tiles }] }` captcha response adapter was
removed from `extension/src/api/stages.ts`.

## Migration Layout

The active Alembic tree is `server/migrations/versions`, configured by
`server/alembic.ini` with `script_location = %(here)s/migrations`.
