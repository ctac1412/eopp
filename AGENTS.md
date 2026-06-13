# EOPP Codex Instructions

Keep this file short. Full project reference lives in `docs/AGENTS-full.md`.
Read the detailed file only when the task touches the relevant subsystem.

## Default Mode

- Prefer risk-based speed.
- Use tools only when the answer requires local code, files, tests, or exact state.
- For simple meta questions, answer briefly without scanning the workspace.
- Before release work in `extension/`, read `extension/AGENTS.md`.

## CodeGraph

This project has a CodeGraph MCP server configured.

Use CodeGraph for structural code questions:
- `codegraph_context` for feature, architecture, or bug context.
- `codegraph_search` for symbol lookup.
- `codegraph_callers` / `codegraph_callees` for call relationships.
- `codegraph_impact` for change impact.
- `codegraph_files` for project file structure.

Use native search only for literal text, comments, logs, or already-known files.
If CodeGraph says the project is not initialized, ask before running init.

## Risk-Based TDD

Use test-first TDD only where regression cost is high:
- `server/src/core/*`
- RBAC, audit, security, permissions, and access policy
- billing, CRM, usage accounting, tariffs, invoices, prepaid, finance
- database migrations, repositories, and persistence contracts
- realtime fanout, captcha hot path, shared runtime, protected-core contracts
- bug fixes that need a regression test

For UI, CSS, docs, config, prompts, scripts, prototypes, and low-risk tooling:
- understand the affected area
- make the smallest scoped change
- run one focused check, build, or manual verification
- avoid full-suite runs unless the touched layer justifies them

## Protected Core

- Do not import billing, CRM, training, plugins, admin routes, telegram, invoice,
  prepaid, FastAPI, DB repositories, or access/audit modules into
  `server/src/core/*`.
- Core side behavior must go through contracts or injected dependencies.
- Public helpers, core contracts, runtime classes, and durable job DTOs need
  docstrings that state the boundary or invariant they protect.

Focused checks:
- Core captcha runtime:
  `uv run pytest tests/test_core_captcha_runtime.py tests/test_core_smoke.py`
  and `uv run lint-imports`
- Realtime fanout:
  `uv run pytest tests/test_realtime_fanout.py`
- RBAC or audit:
  `uv run pytest tests/test_rbac_audit.py` and `uv run lint-imports`

## Durable Jobs And Side Work

- Core endpoints must not wait for side jobs:
  `/solve-captcha`, `/solve`, `/register-usage`, `/confirm-usage`, `/fail-usage`.
- Enqueue side work best-effort and keep the core response intact on enqueue
  failures.
- Job handlers must be idempotent.
- Add new side work through `enqueue_deferred_job()` plus a handler registered
  in `default_registry()`.
- Document new idempotency keys and handler locations in `docs/AGENTS-full.md`
  or a focused docs file.

## Runtime Flags

Preserve these semantics:
- `EOPP_PEAK_FAST_MODE=1`
- `EOPP_CAPTCHA_SYNC_ARCHIVE_ENABLED=0`
- `EOPP_CAPTCHA_SYNC_SOLVER_METADATA_ENABLED=0`
- `EOPP_USAGE_SYNC_CONFIG_ENRICHMENT_ENABLED=0`
- `EOPP_USAGE_SYNC_BILLING_ENABLED=0`
- `EOPP_USAGE_SYNC_CAPTCHA_RECORDS_ENABLED=0`

## Local Noise

Avoid scanning heavy local artifacts unless the task explicitly needs them:
- `.codegraph/`
- `.uv-cache/`
- `.venv/`
- `node_modules/`
- `server/data/*.db*`
- `tmp/verification/`
- sibling folder `../eopp-local-artifacts/`
