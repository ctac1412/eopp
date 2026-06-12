# EOPP — Captcha Solver & Reservation Injector

## Обзор проекта

Проект решает пазл-капчу системы EOPP (Электронная система организации пропуска транспорта через пункты пропуска) и автоматизирует перенос/создание бронирований на пропускных пунктах (АПП).

Состоит из 4 независимых компонентов:
1. **Python-сервер** (FastAPI) — решатель капчи с веб-UI для ручного решения, API для ключей, логирование использования
2. **React-фронтенд** — SPA для управления конфигурацией инжектора и решения капч
3. **Browser Extension** — контент-скрипт для автоматизации прямо в браузере на `eopp.epd-portal.ru`
4. **Plugin System** — система плагинов для расширения функциональности

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  Browser Extension (extension/)                 │
│  content.js  ──port──▶  background.js  ──fetch──▶  Server  │
│  (EOPP API)            (прокси к нашему серверу)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ POST /solve-captcha
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Python Server (src/app.py, captcha_solver.py)               │
│  FastAPI на :8765 (HTTPS, self-signed cert)                │
│                                                              │
│  POST /solve-captcha  ← принимает капчу, блокирует до ответа│
│  POST /solve          ← ручной ответ от UI                 │
│  GET  /stream         ← SSE, пуш новых капч                │
│  POST /api-keys/*    ← управление API ключами              │
│  POST /register-usage ← логирование использования           │
│  POST /mock-config   ← мок EOPP API для тестирования       │
│  GET  /slots-group    ← координация слотов между клиентами │
│  /*                     ← React SPA (frontend/dist/)        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  React Frontend (frontend/)                                 │
│  /      — UI для решения капч (CaptchaGrid + история)      │
│  /admin — Панель администрирования                          │
│  /injector — конфигуратор инжектора (legacy, в extension)  │
└─────────────────────────────────────────────────────────────┘
```

---

## Компоненты

### 1. Captcha Solver (`captcha_solver.py`)

Алгоритм автоматического решения пазл-капчи. Анализирует N вариантов сборки тайлов, выбирает лучший по совокупности метрик:

- **Discontinuity** — разница пикселей на стыках тайлов (чем меньше, тем лучше)
- **SSIM** — структурное сходство на стыках (чем больше, тем лучше)
- **Coherence** — корреляция градиентов между соседними тайлами (чем больше, тем лучше)
- **Sobel continuity** — непрерывность краёв через оператор Собеля (чем меньше, тем лучше)

Финальный score: `disc * W_DISC + (1 - ssim) * W_SSIM - coh * W_COH + sobel * W_SOBEL`. Минимальный score = лучший вариант.

Дополнительно: динамическая обрезка чёрных коррумпированных бордеров с тайлов перед анализом.

### 2. Python Server (`server/`)

**Основные модули:**

| Файл | Назначение |
|------|-----------|
| `server/manage.py` | CLI-входная точка сервера (typer), автогенерация self-signed SSL, запуск uvicorn |
| `server/src/app.py` | FastAPI-приложение: создание app, lifespan, CORS, middleware |
| `server/src/routes.py` | Точка входа: регистрирует все роутеры из `server/src/routes/` |
| `server/src/routes/*.py` | Роутеры по модулям: `captcha.py`, `sse.py`, `api_keys.py`, `usage.py`, `slots.py`, `mock.py`, `admin.py`, `plugins.py`, `frontend.py` |
| `server/src/models.py` | Pydantic-модели для валидации запросов |
| `server/src/constants.py` | Константы: порты, пути, токены, настройки |
| `server/src/utils.py` | Утилиты: хеширование, сборка изображений, SSE push, тесты, benchmark |
| `server/src/db/` | SQLite-слой: `api_keys.py`, `usage_log.py`, `tariffs.py`, `withdrawals.py`, `init.py`, `connection.py` |
| `server/src/plugins.py` | Система плагинов: загрузка, хранение, версионирование |
| `server/scripts/` | Скрипты: `bump_plugin_version.py`, `copy_plugin_to_plugins.py` |
| `server/captcha_solver.py` | Алгоритм решения капчи (discontinuity, SSIM, coherence, Sobel) |

**Эндпоинты:**

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/stream` | SSE-поток: события `new_captcha`, `captcha_solved`, `captcha_timeout` |
| `POST` | `/solve-captcha` | Принимает данные капчи. Если `auto_solve=true` — решает сразу. Иначе блокирует до ручного ответа или таймаута |
| `POST` | `/solve` | Отправляет ручной ответ: `{ captcha_id, variantIndex }` |
| `POST` | `/trigger-test` | Запуск тестовых капч из `tests/test_cases/valid/` |
| `POST` | `/broadcast` | Ручной пуш SSE-события |
| `POST` | `/api-keys` | Создание API ключа |
| `GET` | `/api-keys` | Список всех ключей |
| `PUT` | `/api-keys/{id}` | Обновление ключа |
| `DELETE` | `/api-keys/{id}` | Удаление ключа |
| `POST` | `/register-usage` | Регистрация использования (создание группы слотов) |
| `GET` | `/slots-group` | Получение слотов группы (координация между клиентами) |
| `POST` | `/slots-group` | Загрузка слотов в группу (мастер-клиент) |
| `GET` | `/validate-key` | Валидация API ключа |
| `GET` | `/api-key-status` | Статус ключа (оставшиеся использования) |
| `GET` | `/usage-log` | История использования ключей |
| `POST` | `/confirm-usage` | Подтверждение успешного использования |
| `POST` | `/fail-usage` | Отметка неудачного использования |
| `POST` | `/mock-config` | Настройка мок-ответов EOPP API |
| `GET` | `/mock-config` | Получение текущей мок-конфигурации |
| `GET` | `/admin/streams` | Список активных SSE-соединений |
| `GET` | `/admin/test-stats` | Статистика по тестовым кейсам |
| `POST` | `/admin/benchmark` | Запуск бенчмарка решателя |
| `POST` | `/admin/auth` | Аутентификация админа |
| `GET/POST/PUT/DELETE` | `/admin/withdrawals` | CRUD способов вывода (с налогом и типом процента) |
| `POST` | `/admin/generate-invoice` | Генерация PDF-счёта |
| `GET` | `/*` | React SPA (файлы из `frontend/dist/`) |

**Mock EOPP Endpoints** (для тестирования):
| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/reservations-api/v1/captcha` | Генерация капчи |
| `POST` | `/reservations-api/v1/captcha-validate` | Валидация капчи |
| `GET` | `/reservations-api/v1/timeslot/AvailableSlots` | Доступные слоты |
| `POST` | `/reservations-api/v1/Reschedule` | Перенос брони |
| `POST` | `/reservations-api/v1/SubmitDraft` | Создание брони |

**Режимы запуска сервера:**
- `make run-prod` — обычный режим (HTTP :8766, server/data/api_keys.db)
- `make run-test` — автоматически посылает тестовые капчи из `tests/test_cases/valid/`
- `make run-write` — labeling mode: капчи из `tests/test_cases/no_valid/`, ответ сохраняется обратно

### 3. Browser Extension (`extension/`)

> **ВАЖНО:** Перед релизом плагина ВСЕГДА читай `extension/AGENTS.md` — там описан точный порядок действий.

Manifest V3 расширение для Яндекс.Браузера (совместимо с Chrome).

**Архитектура расширения:**
- **Content Script** — инжектируется на страницы редактирования EOPP. Делает прямые fetch-запросы к EOPP API (`/reservations-api/v1/...`) с `credentials: "include"`. Содержит полную 5-стадийную логику pipeline.
- **Background Script** — service worker. Проксирует запросы к нашему серверу.

**Коммуникация content ↔ background:** Port-based messaging (`chrome.runtime.connect` + `port.onMessage`). Async callback-подход ненадёжен в MV3 — service worker может быть suspend-нут.

**5-стадийный pipeline инжектора:**
1. `getAvailableSlots()` — GET `/reservations-api/v1/timeslot/AvailableSlots`
2. `generateCaptcha()` — POST `/reservations-api/v1/captcha`
3. `solveCaptcha()` → background → POST `/solve-captcha`
4. `validateCaptcha()` — POST `/reservations-api/v1/captcha-validate`
5. `submitReschedule()` / `submitCreate()` — POST `/reservations-api/v1/Reschedule` или `/reservations-api/v1/SubmitDraft`

**UI:** Кнопка "Инжектор" (фиксированная, bottom-right) → модалка с формой конфигурации → запуск pipeline.

**Файлы:**
| Путь | Назначение |
|------|-----------|
| `manifest.json` | Manifest V3, permissions, content script match |
| `vite.config.ts` | Конфиг Vite для билда |
| `src/App.tsx` | React UI расширения |
| `src/api/pipeline.ts` | 5-стадийный pipeline |
| `src/api/background.ts` | Коммуникация с background script |
| `src/api/stages.ts` | Отдельные стадии pipeline |
| `src/components/` | UI компоненты (Modal, ConfigForm, StatusBar, etc.) |
| `src/hooks/` | Хуки (useInjector, useScheduler, useClock) |
| `src/store.ts` | Zustand store |
| `src/constants.ts` | Константы расширения |
| `src/types.ts` | TypeScript типы |
| `src/logger.ts` | Логирование |

### 4. React Frontend (`frontend/`)

Vite + React 18 + React Router + Zustand.

**Страницы:**
- `/` — Главная: авторизация (API key), CaptchaGrid, SSE-подписка, ручной выбор варианта, история использования
- `/admin` — Админ-панель: управление API ключами, мониторинг потоков, benchmark

**Компоненты:**
| Файл | Назначение |
|------|-----------|
| `src/App.jsx` | Главная страница: табы "Капчи" / "История" |
| `src/AdminPage.jsx` | Админ-панель |
| `src/store/useCaptchaStore.js` | Zustand store |
| `src/hooks/useSSE.js` | SSE-подписка |
| `src/components/CaptchaGrid.jsx` | Сетка вариантов капчи |
| `src/components/CaptchaCard.jsx` | Карточка варианта |
| `src/components/StatusBar.jsx` | Статус подключения |
| `src/components/LogViewer.jsx` | Логи событий |
| `src/components/AuthWizard.jsx` | Ввод API ключа |
| `src/components/UsageHistory.jsx` | История использования |
| `src/components/CountdownTimer.jsx` | Таймер обратного отсчёта |

---

## API Keys & Usage Tracking

Система управления API ключами с лимитами использования и логированием:

- **Создание ключа**: `POST /api-keys` — создаёт новый ключ с optional `max_uses`
- **Валидация**: `GET /validate-key` — проверяет ключ и возвращает лимиты
- **Регистрация использования**: `POST /register-usage` — создаёт запись в логе
- **Подтверждение**: `POST /confirm_usage` — отмечает успешное использование
- **Ошибка**: `POST /fail_usage` — отмечает неудачное использование с кодом ошибки

База данных: SQLite (`data/api_keys.db`)

---

## Slots Groups (Координация слотов)

Механизм для координации слотов между несколькими клиентами:
- **Master** — первый клиент загружает слоты
- **Slaves** — остальные клиенты используют те же слоты
- **Variants** — 8 вариантов распределения top-3 слотов между клиентами
- **TTL** — 60 секунд, таймауты: master=1.5s, slave=0.4s

---

## Mock System (Тестирование)

Полноценный мок EOPP API с настраиваемыми ответами:
- `POST /mock-config` — настройка поведения эндпоинтов
- Поддержка modes: `success`, `429`, `400`, `all_occupied`, `all_slots_occupied`, `custom`
- Cчетчики попыток для циклического мока

---

## Тесты и Данные

| Директория | Назначение |
|------------|-----------|
| `tests/test_cases/valid/` | Тестовые капчи с известным ответом (`valid_index`) |
| `tests/test_cases/no_valid/` | Неразмеченные капчи для label |
| `tests/test_solve_captcha.py` | Бенчмарк решателя |

Тестовые JSON-файлы содержат структуру капчи EOPP:
```json
{
  "puzzle": {
    "tiles": [{"tileId": "...", "imageData": "base64..."}],
    "variantsCapture": [["id1", "id2", ...], ...]
  },
  "valid_index": 2  // только в valid/
}
```

---

## Ключевые файлы

| Файл | Назначение |
|------|-----------|
| `server/manage.py` | CLI-входная точка сервера (typer), автогенерация self-signed SSL, запуск uvicorn |
| `server/src/app.py` | FastAPI-приложение: роуты, SSE, обработка капч, serve фронтенда |
| `server/src/routes.py` | Все роуты: капчи, SSE, API ключи, usage log, mock EOPP, slots groups (1219 строк) |
| `server/src/utils.py` | Утилиты: хеширование капч, сборка изображений, SSE push, загрузка тестов, benchmark |
| `server/captcha_solver.py` | Алгоритм решения капчи (discontinuity, SSIM, coherence, Sobel) |
| `extension/manifest.json` | Manifest V3, permissions, content script match |
| `extension/src/` | TypeScript-источники расширения (Vite-билд → `dist/`) |
| `frontend/src/App.jsx` | Главная страница: SSE + CaptchaGrid + StatusBar + LogViewer |
| `frontend/src/AdminPage.jsx` | Админ-панель |
| `server/index.html` | Фоллбэк HTML-UI для капч (vanilla JS, SSE, без React) |

---

## Запуск и разработка

```bash
# Установка зависимостей
uv sync
make install-frontend
make install-extension

# Запуск сервера
make run-prod       # HTTP :8766, server/data/api_keys.db

# Разработка фронтенда
make dev-frontend  # Vite dev server

# Сборка фронтенда
make build-frontend

# Сборка расширения
make build-extension
make build-extension-dev

# Плагины
make build-plugin           # собрать плагин с повышением версии
make build-plugin-no-bump   # собрать плагин без повышения версии
make list-plugins           # список версий плагинов

# Тесты / бенчмарк
make bench
```

---

## Важные детали

- **SSL**: сервер использует self-signed сертификат (`certs/cert.pem` + `certs/key.pem`), генерируется автоматически при первом запуске
- **CORS**: разрешены все origin (`*`), с credentials
- **Таймаут капчи**: 10 секунд (настраивается через `CAPTCHA_TIMEOUT`)
- **Дублирование UI**: существует 2 UI для решения капч — `index.html` (vanilla JS, фоллбэк) и React фронтенд (`frontend/`). React используется по умолчанию при наличии `frontend/dist/`
- **АПП (пропускные пункты)**: Забайкальск, Тагиркент-Казмаляр, Бугристое, Верхний Ларс, Чернышевское
- **Port-based messaging**: критично для MV3 — `chrome.runtime.sendMessage` с async callback ненадёжен, service worker suspend-ится. Всегда использовать `chrome.runtime.connect` + `port.onMessage`
- **API Key System**: 每个 ключ может иметь лимит использования (`max_uses`), логирование через `register-usage` → `confirm/fail`
- **Slots Group**: координация between клиентами для синхронизации слотов, 8 вариантов распределения top-3 слотов

---

## Зависимости

**Python** (pyproject.toml):
- fastapi, uvicorn — web server
- pydantic — модели
- pillow, numpy, scikit-image, scipy — обработка изображений
- typer — CLI
- networkx — графы (резерв)

**Frontend** (frontend/package.json):
- react, react-dom, react-router-dom — UI
- zustand — state management
- vite — сборка

**Extension** (extension/package.json):
- react, react-dom, zustand — UI/state
- vite — сборка
- typescript, @types/chrome — типы

---

## Запуск (Docker)

Проект запускается локально или через Docker. База данных всегда одна — `server/data/api_keys.db`.

### Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  make run-prod ──► :8766 (HTTP) ──► server/data/api_keys.db  │
│                                                              │
│  docker compose up ──► :8765 (HTTPS) ──► eopp_prod_data   │
│                           (volume)                          │
└─────────────────────────────────────────────────────────────┘
```

### Команды

```bash
# Локальный запуск
make run-prod                  # HTTP :8766, server/data/api_keys.db

# Docker
docker compose up -d --build  # HTTPS :8765, volume
docker compose down           # Остановить
docker compose logs -f        # Логи

# Бекап БД
docker run --rm -v eopp_eopp_prod_data:/data -v $(pwd):/backup alpine tar czf /backup.tar.gz -C /data .
```

### Важные детали

- **SSL**: Сертификат генерируется автоматически при старте контейнера
- **Volume**: Данные сохраняются между перезапусками контейнера
- **Фронтенд**: При сборке Docker автоматически включает `frontend/dist/`

---

## Durable Outbox And Background Jobs

Phase 3 introduced a durable SQLite-backed side-work layer:

| Area | Files |
|------|-------|
| Durable queue | `server/src/platform/jobs/queue.py` |
| Worker / retry / dead-letter | `server/src/platform/jobs/worker.py` |
| Outbox publisher | `server/src/platform/outbox/publisher.py` |
| Captcha archive jobs | `server/src/modules/captcha_archive/jobs.py` |
| Usage jobs | `server/src/modules/usage/jobs.py` |
| DB migration | `server/migrations/versions/z0a1b2c3d4e5_add_outbox_background_jobs.py` |

Tables:
- `background_jobs`: source of truth for deferred jobs.
- `outbox_events`: durable event log for job lifecycle events such as `job.enqueued`, `job.retry`, `job.done`, and `job.dead`.

Idempotency keys:
- `captcha_archive:{captcha_id}`
- `captcha_metadata:{captcha_id}`
- `usage_enrich:{usage_log_id}`
- `billing_confirm:{usage_log_id}`
- `captcha_records:{usage_log_id}`
- `telegram_confirmed_usage:{usage_log_id}`

Important rules:
- Core endpoints (`/solve-captcha`, `/solve`, `/register-usage`, `/confirm-usage`, `/fail-usage`) must not wait for side jobs.
- Enqueue from hot paths is best-effort. Catch enqueue failures and keep the core response intact.
- Job handlers must be idempotent. Re-running a handler after retry must not corrupt billing, captcha files, or usage rows.
- Worker failures update `attempts`, `next_retry_at`, `last_error`, and eventually `status='dead'`; they must not escape into HTTP request handling.
- Add new side-work through `enqueue_deferred_job()` plus a handler registered in `default_registry()`. Do not import side modules into `server/src/core/*`.

---

## Protected Core Runtime Notes

Phase 2 moved the captcha hot path out of `server/src/routes/captcha.py` into
`server/src/core/captcha_runtime/`.

Important rules for future work:

- `server/src/core/` is protected core. Do not import billing, CRM, training,
  plugins, admin routes, telegram, invoice, or prepaid code from it.
- Keep FastAPI, DB repositories, SSE, operator distribution, and background job
  wiring in adapters such as `server/src/routes/captcha.py`.
- If core needs side behavior, add it to `CaptchaRuntimeDependencies` or a
  contract/event in `server/src/core/contracts/`.
- `CaptchaSession` intentionally keeps a small dict-like API because legacy
  admin, health, and distribution code still reads `src.sse.pending` entries.
- `CaptchaPresenter` may assemble puzzle captcha images in core, but icon-click
  distribution preparation must stay injected until realtime/operator code is
  moved behind protected-core contracts.
- Run these checks after touching this area:
  - `uv run pytest tests/test_core_captcha_runtime.py tests/test_core_smoke.py`
  - `uv run lint-imports`

## Phase 0-1 Core Safety Flags

The core captcha flow can run with side work disabled. Preserve these flags and
their semantics:

- `EOPP_PEAK_FAST_MODE=1` disables non-essential synchronous side work unless a
  more specific flag explicitly enables it.
- `EOPP_CAPTCHA_SYNC_ARCHIVE_ENABLED=0` defers captcha JSON/archive work from
  `/solve-captcha`.
- `EOPP_CAPTCHA_SYNC_SOLVER_METADATA_ENABLED=0` prevents synchronous solver
  metadata, top3, and classifier hint work in `/solve-captcha`.
- `EOPP_USAGE_SYNC_CONFIG_ENRICHMENT_ENABLED=0` keeps `/register-usage` to a
  minimal pending row and defers company/FIO/vehicle/custom-slot enrichment.
- `EOPP_USAGE_SYNC_BILLING_ENABLED=0` keeps `/confirm-usage` to atomic confirm
  state and usage_count updates, deferring tariff/prepaid/invoice/telegram.
- `EOPP_USAGE_SYNC_CAPTCHA_RECORDS_ENABLED=0` defers captcha-record parsing from
  confirmed usage logs.

Documentation expectations for this area:

- New protected-core contracts, runtime classes, durable job DTOs, and public
  helpers must have docstrings that state the boundary or invariant they
  protect.
- Test wrappers under `tests/` exist so plan commands like
  `uv run pytest tests/test_core_smoke.py` keep working while the main server
  tests remain under `server/tests/`.
- When adding a new side job, document its idempotency key and handler location
  here before wiring it into hot paths.

## Phase 4 Realtime Rules

Realtime fanout is part of the protected core path. Keep these rules when
touching SSE, operators, captcha display, captcha timeout, or distribution
completion:

- `server/src/core/realtime/registry.py` is the in-memory source of truth for
  live SSE queues, `master_key_id -> operator_ids`, `operator_id -> master_ids`,
  and operator display modes.
- Update `RealtimeRegistry` when topology changes: operator connect,
  disconnect, link, unlink, relink, admin display-mode update, or master stream
  handshake.
- Do not do DB/repository lookups during captcha fanout. Captcha display,
  timeout, and distributed-solve completion must use registry snapshots.
- Every client queue must be bounded. A full queue means the connection is
  marked lagging and the message is dropped for that connection only.
- `push_sse` and owner/operator fanout must stay nonblocking. Never await a
  client queue, never hold the registry lock while writing to queues, and never
  remove a connection only because its queue is full.
- A slow operator must not delay or block a master, another operator, or a super
  kiosk. Preserve `tests/test_realtime_fanout.py` coverage when changing this
  area.
- Legacy globals in `server/src/sse/manager.py` (`sse_queues`,
  `sse_connections`, `queue_subscriptions`) are compatibility views. Prefer
  registry methods for new code.
- Run this focused check after touching realtime fanout:
  - `uv run pytest tests/test_realtime_fanout.py`

## Phase 5 RBAC And Audit Rules

Phase 5 centralizes admin/security authorization and audit while preserving
legacy `X-Admin-Token` and admin API-key compatibility.

Important files:
- Core contract: `server/src/core/contracts/permissions.py`
- RBAC permissions and grants: `server/src/modules/access/permissions.py`
- Access decisions: `server/src/modules/access/service.py`
- HTTP permission matrix: `server/src/policies/access_policy.py`
- Audit writer/reader: `server/src/modules/audit/service.py` and
  `server/src/modules/audit/repository.py`
- Audit schema extension:
  `server/migrations/versions/a2b3c4d5e6f7_extend_admin_audit_log.py`

Important rules:
- Protected core may depend only on `AccessDecision` / `AccessChecker` from
  `server/src/core/contracts/permissions.py`. Do not import repositories,
  FastAPI, `server/src/modules/access`, or `server/src/modules/audit` from core.
- Do not scatter role checks through route functions. Add or change HTTP
  permissions in `src.policies.access_policy`; route code may only reuse the
  middleware `AccessDecision` for audit context.
- Keep existing admin keys working. Active API keys with `is_admin=1` are valid
  admin tokens; a missing `admin_role` is treated as `super_admin` because older
  releases allowed all admin keys to mutate admin resources.
- Security/admin audit is synchronous for access-sensitive changes:
  `admin.login.succeeded`, `admin.login.failed`, `api_key.changed`, and
  `role.changed`.
- Business audit is best-effort through the durable outbox event
  `audit.business`; current important actions are `tariff.changed`,
  `invoice.generated`, `invoice.changed`, and `payout.changed`.
- `admin_audit_log.admin_id` is legacy `NOT NULL`; unauthenticated security
  events use actor id `0`.
- Run this focused check after touching RBAC or audit:
  - `uv run pytest tests/test_rbac_audit.py`
  - `uv run lint-imports`

## Phase 6 Finance And CRM Isolation Rules

Phase 6 moves finance and CRM side effects out of captcha and usage core paths.

Important files:
- Billing jobs and event DTOs: `server/src/modules/billing/jobs.py` and
  `server/src/modules/billing/events.py`
- CRM enrichment jobs: `server/src/modules/crm/jobs.py`
- Durable job registry: `server/src/platform/jobs/worker.py`
- Core usage persistence boundary: `server/src/repositories/usage_log_repo.py`
  and `server/src/db/usage_log.py`

Important rules:
- `/solve-captcha`, `/solve`, `/register-usage`, and `/confirm-usage` must not
  import or synchronously call tariffs, prepaid, invoice linking, company alias
  parsing, or company creation.
- Usage registration writes only the minimal pending row and best-effort
  enqueues `crm.enrich_usage`.
- Usage confirmation only atomically updates status, confirmed_at, slot_date,
  logs, and API-key usage_count. It best-effort enqueues
  `billing.calculate_usage_price`; that job chains to
  `billing.deduct_prepaid`, then `billing.link_open_invoice` if unpaid company
  debt remains.
- Billing and CRM handlers must be idempotent. Re-running
  `billing.deduct_prepaid` must not double-deduct because
  `deduct_prepaid_for_usage_tx()` checks existing deductions.
- Legacy jobs `usage_enrich` and `billing_confirm` remain registered as aliases
  for already queued rows, but new hot paths should enqueue `crm.enrich_usage`
  and `billing.calculate_usage_price`.
- Broken tariff lookup, prepaid deduction, invoice linking, company alias
  parsing, or company creation must retry/dead-letter in the worker and must
  not change core HTTP responses.
- Finance reconciliation is available through:
  - `uv run python server/manage.py reconcile-finance --usage-id <id>`
  - `uv run python server/manage.py reconcile-finance --date-from <iso> --date-to <iso>`
- Run this focused check after touching finance or CRM isolation:
  - `uv run pytest tests/test_billing_isolation.py tests/test_outbox_jobs.py`
  - `uv run lint-imports`

## Phase 7 Module Registry And Flat Extension Rules

Phase 7 adds defensive optional module loading while keeping protected core
route registration explicit and unconditional.

Important files:
- Platform registry: `server/src/platform/module_registry.py`
- Core route shell and module list: `server/src/routes/__init__.py`
- Module health: `server/src/routes/health.py` (`GET /health/modules`)
- Pilot manifests:
  - `server/src/modules/billing/manifest.py`
  - `server/src/modules/training/manifest.py`

Important rules:
- `ModuleManifest` is the flat contract for side modules: `name`, `routers`,
  `event_handlers`, `job_handlers`, `permissions`, `startup`, and `shutdown`.
- Core routers must be registered first and directly in `register_all_routes()`.
  They must not depend on optional module imports succeeding.
- Optional modules are loaded through `register_modules()` only. A failed module
  import, malformed manifest, failed startup hook, or router include error must
  create a disabled `ModuleStatus` and must not prevent app startup.
- `GET /health/modules` reports enabled/disabled module status from
  `app.state.module_statuses`; it must not import side modules while serving the
  health request.
- Add new server capabilities under `server/src/modules/<name>/manifest.py`.
  Do not add direct imports for side-module routers in `server/src/routes/__init__.py`.
- `EOPP_MODULE_MANIFESTS` may override the comma-separated manifest list for
  diagnostics, staged rollouts, or testing a broken module.
- Public registry classes, manifests, lifecycle hooks, and health helpers must
  have docstrings that state the boundary they protect.
- Run this focused check after touching module loading:
  - `uv run pytest tests/test_module_registry.py`
  - `uv run lint-imports`

## Phase 8 Observability And Peak Mode Rules

Phase 8 adds local, dependency-free visibility for peak captcha operation and
load regressions.

Important files:
- Metrics collector: `server/src/platform/observability/metrics.py`
- Metrics endpoint: `server/src/routes/health.py` (`GET /metrics`)
- Peak schedule: `server/src/constants.py`
- Realtime metrics hooks: `server/src/core/realtime/fanout.py`
- Job failure/lag metrics: `server/src/platform/jobs/worker.py`
- Local load check: `server/tests/load/test_peak_solve_flow.py`

Important rules:
- Keep observability dependency-free and process-local unless a later phase
  explicitly adds Prometheus/OpenTelemetry clients. Protected core may import
  `src.platform.observability.metrics`, but must not import FastAPI route
  modules just to update counters.
- `/metrics` renders Prometheus text from the platform collector and refreshes
  compatibility gauges such as `captcha_pending_count`.
- Preserve these Phase 8 metric names:
  `captcha_solve_duration_ms`, `captcha_display_latency_ms`,
  `captcha_pending_count`, `realtime_queue_depth`,
  `realtime_dropped_messages_total`, `background_job_lag_seconds`,
  `background_job_failures_total`, and `usage_confirm_core_duration_ms`.
- Peak fast mode is active when `PEAK_FAST_MODE=1` or
  `EOPP_PEAK_FAST_MODE=1`, and otherwise during Moscow windows
  `09:50-10:10` and `11:50-12:10`. Keep the Windows-safe UTC+03 fallback so
  local tests do not require the `tzdata` package.
- Display latency measures dispatch before human/operator wait. Do not include
  manual captcha wait time in the display SLO.
- Realtime fanout metrics must remain nonblocking: never await queues, never
  hold the registry lock while writing queues, and count slow-client drops
  without disconnecting that client.
- Worker failures must increment job failure metrics and update retry/dead
  state inside the worker only. They must not escape into HTTP hot paths.
- Run these focused checks after touching observability, peak mode, realtime
  fanout, jobs, or confirm timing:
  - `uv run pytest tests/test_observability_peak_mode.py server/tests/load/test_peak_solve_flow.py`
  - `uv run pytest tests/test_realtime_fanout.py tests/test_outbox_jobs.py tests/test_billing_isolation.py`
  - `uv run lint-imports`

## Phase 9 Production Delivery Rules

Phase 9 makes production promotion match the local working style: code, DB,
JSON content, config, and plugins can be edited locally, but they move to
production only as an explicit release state with a manifest and backup.

Important files:
- Release helpers: `scripts/deploy/release.ps1`
- Full deploy: `scripts/deploy/deploy.ps1`
- Mandatory/inspection backup: `scripts/deploy/backup.ps1`
- Explicit migration: `scripts/deploy/migrate.ps1`
- Release verification: `scripts/deploy/verify-release.ps1`
- Release rollback: `scripts/deploy/rollback.ps1`
- Explicit DB restore: `scripts/deploy/restore-backup.ps1`
- Compose template: `server/deploy/docker-compose.yml`
- Operator runbook: `docs/deploy-runbook.md`

Important rules:
- Every deploy or promotion must have a `release_id` in
  `YYYYMMDD_HHMMSS-<short_git_sha>` format and a `release.json`.
- Treat code, DB, JSON content, and plugins as one promotable production state
  for normal deploys. Emergency plugin-only and data-only commands still create
  release manifests and mandatory backups.
- Print a diff summary before push: git status/stat, DB table-count diff,
  data checksum, and plugins checksum.
- Production backup is mandatory before deploy, data promotion, or plugin-only
  promotion. Backups live under `/opt/eopp/shared/backups/<backup_id>`.
- Compose runs from `/opt/eopp`, mounts `./shared/data`, `./shared/certs`, and
  `./current/plugins`, and starts the app with `EOPP_AUTO_MIGRATE=0`.
- Migrations are explicit through `scripts/deploy/migrate.ps1`; production app
  startup must not mutate schema during health checks or rollback.
- Rollback targets a selected `release.json` or `/opt/eopp/previous`. Never pick
  a Docker image with `docker images | head -1`, `grep -v`, or similar
  heuristics.
- DB restore is explicit and operator-confirmed through
  `scripts/deploy/restore-backup.ps1 -BackupId <backup_id>`. Release rollback
  must not silently restore DB unless explicitly requested.
- For SQLite destructive or irreversible migrations, assume rollback means DB
  restore from backup unless a downgrade has been tested on production-copy
  data.
- Run this focused check after touching delivery scripts or runbook:
  - `uv run pytest server/tests/test_deploy_scripts.py`

## Final Architecture Review Notes

The 2026-06-11 protected-core review must be treated as a release gate, not as
documentation only. Before merge or production promotion, re-run the focused
checks for the touched layers and resolve any red core smoke tests.

Current review invariants:
- `server/src/core/` must stay free of side-module imports. Static checks should
  cover the actual import namespace used by the app (`src.*`), not only
  `server.src.*`.
- Manual `/solve-captcha` smoke coverage must prove that the pending session is
  visible through the legacy `src.sse.pending` compatibility map before the
  caller waits for `/solve`. A timeout-only pass is not acceptable.
- Data-only/full-state promotion must become a selectable release state:
  `current/release.json` should reflect the promoted data release, and rollback
  must be able to target that manifest rather than the previous code release.
- `push-data.ps1`, `push-plugins.ps1`, and `deploy.ps1` all need mandatory
  backup, visible diff summary, release manifest, verification, and an explicit
  restore path through `restore-backup.ps1`.
- Public protected-core contracts, module manifests, durable job DTOs, registry
  helpers, deploy release helpers, and new public methods need docstrings or
  comment-based PowerShell help that state the boundary/invariant they protect.
