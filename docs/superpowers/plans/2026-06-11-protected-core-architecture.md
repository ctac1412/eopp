# Protected Core Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect the captcha-solving core from billing, CRM, audit, training, plugin, and operator-side failures while moving non-critical work out of peak request paths.

**Architecture:** Keep FastAPI as the HTTP shell, extract a protected core runtime, and connect all add-on modules through events and background jobs. Enforce module boundaries with import-linter, use Redis-backed async jobs for deferred work, and replace global realtime locks with bounded per-client/per-captcha state.

**Tech Stack:** FastAPI, Python, SQLite/SQLAlchemy, Redis, arq or Taskiq, Import Linter, Prometheus/OpenTelemetry, Casbin or local RBAC tables.

---

## Execution Model

Use six parallel subagent tracks, but merge in phase order:

- **Core Isolation Agent:** Owns `core/`, import boundaries, captcha runtime extraction, and core smoke tests.
- **Async Jobs Agent:** Owns outbox/jobs, deferred captcha archive, deferred usage enrichment, and worker wiring.
- **Realtime Operators Agent:** Owns SSE/realtime registry, operator fanout, bounded queues, and lock reduction.
- **Access Audit Agent:** Owns RBAC, permissions, audit log, admin access checks, and security events.
- **Finance CRM Agent:** Owns billing, tariffs, prepaid, invoices, CRM enrichment, and making all of it event-driven.
- **Delivery Ops Agent:** Owns deploy, release manifests, backups, rollback, migration safety, and production delivery commands.

One coordinator should review after each phase. Do not let side-module agents import into core. If a task needs core data, add a contract/event in `core/contracts`, not a direct import from a module.

Every implementation chat should start with this goal addendum:

```text
Before coding, assess the current repository state:
- git status summary
- which files are already dirty
- which phase/layer is being touched
- what must be preserved from adjacent layers
- whether this task can proceed without mixing unrelated work

Then fix the layer boundary for this chat:
- name the layer being changed
- name layers that are out of scope
- add or update tests that prove the boundary
- do not move to another phase until this layer is verified
- finish with a commit that describes the layer/phase completed
```

---

## Target Directory Shape

Create this structure incrementally:

```text
server/src/core/
  __init__.py
  contracts/
    __init__.py
    events.py
    permissions.py
  captcha_runtime/
    __init__.py
    runtime.py
    sessions.py
    presenter.py
  access/
    __init__.py
    key_cache.py
  realtime/
    __init__.py
    registry.py
    fanout.py

server/src/platform/
  __init__.py
  jobs/
    __init__.py
    queue.py
    worker.py
  outbox/
    __init__.py
    models.py
    publisher.py
  observability/
    __init__.py
    metrics.py

server/src/modules/
  usage/
  billing/
  crm/
  operators/
  captcha_archive/
  training/
  audit/
  access/
```

Existing code can remain in `server/src/routes`, `server/src/services`, and `server/src/repositories` while migration is underway. New core code must not import `server/src/modules/*`.

---

## Current Delivery Findings

The current production delivery is split across independent scripts:

- `scripts/deploy/deploy.ps1` builds frontend, builds a Docker image, transfers it with `docker save`/`scp`/`docker load`, copies compose/nginx config, runs `docker compose up -d`, then health-checks.
- `scripts/deploy/rollback.ps1` chooses a previous Docker image from `docker images | grep eopp | grep -v current | head -1`, edits compose with `sed`, and restarts.
- `scripts/deploy/backup.ps1` downloads remote `data/` and `plugins/` into a local timestamped folder.
- `scripts/deploy/push-data.ps1` stops production, backs up DB on the remote host, replaces `api_keys.db`, removes WAL/SHM, restarts, then optionally pushes plugins.
- `scripts/deploy/push-plugins.ps1` builds/packs the extension and copies `plugins/` independently of app code and DB.
- `server/src/app.py` calls `init_db()` during app creation, so Alembic migrations run as part of container startup.

Main risks:

- Rollback is image-only and heuristic. It does not know the last known-good release.
- Rollback does not restore compose, nginx, plugin artifacts, DB snapshot, or migration state.
- Code, plugins, data, and config can be pushed independently with no single release identity.
- DB migrations happen during app startup, so a failed release can mutate production DB before health check fails.
- Backup exists but is manual, local-first, and not tied to every deploy as a mandatory pre-step.
- Plugin rollout is not versioned atomically with server code.

Target delivery model:

```text
release_id = timestamp + git_sha + image_tag

release bundle:
  image reference
  docker-compose.yml
  nginx config checksum
  plugin manifest + plugin files
  migration head before/after
  DB backup id
  data backup id
  env/config checksum
  health-check result
```

Rollback must restore a selected known-good release bundle, not "some older Docker image".

---

## Recommended Development Workflow

Current working style:

```text
copy production data locally
edit code
edit JSON captcha files
edit DB/content
sometimes push code only
sometimes push DB/files
sometimes push plugins
```

Keep this workflow, but make it explicit and safe. Treat every local change as one of three lanes:

```text
Lane A: code-only
  Python/frontend/extension/server code, migrations, config templates

Lane B: content-only
  plugins, captcha JSON datasets, labels, fixtures, static files

Lane C: data-change
  production DB changes, tariffs, companies, roles, audit-visible admin data
```

Preferred working model:

```text
prod snapshot -> local sandbox -> edit everything -> build release bundle -> preview diff -> backup prod -> promote bundle to prod -> verify
```

This plan supports pushing the local DB and files to production, but treats that as a full state promotion with guardrails, not a loose file copy.

Allowed production update types:

```text
code release
plugin release
content bundle release
DB migration
DB data patch
full state promotion
full emergency restore
```

Full DB push is allowed when it is packaged as `full_state_promotion`.

Recommended local sandbox layout:

```text
data/prod_snapshots/<snapshot_id>/
  api_keys.db
  captcha_examples/
  plugins/
  manifest.json

data/dev_sandbox/
  api_keys.db
  captcha_examples/
  plugins/
```

Every pull from prod creates a snapshot manifest:

```json
{
  "snapshot_id": "20260611_183000",
  "source": "production",
  "release_id": "20260611_181500-a1b2c3d",
  "db_sha256": "...",
  "plugins_sha256": "...",
  "captchas_sha256": "...",
  "created_at": "2026-06-11T18:30:00+03:00"
}
```

For DB/content edits, either export a small change-set or create a full state promotion:

```text
changesets/
  20260611_190000-tariff-update/
    manifest.json
    apply.py or apply.sql
    rollback.py or rollback.sql
    before.json
    after.json
    touched_tables.txt
```

Change-set manifest:

```json
{
  "change_id": "20260611_190000-tariff-update",
  "base_snapshot_id": "20260611_183000",
  "type": "db_data_patch",
  "tables": ["tariffs", "company_aliases"],
  "requires_backup": true,
  "requires_app_stop": false,
  "rollback": "rollback.sql"
}
```

This lets local data work stay comfortable while production receives controlled, auditable patches instead of accidental whole-DB replacement.

Full state promotion bundle:

```text
releases/<release_id>/
  image.tar or image reference
  docker-compose.yml
  nginx-default.conf
  plugins/
  data/
    api_keys.db
    captcha_examples/
  release.json
  diff/
    db_schema_before.txt
    db_schema_after.txt
    db_table_counts_before.json
    db_table_counts_after.json
    plugins_before.json
    plugins_after.json
    files_changed.txt
```

Promotion rules:

```text
1. Pull fresh prod snapshot before starting data work.
2. Record base_snapshot_id in release.json.
3. Local app edits only the sandbox copy.
4. Before push, generate DB/file diff summary.
5. Production backup is mandatory.
6. Prod app is stopped or put into maintenance mode.
7. Replace DB and files atomically from staging paths.
8. Remove stale WAL/SHM unless bundle explicitly includes consistent WAL state.
9. Start app, run migrations if needed, run health checks.
10. If health fails, restore backup automatically.
```

Local development remains isolated from release by making release an explicit packaging step:

```text
local edits do not affect prod
prod changes happen only through promote-state.ps1 or deploy release
promote-state requires release_id, base_snapshot_id, backup_id, and explicit confirmation
```

Optional remote prod DB access:

```text
Do not mount prod SQLite into the local app for editing.
Use remote access only to pull snapshots, inspect, or prepare a staging bundle.
Writes to prod still happen through full state promotion.
```

Environment profiles:

```text
.env.local
  local sandbox DB
  local plugins
  can edit freely

.env.snapshot
  tools for pulling prod snapshot
  no app server writes

.env.release
  deploy/promote scripts only
  requires explicit target production
```

Guardrails:

```text
EOPP_ENV=local refuses production remote paths
EOPP_ENV=release is required for promote-state
promote-state refuses if base_snapshot_id is missing
promote-state refuses if backup failed
promote-state prints DB table count diff before confirmation
local app startup prints DB identity and snapshot id
```

---

## Phase 0: Baseline And Safety Net

**Owner:** Core Isolation Agent  
**Goal:** Freeze current behavior with smoke tests before moving code.

**Files:**
- Create: `tests/test_core_smoke.py`
- Create: `.importlinter`
- Modify: `pyproject.toml`

- [ ] Add core smoke tests for manual captcha flow: receive captcha, push pending session, submit `/solve`, return answer.
- [ ] Add smoke test proving `/confirm-usage` returns success when billing hooks are disabled or failing.
- [ ] Add import-linter to dependencies.
- [ ] Configure initial contracts:
  - `server.src.core` must not import `server.src.modules`
  - `server.src.core` must not import `server.src.routes.admin`
  - `server.src.core` must not import invoice, prepaid, telegram, training, plugin, or company repositories
- [ ] Add CI/local command:

```bash
uv run pytest tests/test_core_smoke.py
uv run lint-imports
```

**Done when:** Existing behavior passes smoke tests and import boundaries can run, even if initially scoped to new `core` only.

---

## Phase 1: Peak Fast Mode And Hot Path Cleanup

**Owner:** Core Isolation Agent + Async Jobs Agent  
**Goal:** Remove obvious slow side-work from `/solve-captcha`, `/register-usage`, and `/confirm-usage`.

**Files:**
- Modify: `server/src/routes/captcha.py`
- Modify: `server/src/services/captcha_file_service.py`
- Modify: `server/src/services/usage_service.py`
- Modify: `server/src/db/usage_log.py`
- Create: `server/src/platform/jobs/queue.py`
- Create: `server/src/platform/observability/metrics.py`

- [ ] Add config flags:
  - `PEAK_FAST_MODE`
  - `CAPTCHA_SYNC_ARCHIVE_ENABLED`
  - `CAPTCHA_SYNC_SOLVER_METADATA_ENABLED`
  - `USAGE_SYNC_BILLING_ENABLED`
  - `USAGE_SYNC_CAPTCHA_RECORDS_ENABLED`
- [ ] Change `save_captcha_payload_detailed()` so solver metadata is optional and off in peak/core mode.
- [ ] Stop calling `ensure_analysis_metadata()` synchronously from the `/solve-captcha` hot path unless explicitly enabled.
- [ ] Change `get_top3_from_solver()` use so it never blocks delivery. If metadata is absent, send empty `top3` and enqueue hint computation.
- [ ] Split `confirm_usage` into:
  - atomic core confirm: status, confirmed_at, slot_date, usage_count
  - deferred billing jobs: price, prepaid, invoice, captcha records, telegram
- [ ] Split `register_usage` into:
  - minimal pending row
  - deferred config enrichment: company, fio, vehicle, op_type, custom slots, is_test
- [ ] Add latency metrics around:
  - API key validation
  - captcha hash
  - image assembly
  - pending store
  - SSE fanout
  - wait solution
  - confirm usage

**Done when:** Core endpoints can run with all side flags disabled and still solve/confirm captchas.

---

## Phase 2: Protected Core Runtime

**Owner:** Core Isolation Agent  
**Goal:** Move captcha runtime logic out of route files into a protected core package.

**Files:**
- Create: `server/src/core/captcha_runtime/runtime.py`
- Create: `server/src/core/captcha_runtime/sessions.py`
- Create: `server/src/core/captcha_runtime/presenter.py`
- Create: `server/src/core/contracts/events.py`
- Modify: `server/src/routes/captcha.py`
- Test: `tests/test_core_captcha_runtime.py`

- [ ] Create `CaptchaSessionStore` for pending sessions, result setting, duplicate detection, and timeout cleanup.
- [ ] Create `CaptchaPresenter` for only the image assembly needed to show captcha to humans/operators.
- [ ] Create `CaptchaRuntime.handle_captcha()` for the protected `/solve-captcha` flow.
- [ ] Create `CaptchaRuntime.submit_solution()` for `/solve`.
- [ ] Define core events:
  - `CaptchaReceived`
  - `CaptchaDisplayed`
  - `CaptchaSolved`
  - `CaptchaTimedOut`
- [ ] Make `routes/captcha.py` a thin HTTP adapter that calls `CaptchaRuntime`.
- [ ] Ensure runtime has no imports from billing, CRM, telegram, admin, training, plugins, or invoice/prepaid modules.

**Done when:** `routes/captcha.py` contains request/response adaptation only; business flow lives in `core/captcha_runtime`.

---

## Phase 3: Durable Outbox And Background Jobs

**Owner:** Async Jobs Agent  
**Goal:** Make deferred work reliable and retryable.

**Files:**
- Create: `server/src/platform/outbox/models.py`
- Create: `server/src/platform/outbox/publisher.py`
- Create: `server/src/platform/jobs/worker.py`
- Create: `server/src/modules/captcha_archive/jobs.py`
- Create: `server/src/modules/usage/jobs.py`
- Create: migration for `outbox_events` and/or `background_jobs`
- Test: `tests/test_outbox_jobs.py`

- [ ] Add DB table `outbox_events` with `event_type`, `payload_json`, `status`, `attempts`, `next_retry_at`, `last_error`.
- [ ] Add DB table `background_jobs` if not using Redis-only queue as source of truth.
- [ ] Add idempotency keys for jobs:
  - `captcha_archive:{captcha_id}`
  - `captcha_metadata:{captcha_id}`
  - `usage_enrich:{usage_log_id}`
  - `billing_confirm:{usage_log_id}`
  - `captcha_records:{usage_log_id}`
- [ ] Wire arq or Taskiq worker.
- [ ] Implement jobs:
  - persist captcha JSON
  - compute solver metadata
  - index captcha file
  - enrich usage config
  - parse captcha records from logs
- [ ] Add retry and dead-letter behavior.

**Done when:** Side jobs can fail and retry without changing the result of `/solve-captcha`, `/solve`, or core confirm.

---

## Phase 4: Nonblocking Realtime And Operators

**Owner:** Realtime Operators Agent  
**Goal:** Make more operators not cause server freezes or global lock contention.

**Files:**
- Create: `server/src/core/realtime/registry.py`
- Create: `server/src/core/realtime/fanout.py`
- Modify: `server/src/sse/manager.py`
- Modify: `server/src/routes/operator.py`
- Modify: `server/src/routes/distribution.py`
- Test: `tests/test_realtime_fanout.py`

- [ ] Build in-memory `RealtimeRegistry`:
  - `api_key_id -> connection queues`
  - `master_key_id -> operator_ids`
  - `operator_id -> display settings`
- [ ] Update registry on operator connect/disconnect/subscribe/unsubscribe, not on every captcha.
- [ ] Replace DB lookups during captcha fanout with registry snapshots.
- [ ] Use bounded per-client queues.
- [ ] Make `push_sse` nonblocking:
  - if queue is full, mark connection lagging
  - do not block captcha runtime
- [ ] Use per-captcha distribution state locks, never a global lock around all state.
- [ ] Add tests with one slow operator and many normal operators; normal operators still receive events.

**Done when:** Fanout cost depends on queue writes and snapshots, not DB queries or slow clients.

---

## Phase 5: RBAC And Audit

**Owner:** Access Audit Agent  
**Goal:** Replace scattered admin checks with permissions and auditable actions.

**Files:**
- Create: `server/src/modules/access/service.py`
- Create: `server/src/modules/access/permissions.py`
- Create: `server/src/modules/audit/service.py`
- Create: `server/src/modules/audit/repository.py`
- Modify: `server/src/routes/admin.py`
- Modify: `server/src/routes/api_keys.py`
- Test: `tests/test_rbac_audit.py`

- [ ] Choose implementation:
  - Simple local RBAC tables first, or
  - pycasbin if role inheritance/domain matching is needed immediately.
- [ ] Define permissions:
  - `captcha.solve.own`
  - `captcha.solve.any`
  - `operator.answer`
  - `operator.manage`
  - `billing.view`
  - `billing.edit`
  - `tariff.edit`
  - `invoice.generate`
  - `admin.users.manage`
  - `audit.view`
- [ ] Add `AccessDecision` contract for core-safe authorization.
- [ ] Add audit events:
  - API key changed
  - role changed
  - tariff changed
  - invoice generated
  - payout changed
  - admin login failed/succeeded
- [ ] Keep security audit sync for access changes.
- [ ] Make business audit async through outbox.

**Done when:** Admin/finance/operator permissions are explicit and auditable; core only depends on minimal access contracts.

---

## Phase 6: Finance And CRM As Side Modules

**Owner:** Finance CRM Agent  
**Goal:** Ensure tariffs, billing, prepaid, invoices, and CRM enrichment cannot break captcha solving.

**Files:**
- Create: `server/src/modules/billing/jobs.py`
- Create: `server/src/modules/billing/events.py`
- Create: `server/src/modules/crm/jobs.py`
- Modify: `server/src/services/billing_service.py`
- Modify: `server/src/db/usage_log.py`
- Test: `tests/test_billing_isolation.py`

- [ ] Move price calculation to `billing.calculate_usage_price` job.
- [ ] Move prepaid deduction to `billing.deduct_prepaid` job.
- [ ] Move invoice linking to `billing.link_open_invoice` job.
- [ ] Move company extraction/creation to `crm.enrich_usage` job.
- [ ] Add billing failure tests:
  - broken tariff does not break captcha solve
  - broken invoice link does not break confirm core
  - broken company alias parsing does not break register core
- [ ] Add finance reconciliation command to re-run failed billing jobs by usage id/date range.

**Done when:** Finance can be disabled or broken and core captcha flow still works.

---

## Phase 7: Module Registry And Flat Extension Model

**Owner:** Core Isolation Agent + all module agents  
**Goal:** Add new server features without touching core route registration manually.

**Files:**
- Create: `server/src/platform/module_registry.py`
- Create module manifests in each `server/src/modules/*/manifest.py`
- Modify: `server/src/routes/__init__.py`
- Test: `tests/test_module_registry.py`

- [ ] Define `ModuleManifest`:
  - `name`
  - `routers`
  - `event_handlers`
  - `job_handlers`
  - `permissions`
  - `startup`
  - `shutdown`
- [ ] Register modules defensively:
  - if module import fails, disable that module and log error
  - never prevent core app startup because a side module failed
- [ ] Keep core routers always registered first.
- [ ] Add health endpoint showing module status.

**Done when:** A broken billing/training/plugin module is shown as disabled but server starts and core endpoints work.

---

## Phase 8: Observability, Load Tests, And Peak Mode

**Owner:** Async Jobs Agent + Realtime Operators Agent  
**Goal:** Prove peak behavior and make regressions visible.

**Files:**
- Create: `server/tests/load/test_peak_solve_flow.py`
- Create: `server/src/platform/observability/metrics.py`
- Modify: `server/src/routes/health.py`

- [ ] Add metrics:
  - `captcha_solve_duration_ms`
  - `captcha_display_latency_ms`
  - `captcha_pending_count`
  - `realtime_queue_depth`
  - `realtime_dropped_messages_total`
  - `background_job_lag_seconds`
  - `background_job_failures_total`
  - `usage_confirm_core_duration_ms`
- [ ] Add peak fast mode schedule for Moscow time:
  - `09:50-10:10`
  - `11:50-12:10`
- [ ] Add load tests:
  - many captcha arrivals
  - many connected operators
  - one slow operator
  - failing billing worker
  - delayed archive worker
- [ ] Define SLO targets:
  - `/solve-captcha` display dispatch under 300 ms excluding human wait
  - `/solve` result set under 100 ms
  - `/confirm-usage` core under 150 ms
  - no global realtime freeze from one slow client

**Done when:** Peak mode can be demonstrated locally and failures are observable.

---

## Phase 9: Production Delivery, Backups, And Real Rollback

**Owner:** Delivery Ops Agent  
**Goal:** Make production delivery atomic enough that code, plugins, config, migrations, and data backups belong to one release, with a rollback that restores the last known-good bundle.

**Files:**
- Modify: `scripts/deploy/config.ps1`
- Modify: `scripts/deploy/deploy.ps1`
- Modify: `scripts/deploy/rollback.ps1`
- Modify: `scripts/deploy/backup.ps1`
- Modify: `scripts/deploy/push-plugins.ps1`
- Modify: `scripts/deploy/push-data.ps1`
- Create: `scripts/deploy/release.ps1`
- Create: `scripts/deploy/restore-backup.ps1`
- Create: `scripts/deploy/migrate.ps1`
- Create: `scripts/deploy/verify-release.ps1`
- Create: `docs/deploy-runbook.md`
- Test: `server/tests/test_deploy_scripts.py`

- [ ] Define release id format:

```text
YYYYMMDD_HHMMSS-<short_git_sha>
```

Example:

```text
20260611_181500-a1b2c3d
```

- [ ] Add remote release directories:

```text
/opt/eopp/
  current -> releases/20260611_181500-a1b2c3d
  previous -> releases/20260610_220000-f9e8d7c
  releases/
    20260611_181500-a1b2c3d/
      docker-compose.yml
      nginx-default.conf
      release.json
      plugins/
  shared/
    data/
    certs/
    backups/
```

Compose should mount shared data and release-bound plugins:

```yaml
volumes:
  - ./shared/data:/app/data
  - ./shared/certs:/app/certs
  - ./current/plugins:/app/plugins
```

- [ ] Create release manifest `release.json`:

```json
{
  "release_id": "20260611_181500-a1b2c3d",
  "git_sha": "a1b2c3d",
  "image": "eopp:20260611_181500-a1b2c3d",
  "created_at": "2026-06-11T18:15:00+03:00",
  "compose_sha256": "...",
  "nginx_sha256": "...",
  "plugins_sha256": "...",
  "db_backup": "backup_20260611_181430",
  "migration_before": "w4x5y6z7a8b9",
  "migration_after": "head",
  "health": "passed"
}
```

- [ ] Make backup mandatory before deploy.

Backup must include:

```text
api_keys.db
api_keys.db-wal
api_keys.db-shm
captcha_examples/
plugins/
docker-compose.yml
nginx-default.conf
current release.json
```

For SQLite online backup, prefer:

```bash
sqlite3 /opt/eopp/shared/data/api_keys.db ".backup '/opt/eopp/shared/backups/<backup_id>/api_keys.db'"
```

If `sqlite3` is unavailable, use a short app stop or a helper container with SQLite tools. Do not copy only `api_keys.db` while WAL mode may be active.

- [ ] Separate migrations from app startup.

Production delivery should run migrations explicitly:

```text
deploy preflight
mandatory backup
load candidate image
run one-shot migrate command
start candidate app
health check
promote current symlink
mark release good
```

Add env flag:

```text
EOPP_AUTO_MIGRATE=0
```

App startup should only auto-migrate in local/dev unless explicitly enabled.

- [ ] Add migration safety classes in release notes or migration headers:

```text
safe_expand       # add nullable columns/indexes/tables
data_backfill     # can run async after deploy
contract          # drops/renames, requires old code gone
irreversible      # rollback requires DB restore, not downgrade
```

For SQLite, assume production rollback for destructive migrations is DB restore. Do not rely on Alembic downgrade unless the downgrade path is tested on a copy of prod data.

- [ ] Make plugins release-bound.

Normal release should build/copy plugins into:

```text
releases/<release_id>/plugins/
```

`push-plugins.ps1` remains for emergency plugin-only releases, but it must:

```text
create release id
backup current plugins
write plugin release manifest
switch plugin path atomically
health check /plugins/update.xml and /plugins/latest
```

- [ ] Replace rollback logic.

Rollback should:

```text
read /opt/eopp/current/release.json
read /opt/eopp/previous/release.json or selected release id
switch current symlink to previous release
restore previous compose/nginx if needed
restart containers
health check
restore DB backup only when requested or when manifest says migration is non-backward-compatible
```

Do not select rollback target from `docker images | head -1`.

- [ ] Add explicit DB restore command.

`restore-backup.ps1` should:

```text
stop app
copy current DB to emergency backup
restore selected backup api_keys.db
remove or restore WAL/SHM consistently
start app
run health check
```

It must ask for a backup id and print the release id that backup belongs to.

- [ ] Add deploy verification.

`verify-release.ps1` should check:

```text
current symlink exists
current release.json exists
docker compose ps running
/ or /health returns HTTP 200/301/302
/plugins/update.xml returns 200 when plugins enabled
DB opens successfully
alembic current matches release manifest
backup for this release exists
```

- [ ] Add deploy runbook.

Document:

```text
normal deploy
plugin-only deploy
DB restore
image rollback
release rollback
failed migration response
how to verify backups
how to test rollback before peak windows
```

**Done when:** A deploy creates a release manifest and mandatory backup; rollback restores a selected known-good release; plugin-only and data-only operations are explicit, backed up, and visible in release history.

---

## Recommended Merge Order

1. Phase 0: tests and import boundary.
2. Phase 1: remove hot path side-work behind flags.
3. Phase 2: protected captcha runtime.
4. Phase 3: durable jobs/outbox.
5. Phase 4: realtime operator fanout.
6. Phase 5: RBAC/audit.
7. Phase 6: finance/CRM side modules.
8. Phase 7: module registry.
9. Phase 8: load/observability/peak proof.
10. Phase 9: production delivery, backups, rollback, and release manifests.

Do not start RBAC or finance restructuring before Phase 1 and Phase 2 protect the core. The central promise is that core keeps solving captchas while side modules evolve.

---

## Subagent Assignment Matrix

| Phase | Core Isolation | Async Jobs | Realtime Operators | Access Audit | Finance CRM | Delivery Ops |
|---|---|---|---|---|---|---|
| 0 | Lead | Support | Support | Support | Support | Support |
| 1 | Lead | Lead | Consult | Consult | Consult | Consult |
| 2 | Lead | Support | Support | Consult | Consult | Consult |
| 3 | Support | Lead | Consult | Consult | Consult | Consult |
| 4 | Support | Support | Lead | Consult | Consult | Consult |
| 5 | Consult | Support | Consult | Lead | Support | Consult |
| 6 | Consult | Support | Consult | Support | Lead | Consult |
| 7 | Lead | Support | Support | Support | Support | Consult |
| 8 | Support | Lead | Lead | Support | Support | Support |
| 9 | Consult | Support | Support | Support | Support | Lead |

---

## Non-Negotiable Rules

- Core does not import side modules.
- Side-module failure never changes captcha solve result.
- Slow operator never blocks another operator.
- Billing/CRM/training/archive jobs are idempotent.
- Peak fast mode disables all non-essential synchronous work.
- New server capabilities are added as modules with manifests, permissions, events, and jobs.
- Every phase includes tests that prove the isolation claim.
- Every production deploy creates a release manifest and a backup before changing runtime state.
- Rollback targets a selected release manifest, not a guessed Docker image.
- DB restore is explicit and operator-confirmed when a migration is not backward-compatible.
