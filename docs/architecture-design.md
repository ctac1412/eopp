# Архитектура EOPP v2 — Domain Modules + Event Bus

## 1. Текущая проблема

```
captcha.py (839 строк) импортирует:
  ├── auto_operator       (финансы/rucaptcha)
  ├── distribution        (распределёнка)
  ├── sse.manager         (транспорт)
  ├── captcha_service     (смесь HTTP + логики)
  ├── db.api_keys         (прямой доступ к БД)
  └── health.metrics      (метрики)

Если упала миграция billing → не стартует решение капч.
Если rucaptcha вернул 500 → captcha.py крашится.
Если изменили схему SSE → правим captcha.py.
```

## 2. Целевая структура

```text
server/src/
├── core/                         # фундамент: не зависит ни от кого
│   ├── __init__.py
│   ├── config.py                 # константы + загрузка .env
│   ├── db.py                     # engine, session_factory, get_session()
│   ├── events.py                 # EventBus (≈20 строк, см. ниже)
│   ├── errors.py                 # StartupError + доменные ошибки
│   └── metrics.py                # counter_inc, gauge_set, GET /metrics
│
├── domains/
│   ├── auth/                     # ключи, роли, валидация, middleware
│   │   ├── __init__.py
│   │   ├── routes.py             # /api-keys, /validate-key, /admin/auth
│   │   ├── service.py            # AuthService: create, validate, check_role
│   │   ├── middleware.py         # admin_auth_middleware_factory
│   │   └── models.py             # CreateApiKeyBody, UpdateApiKeyBody
│   │
│   ├── captcha/                  # ★ ядро — решение капч
│   │   ├── __init__.py
│   │   ├── routes.py             # POST /solve-captcha, /solve
│   │   ├── service.py            # CaptchaService: register, wait, resolve
│   │   ├── engine.py             # solve_captcha, assembly, hash, classify
│   │   └── models.py             # SolveCaptchaBody, SolveRequest
│   │
│   ├── sse/                      # real-time транспорт
│   │   ├── __init__.py
│   │   ├── routes.py             # GET /stream, /check-stream
│   │   ├── manager.py            # sse_queues, lock, pending, push_sse
│   │   └── models.py
│   │
│   ├── distribution/             # распределённое решение иконок
│   │   ├── __init__.py
│   │   ├── routes.py             # POST /distribution/answer
│   │   ├── service.py            # init_state, handle_answer, find_next
│   │   └── models.py
│   │
│   ├── operator/                 # операторы, их SSE, слоты
│   │   ├── __init__.py
│   │   ├── routes.py             # /operators/..., /admin/operators/...
│   │   ├── service.py            # OperatorService: link, unlink, slots
│   │   └── models.py
│   │
│   ├── usage/                    # логирование использования
│   │   ├── __init__.py
│   │   ├── routes.py             # /register-usage, /confirm, /fail
│   │   ├── service.py            # UsageService: create_log, confirm, fail
│   │   └── models.py
│   │
│   ├── billing/                  # финансы (тарифы, счета, выплаты)
│   │   ├── __init__.py
│   │   ├── routes.py             # /admin/tariffs, /admin/invoices, ...
│   │   ├── service.py            # BillingService
│   │   ├── tariffs.py            # calc_debt, tariff_history
│   │   ├── invoices.py           # generate, link usage_logs
│   │   ├── payouts.py            # calculate, create, FIFO
│   │   ├── prepaid.py            # deduct, topup
│   │   └── models.py
│   │
│   ├── slots/                    # координация слотов между клиентами
│   │   ├── __init__.py
│   │   ├── routes.py             # /slots-group/claim, /wait, /publish
│   │   ├── service.py            # SlotsService
│   │   └── models.py
│   │
│   ├── admin/                    # дашборд, мониторинг
│   │   ├── __init__.py
│   │   ├── routes.py             # /admin/dashboard, /admin/streams, ...
│   │   └── models.py
│   │
│   └── mock/                     # мок EOPP API для тестов
│       ├── __init__.py
│       ├── routes.py
│       └── service.py
│
├── plugins/                      # подключаемые автосолверы (см. §7)
│   ├── __init__.py
│   ├── base.py                   # AutoSolverProtocol (ABC)
│   ├── rucaptcha.py              # реализация rucaptcha.com
│   ├── capmonster.py             # пример второго солвера
│   └── registry.py               # реестр: список + выбор активного
│
├── app.py                        # сборка: create_app() + lifespan
├── manage.py                     # CLI (typer): --host, --port, --workers
└── models.py                     # общие Pydantic-модели (если нужны)
```

## 3. Event Bus — центральный механизм

```python
# core/events.py
import asyncio
import logging
from collections import defaultdict
from typing import Callable, Awaitable, Any

logger = logging.getLogger("eopp.events")

Handler = Callable[..., Awaitable[Any]]
_subscribers: dict[str, list[Handler]] = defaultdict(list)


def on(event: str, handler: Handler) -> None:
    """Подписаться на событие. Вызывается при старте приложения."""
    _subscribers[event].append(handler)
    logger.debug("event_subscribe event=%s handler=%s", event, handler.__name__)


async def emit(event: str, **kwargs: Any) -> None:
    """Отправить событие. Все подписчики вызываются конкурентно."""
    handlers = _subscribers.get(event, [])
    if not handlers:
        return
    tasks = [asyncio.create_task(h(**kwargs)) for h in handlers]
    # Ждём всех, но не роняем emit если один упал
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(
                "event_handler_error event=%s handler=%s error=%s",
                event, handlers[i].__name__, result,
            )


def clear() -> None:
    """Очистить подписки (для тестов)."""
    _subscribers.clear()
```

### Пример: captcha-service НЕ знает про sse и distribution

```python
# domains/captcha/service.py
from core.events import emit

class CaptchaService:
    async def register(self, entry: dict) -> None:
        pending[entry["captcha_id"]] = entry
        # ── вместо 4 импортов — одно событие ──
        await emit("captcha:new",
            captcha_id=entry["captcha_id"],
            images=entry["images"],
            owner_id=entry["api_key_id"],
            entry=entry,
        )
```

```python
# domains/sse/manager.py — подписывается при старте
from core.events import on

async def _on_captcha_new(captcha_id, images, owner_id, **kw):
    push_sse({"type": "new_captcha", "captcha_id": captcha_id, "images": images},
             api_key_id=owner_id)

def setup():
    on("captcha:new", _on_captcha_new)
```

```python
# plugins/rucaptcha.py — отдельный файл, подключается сам
from core.events import on

async def _on_captcha_dispatch(captcha_id, entry, **kw):
    if entry.get("captcha_type") == 1:
        dispatch_auto_solve(captcha_id, ...)

def setup():
    on("captcha:new", _on_captcha_dispatch)
```

### События системы

```text
captcha:new          → sse.push, distribution.init, rucaptcha.dispatch
captcha:solved       → sse.push, usage.confirm, billing.calc_debt
captcha:timeout      → sse.push, usage.fail, distribution.cleanup
usage:created        → billing.ensure_open_invoice (если включено)
usage:confirmed      → billing.calc_debt, prepaid.deduct
usage:failed         → billing.mark_failed
operator:connected   → chat.message, slots.rebuild
operator:disconnected→ chat.message, slots.rebuild
server:shutdown      → sse.notify_all, pending.clear, distribution.cleanup
```

## 4. Правила зависимостей

```text
                    ┌──────────────────────────────┐
                    │           core/              │
                    │  (config, db, events, errors)│
                    └──────────┬───────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
    ┌──────────┐       ┌──────────┐         ┌──────────┐
    │  auth/   │       │  sse/    │         │  mock/   │
    └────┬─────┘       └────┬─────┘         └──────────┘
         │                  │
    ┌────▼─────┐      ┌─────▼──────┐
    │ captcha/ │      │ operator/  │
    └────┬─────┘      └─────┬──────┘
         │                  │
    ┌────▼─────┐      ┌─────▼──────┐
    │  usage/  │      │distribution│
    └────┬─────┘      └────────────┘
         │
    ┌────▼─────┐      ┌────────────┐
    │ billing/ │      │  slots/    │
    └────┬─────┘      └────────────┘
         │
    ┌────▼─────┐
    │  admin/  │  ← только агрегация, зависит от всех
    └──────────┘

    plugins/  ← зависит от core + подписывается на события
```

**Жёсткое правило**: домен уровня N может импортировать только `core/` и домены уровня ≤ N-1. Никогда наоборот.

**Мягкое правило**: домены общаются через `emit()/on()`. Прямые импорты между доменами одного уровня — только если нужно (например `distribution` → `captcha` для доступа к pending).

## 5. app.py — сборка

```python
# app.py
from core.events import on
from domains.auth.middleware import admin_auth_middleware_factory
from domains.sse.manager import setup as sse_setup
from plugins.rucaptcha import setup as rucaptcha_setup

def create_app() -> FastAPI:
    init_db()

    # ── регистрация подписчиков на события ──
    sse_setup()                    # sse слушает captcha:new, captcha:solved
    rucaptcha_setup()              # rucaptcha слушает captcha:new

    app = FastAPI(lifespan=lifespan)

    # ── middleware ──
    app.add_middleware(CORSMiddleware, ...)
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(RateLimitMiddleware)
    admin_auth_middleware_factory(app)

    # ── роуты — просто регистрируем, порядок не важен ──
    app.include_router(health_router)
    app.include_router(sse_router)
    app.include_router(captcha_router)      # ← не знает про другие
    app.include_router(distribution_router)
    app.include_router(auth_router)
    app.include_router(usage_router)
    app.include_router(slots_router)
    app.include_router(operator_router)
    app.include_router(billing_router)
    app.include_router(admin_router)
    app.include_router(mock_router)

    return app
```

## 6. Плоское расширение (Flat Extensibility)

### 6.1 Как добавить новый домен

```bash
# 1. Создать директорию
mkdir server/src/domains/notifications

# 2. Реализовать
#    domains/notifications/service.py
#    domains/notifications/routes.py   (если нужен HTTP)
#    domains/notifications/models.py

# 3. Подписаться на события
#    domains/notifications/setup.py:
from core.events import on

async def _on_usage_confirmed(usage_log_id, api_key, **kw):
    await send_telegram(api_key, f"Usage {usage_log_id} confirmed")

def setup():
    on("usage:confirmed", _on_usage_confirmed)

# 4. Зарегистрировать в app.py
from domains.notifications.setup import setup as notif_setup
notif_setup()
app.include_router(notif_router)
```

### 6.2 Как добавить новый автосолвер

```python
# plugins/capmonster.py
from plugins.base import AutoSolverProtocol
from core.events import on

class CapMonsterSolver(AutoSolverProtocol):
    name = "capmonster"
    priority = 1  # 0 = rucaptcha, 1 = capmonster (fallback)

    async def solve_icon(self, main_b64, icon_b64, pos):
        ...  # вызов capmonster API

    async def solve_puzzle(self, tiles, variants):
        ...  # вызов capmonster API

def setup():
    solver = CapMonsterSolver()
    on("captcha:new", solver.on_new_captcha)

# ── всё. captcha.py не менялся ──
```

### 6.3 Как добавить новый тип капчи

```python
# plugins/solvers/recaptcha_v3.py
from core.events import on

async def _on_captcha_new(entry, **kw):
    if entry.get("type") == "recaptcha_v3":
        token = await solve_recaptcha(entry["sitekey"])
        entry["event"].set()
        entry["result"] = {"token": token}

def setup():
    on("captcha:new", _on_captcha_new)
```

## 7. Масштабирование воркеров

### 7.1 Вертикальное (один сервер)

```bash
# manage.py — флаг --workers
python server/manage.py --host 0.0.0.0 --workers 4

# Внутри manage.py:
uvicorn.run(fastapi_app, workers=workers, ...)
```

Uvicorn сам форкает процессы. Каждый процесс — независимый event loop.

**Проблема**: pending, sse_queues, distribution_states — в памяти процесса. При `workers=4` капча зарегистрирована в процессе 1, а ответ пришёл в процесс 3 → 404.

**Решение**: вынести разделяемое состояние в Redis/БД:

```python
# core/state.py — абстракция над in-memory / Redis
class StateBackend(Protocol):
    async def get(self, key: str) -> dict | None: ...
    async def set(self, key: str, value: dict, ttl: int = 60) -> None: ...
    async def delete(self, key: str) -> None: ...
    async def keys(self, pattern: str) -> list[str]: ...

class InMemoryBackend(StateBackend):
    """Для одного воркера — dict в памяти."""
    _store: dict[str, dict] = {}

class RedisBackend(StateBackend):
    """Для multi-worker — Redis."""
    def __init__(self, url: str):
        self._redis = aioredis.from_url(url)

# Выбор бекенда при старте
state: StateBackend = (
    RedisBackend(os.environ["REDIS_URL"])
    if os.environ.get("REDIS_URL")
    else InMemoryBackend()
)
```

**SSE при multi-worker**: Redis Pub/Sub. Uvicorn worker подписывается на канал `sse:{api_key_id}`, при `push_sse` публикует в Redis, все воркеры доставляют своим SSE-клиентам.

### 7.2 Горизонтальное (несколько серверов)

```text
                   ┌─────────────┐
                   │   nginx     │  (round-robin / ip_hash)
                   └──────┬──────┘
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ Worker 1 │   │ Worker 2 │   │ Worker 3 │
    │ :8001    │   │ :8002    │   │ :8003    │
    └────┬─────┘   └────┬─────┘   └────┬─────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
              ┌──────────▼──────────┐
              │       Redis         │  (pending, sse pub/sub, rate limits)
              └─────────────────────┘
              ┌─────────────────────┐
              │      SQLite/PSQL    │  (api_keys, usage_log, billing)
              └─────────────────────┘
```

### 7.3 Тяжёлые задачи — Task Queue

Решение капчи (особенно автосолвер) — CPU-bound. Выносим в фоновый процесс:

```python
# domains/captcha/service.py
from core.tasks import enqueue

class CaptchaService:
    async def solve_auto(self, data: dict) -> dict:
        # Не блокируем event loop
        result = await enqueue("captcha:solve", data)
        return result

# core/tasks.py — обёртка над ARQ (arq-django) или Celery
import arq

async def enqueue(task_name: str, data: dict) -> dict:
    job = await arq_pool.enqueue_job(task_name, data)
    return await job.result(timeout=30)
```

```bash
# Отдельный процесс-воркер для тяжёлых задач
arq server.tasks.WorkerSettings --queue captcha_solve
```

### 7.4 Рекомендация

| Масштаб | Решение | Когда |
|---------|---------|-------|
| <50 капч/мин | 1 worker, in-memory | Сейчас |
| 50-200 капч/мин | 4 workers + Redis StateBackend | `make run-prod --workers 4` |
| >200 капч/мин | nginx + multi-instance + Redis + ARQ | Отдельные сервера |

## 8. Изоляция клиентов на свои сервера

### 8.1 Multi-tenant (все на одном)

```text
Один сервер, все клиенты:
  POST /solve-captcha  {api_key: "client_a_..."}
  POST /solve-captcha  {api_key: "client_b_..."}
  GET  /stream?api_key=client_a_
  GET  /stream?api_key=client_b_

Разделение: по api_key_id в sse_queues, pending, usage_log.
Плюс: просто.
Минус: шумный сосед. Client A грузит сервер → Client B тормозит.
```

### 8.2 Instance per client (выделенные сервера)

```text
docker compose:
  eopp-client-a:   ports: 8766  DB: /data/client_a/api_keys.db
  eopp-client-b:   ports: 8767  DB: /data/client_b/api_keys.db
  eopp-client-c:   ports: 8768  DB: /data/client_c/api_keys.db

Каждый клиент получает свой порт + свою БД + свой процесс.
Плюс: полная изоляция, независимые лимиты.
Минус: память (3× python process), администрирование.
```

Docker Compose для этого:
```yaml
# docker-compose.clients.yml
x-client-template: &client
  build: .
  restart: unless-stopped
  volumes:
    - ./server/certs:/app/certs:ro

services:
  eopp-alpha:
    <<: *client
    ports: ["8766:8765"]
    environment:
      EOPP_DB_PATH: /app/data/alpha.db
      ADMIN_TOKEN: ${ALPHA_ADMIN_TOKEN}
      EOPP_DATA_DIR: /app/data/alpha

  eopp-beta:
    <<: *client
    ports: ["8767:8765"]
    environment:
      EOPP_DB_PATH: /app/data/beta.db
      ADMIN_TOKEN: ${BETA_ADMIN_TOKEN}
      EOPP_DATA_DIR: /app/data/beta
```

### 8.3 Shared core + isolated heavy clients (гибрид)

```text
                   ┌─────────────────────────────┐
                   │      Shared Instance         │
                   │  (/health, /api-keys,        │
                   │   /admin, /mock, DB)         │
                   │  Легковесные клиенты A,B,C   │
                   └─────────────────────────────┘

  ┌──────────────────────┐    ┌──────────────────────┐
  │  Dedicated Heavy-1   │    │  Dedicated Heavy-2   │
  │  (/solve-captcha,    │    │  (/solve-captcha,    │
  │   /stream, SSE)      │    │   /stream, SSE)      │
  │  Клиент D (100 капч) │    │  Клиент E (200 капч) │
  │  Своя БД для usage   │    │  Своя БД для usage   │
  └──────────────────────┘    └──────────────────────┘
```

Тяжёлые клиенты получают выделенные инстансы только для `/solve-captcha` и `/stream`. Ключи и биллинг — на общем инстансе. Extension-клиент знает URL своего сервера через конфиг.

### 8.4 Как extension узнаёт свой сервер

```typescript
// extension/src/constants.ts
const CLIENT_SERVER_MAP: Record<string, string> = {
  "client_a": "https://a.eopp.example.com",
  "client_b": "https://b.eopp.example.com",
  "default":  "https://shared.eopp.example.com",
};

// API key содержит префикс клиента: "client_a_abc123..."
function getServerForApiKey(apiKey: string): string {
  const prefix = apiKey.split("_")[0];
  return CLIENT_SERVER_MAP[prefix] || CLIENT_SERVER_MAP["default"];
}
```

Либо сервер отдаёт `GET /api-key-status` c полем `server_url`, и extension использует его.

## 9. Порядок миграции (без даунтайма)

```text
Неделя 1 — Service extraction
  ├── Вынести core/ (config, db, events, metrics, errors)
  ├── Вынести auth/service.py из admin.py + api_keys.py
  └── Вынести captcha/service.py из captcha.py (только логика)

Неделя 2 — Event Bus
  ├── Внедрить EventBus в app.py
  ├── Заменить прямые push_sse на emit("captcha:new")
  ├── Заменить прямые init_distribution на emit("captcha:new")
  └── Подписчики: sse, distribution, rucaptcha

Неделя 3 — Домены
  ├── Вынести usage/, billing/ из admin.py
  ├── Вынести distribution/ из routes/
  ├── Вынести operator/, slots/ из routes/
  └── admin/ — оставить только агрегацию и дашборд

Неделя 4 — Плагины
  ├── plugins/base.py: AutoSolverProtocol
  ├── plugins/rucaptcha.py: вынос из auto_operator.py
  └── plugins/registry.py: выбор активного

На каждом шаге: тесты проходят, API не меняется.
```

## 10. Контракты доменов

Каждый домен экспортирует:

```python
# domains/<name>/__init__.py
from .routes import router
from .service import setup   # регистрация в EventBus
from . import models          # Pydantic модели

__all__ = ["router", "setup", "models"]
```

Домен НЕ экспортирует внутренние функции. Другие домены НЕ импортируют из соседа. Всё общение — через EventBus.

---

**Документ готов. Начать с недели 1 — вынос `core/`?**
