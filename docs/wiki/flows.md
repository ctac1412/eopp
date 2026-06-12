# Flows

## `/solve-captcha`

```mermaid
sequenceDiagram
  participant Client as Browser Extension / Frontend
  participant Route as routes/captcha.py
  participant Core as CaptchaRuntime
  participant Repo as API Key + Usage Adapters
  participant Store as CaptchaSessionStore
  participant Archive as Captcha File Service
  participant Queue as Background Jobs
  participant SSE as Realtime Fanout

  Client->>Route: POST /solve-captcha
  Route->>Core: handle_captcha(body)
  Core->>Repo: validate_api_key()
  Core->>Repo: get_or_create_usage_log()
  Core->>Core: captcha_hash()
  Core->>Core: build presentation
  Core->>Store: add_or_get(session)
  Core->>Archive: save_captcha_payload()
  Archive-->>Queue: enqueue archive/metadata when flags disabled
  Core->>SSE: new_captcha
  Core-->>Client: waits for manual answer or timeout
```

Audit note: pending insertion was observed late in smoke diagnostics, around 5.6s. The
intended peak behavior is display dispatch under 300 ms excluding human wait.

## `/solve` Manual Answer

```mermaid
sequenceDiagram
  participant UI as Operator / Captcha UI
  participant Route as routes/captcha.py
  participant Core as CaptchaRuntime
  participant Store as CaptchaSessionStore
  participant SSE as Realtime Fanout

  UI->>Route: POST /solve
  Route->>Core: submit_solution(body)
  Core->>Store: get(captcha_id)
  Core->>Core: validate owner/super kiosk if api_key sent
  Core->>Store: set_result()
  Core->>SSE: captcha_solved
  Core-->>UI: variantIndex + variantTiles
  Store-->>Core: original /solve-captcha waiter wakes
```

## Usage Register / Confirm / Fail

```mermaid
sequenceDiagram
  participant Ext as Extension
  participant Usage as usage_service
  participant Repo as usage_log_repo / db.usage_log
  participant Queue as background_jobs
  participant Billing as Billing Jobs
  participant CRM as CRM Jobs
  participant Captcha as Captcha Record Jobs

  Ext->>Usage: POST /register-usage
  Usage->>Repo: create minimal pending row
  Repo-->>Queue: crm.enrich_usage
  Usage-->>Ext: usage_log_id

  Ext->>Usage: POST /confirm-usage
  Usage->>Repo: atomic status=confirmed + usage_count
  Repo-->>Queue: billing.calculate_usage_price
  Repo-->>Queue: captcha_records when logs exist
  Usage-->>Queue: telegram_confirmed_usage
  Usage-->>Ext: ok

  Ext->>Usage: POST /fail-usage
  Usage->>Repo: status=failed
  Repo-->>Captcha: currently sync create_captcha_records when logs exist
  Usage-->>Ext: ok
```

Audit note: the fail lane should enqueue `captcha_records` instead of synchronous parsing.

## Billing Deferred Flow

```mermaid
flowchart TD
  Confirm["confirm_usage core update"] --> Calc["billing.calculate_usage_price"]
  Calc -->|sets UsageLog.price| Deduct["billing.deduct_prepaid"]
  Deduct -->|paid by package| Done["Usage paid / no invoice"]
  Deduct -->|unpaid company debt| Link["billing.link_open_invoice"]
  Link --> Invoice["Existing open invoice"]
  Calc -. retry/dead .-> Worker["background_jobs attempts/next_retry_at/status"]
  Deduct -. retry/dead .-> Worker
  Link -. retry/dead .-> Worker
```

`PrepaidDeduction.usage_log_id` is unique, so re-running deduction cannot double-deduct the
same usage when the DB helper respects that uniqueness.

## Operator Realtime Fanout

```mermaid
flowchart TD
  Connect["Operator/master SSE connect"] --> Registry["RealtimeRegistry updates topology"]
  Link["operator link/unlink/relink"] --> Registry
  Captcha["new_captcha event"] --> Snapshot["Snapshot owner + operator queues"]
  Snapshot --> Fanout["RealtimeFanout put_nowait"]
  Fanout --> Fast["Fast clients receive event"]
  Fanout --> Full["Full queue"]
  Full --> Lag["mark lagging + increment dropped"]
  Lag --> Continue["Other queues continue"]
```

Fanout uses bounded queues and does not await client queues. Slow clients are marked lagging,
not removed.

## Job / Outbox Lifecycle

```mermaid
stateDiagram-v2
  [*] --> Pending: enqueue_deferred_job()
  Pending --> Running: run_due_jobs()
  Running --> Done: handler succeeds
  Running --> Pending: handler fails before max_attempts
  Running --> Dead: handler fails at max_attempts
  Done --> [*]
  Dead --> [*]

  Pending: background_jobs.status=pending
  Running: status=running, locked_at set
  Done: status=done, completed_at set, outbox job.done
  Dead: status=dead, outbox job.dead
```

Outbox events currently record lifecycle and business audit events. External dispatch is not
yet a major audited runtime dependency.

## Peak Mode Lane

```mermaid
flowchart LR
  subgraph Normal["Normal Mode"]
    N1["archive JSON sync if enabled"] --> N2["solver metadata sync if enabled"]
    N2 --> N3["usage enrichment/billing flags may allow sync adapters"]
  end

  subgraph Peak["Peak Fast Mode"]
    P1["minimal validate/hash/session"] --> P2["bounded realtime fanout"]
    P2 --> P3["enqueue archive/metadata/CRM/billing"]
    P3 --> P4["worker handles offline side effects"]
  end
```

Peak windows are scheduled for Moscow time 09:50-10:10 and 11:50-12:10, plus forced
`EOPP_PEAK_FAST_MODE=1`.

