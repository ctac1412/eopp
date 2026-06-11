# План действий по аудиту EOPP

## Общая логика

Фазы идут последовательно. Внутри фазы задачи сгруппированы по компонентам — их можно параллелить между разработчиками. После каждой фазы — стабилизационный день: прогон тестов, ручное тестирование, деплой на staging.

---

## Фаза 1 — Критическое (день 1–5)

> Цель: закрыть дыры, которые могут привести к падению сервера, потере данных или утечке.

### День 1–2: База и конфигурация (можно параллельно)

| # | Задача | Кто | Проверка |
|---|--------|-----|----------|
| 1a | `init_db()` — не глотать ошибки миграций. `raise RuntimeError` | Backend | Уронить БД → сервер не стартует с внятной ошибкой |
| 1b | Унифицировать `DB_PATH`: `connection.py` + `entities/base.py` → `constants.py` | Backend | Тест: оба слоя пишут в один файл |
| 1c | CORS: `*` + `credentials=True` → explicit origins | Backend | `curl -H "Origin: evil.com" → 403` |
| 1d | Убрать hardcoded `ADMIN_TOKEN = 13243546`. Нет env → `raise StartupError` | Backend | Запуск без `ADMIN_TOKEN` → отказ |

### День 2–3: Конкурентность и безопасность (можно параллельно)

| # | Задача | Кто | Проверка |
|---|--------|-----|----------|
| 2a | `pending` dict race: `setdefault()` + возврат существующего entry | Backend | Тест: 2 одновременных POST с одинаковым hash → оба получают ответ |
| 2b | Path traversal в `/plugins/{filename}`: `os.path.realpath` + проверка префикса | Backend | `curl /plugins/../../../etc/passwd → 404` |
| 2c | `.dockerignore` + multi-stage Dockerfile + fix `docker-compose.yml` volume | DevOps | `docker build` — образ <200MB, `sqlite-web` видит БД |
| 2d | Rucaptcha callback: HMAC-подпись или IP-whitelist. Иначе отключить webhook если ключ не задан | Backend | Тест: callback без подписи → 401 |

### День 3–5: Данные и миграции

| # | Задача | Кто | Проверка |
|---|--------|-----|----------|
| 3a | `payout_expenses` UNIQUE(payout_id, expense_id) + миграция-дедупликация | Backend | Тест: дубль → 409 conflict |
| 3b | Индексы SQLite: `usage_log(api_key_id)`, `usage_log(company)`, `captchas(usage_log_id)`, `payouts(status)`, `payout_shares(payout_id)` | Backend | `EXPLAIN QUERY PLAN` показывает индекс |
| 3c | Usage-count race: атомарный `UPDATE ... WHERE usage_count < max_uses RETURNING *` | Backend | Тест: 2 параллельных usage на лимите → один 200, второй 429 |
| 3d | `asyncio.Event` вместо `threading.Event` в `/solve-captcha`. Убрать `run_in_executor` | Backend | Нагрузочный тест: 200 параллельных капч, нет deadlock |

### Стабилизация (день 5)

- Полный прогон `uv run pytest server/tests/`
- Ручной прогон: создать капчу → решить → проверить usage log
- `docker compose up` → проверить health, SSE, sqlite-web

---

## Фаза 2 — Высокое (день 6–14)

> Цель: наблюдаемость, отказоустойчивость, ролевая модель.

### День 6–8: Наблюдаемость и мониторинг

| # | Задача | Кто | Проверка |
|---|--------|-----|----------|
| 4a | `GET /health` — проверка БД (SELECT 1) | Backend | `curl /health → {"status":"ok","db":"ok"}` |
| 4b | `GET /ready` — БД + SSE manager + rucaptcha (если включён) | Backend | `curl /ready` при отключённой БД → 503 |
| 4c | Prometheus-метрики: `GET /metrics`. Счётчики: `requests_total`, `captcha_solve_duration`, `sse_connections_active`, `pending_captchas` | Backend | `curl /metrics` → валидный Prometheus формат |
| 4d | Валидация `RUCAPTCHA_API_KEY` при старте: нет ключа → `logger.info("disabled")`, не запускать `auto_operator` | Backend | Старт без ключа → нет фоновых ошибок |
| 4e | `/admin/dashboard` — агрегация: pending, distribution, operators, активные SSE | Backend | Сравнить с `/admin/streams`, `/admin/test-stats` |

### День 8–11: Ролевая модель

| # | Задача | Кто | Проверка |
|---|--------|-----|----------|
| 5a | Миграция: `ALTER TABLE api_keys ADD COLUMN admin_role TEXT` | Backend | `alembic upgrade head` → колонка есть |
| 5b | `ApiKey.admin_role` в ORM-сущности | Backend | Создать ключ с ролью → в БД значение |
| 5c | `get_admin_role(token)` → `"super_admin"` / `"manager"` / `None`. Замена `check_admin_token` | Backend | Тест на каждый вариант |
| 5d | Middleware: руты смены `admin_role` только для `super_admin`. Остальные admin-руты — `super_admin` или `manager` | Backend | Manager пробует сменить роль → 403 |
| 5e | `/admin/auth` → `{ok: true, role: "super_admin"|"manager"}` | Backend + Frontend | Фронтенд получает роль |
| 5f | Фронтенд AdminPage: скрыть селектор роли для manager, показывать бейдж роли | Frontend | Manager логинится → нет кнопки смены роли |
| 5g | `UpdateApiKeyBody.admin_role: str | None` в models.py | Backend | Валидация Pydantic |

### День 11–14: Отказоустойчивость и Graceful Shutdown

| # | Задача | Кто | Проверка |
|---|--------|-----|----------|
| 6a | Graceful shutdown в `lifespan`: пройти `pending`, отправить SSE `captcha_timeout`, дождаться `event.set()` | Backend | `Ctrl+C` → клиенты получают timeout |
| 6b | Circuit breaker для EOPP API (403 access challenge): счётчик ошибок, exponential backoff 1s/2s/4s/8s, автосброс через 30с | Backend | Эмулировать 5 ошибок подряд → 6-й запрос через 8с |
| 6c | TTL cleanup для `distribution_states`: `asyncio.create_task` каждые 30с | Backend | Создать стейт, не отвечать → через N сек удалён |
| 6d | `AbortSignal.timeout(15000)` для fetch в `background.js` расширения | Extension | Сервер не отвечает → через 15с ошибка, не 30с |

### Стабилизация (день 14)

- Полный прогон тестов
- Проверка ролей: залогиниться super_admin, manager — проверить доступы
- Нагрузочный тест с graceful shutdown
- Деплой на staging

---

## Фаза 3 — Среднее (день 15–30)

> Цель: производительность, качество кода, масштабирование.

### День 15–19: База данных и производительность

| # | Задача | Кто | Проверка |
|---|--------|-----|----------|
| 7a | Миграция raw sqlite3 → единый SQLAlchemy для всех CRUD | Backend | Все тесты проходят. Старые функции raw sqlite3 удалены |
| 7b | Connection pooling: замена `get_connection()` на `get_session()` | Backend | Профилирование: меньше открытий/закрытий |
| 7c | Tariff history: таблица `tariff_history(price, effective_from)`, `calc_debt` использует тариф на момент usage | Backend | Изменить тариф → старые usage считаются по старой цене |
| 7d | Prepaid double-spend fix: `BEGIN IMMEDIATE` для deduction | Backend | Два одновременных deduction → только один проходит |
| 7e | FIFO в `payouts.py` в одной транзакции | Backend | Тест: payout при параллельном usage |

### День 19–23: Расширение и фронтенд

| # | Задача | Кто | Проверка |
|---|--------|-----|----------|
| 8a | Retry на network errors в pipeline расширения (3 попытки, exponential backoff) | Extension | Отключить сеть → авто-reconnect |
| 8b | Structured logging в расширении: debug/info/warn/error, фильтр в UI | Extension | Переключить уровень → логи фильтруются |
| 8c | Refactor `AdminPage.jsx` (1390 строк) → подкомпоненты с `React.memo` | Frontend | Каждый таб — отдельный файл. Ререндер только активного таба |
| 8d | Refactor `ConfigForm.tsx` (977 строк) → `ModeSelector`, `RetryConfig`, `MockPanel` | Extension | Компоненты тестируются изолированно |
| 8e | Virtual scrolling для `LiveLog` и `LogViewer` | Extension + Frontend | 10k записей → рендер <50ms |

### День 23–27: Аудит, безопасность, инфраструктура

| # | Задача | Кто | Проверка |
|---|--------|-----|----------|
| 9a | `admin_audit_log` таблица: action, admin_id, target_type, target_id, old_value, new_value, timestamp | Backend | Изменить ключ → запись в аудит-логе |
| 9b | Rate limiting: `slowapi` на `/solve-captcha` (30/мин), `/validate-key` (10/мин) | Backend | 31-й запрос → 429 |
| 9c | Убрать `tempfile.mktemp()` → `mkstemp()` во всех conftest | Backend | `grep -r mktemp` → 0 результатов |
| 9d | `make test` в Makefile | DevOps | `make test` → прогон всех тестов |
| 9e | GitHub Actions CI: `pytest`, `ruff`, `eslint`, `tsc --noEmit` на каждый PR | DevOps | PR → зелёный/красный статус |

### День 27–30: Масштабирование и финальная стабилизация

| # | Задача | Кто | Проверка |
|---|--------|-----|----------|
| 10a | Retention policy: cron-задача удаления `captcha_files` >30д, `usage_log` → архив >90д | Backend | Ручной запуск → старые записи в архиве |
| 10b | External REST API: `POST /api/v1/solve`, `POST /api/v1/book` | Backend | `curl` → решить капчу без расширения |
| 10c | Facilities с сервера: `GET /api/v1/facilities` вместо hardcoded UUID в расширении | Extension + Backend | Изменить UUID на сервере → расширение подхватывает |
| 10d | Redis-слой для `pending`, `distribution_states`, SSE pub/sub (подготовка к multi-instance) | Backend | Два instance сервера → общий pending |
| 10e | Полный регресс: все тесты, ручной прогон всех сценариев, деплой | Все | Staging → production |

---

## Стратегия параллелизации

```
Фаза 1                    Фаза 2                         Фаза 3
═══════════               ═══════════                    ═══════════
Dev 1: 1a,1b,3b,3c        4a,4b,4c,6a,6b,6c             7a,7b,7c,7d,9a,9b
Dev 2: 1c,1d,2a,2b,2d     5a-g (ролевая модель)          7e,9c,10a,10b
Dev 3: 2c,3a,3d           4d,4e,6d                       8a,8b,8d,8e,10c
Dev 4: —                   —                              8c,9d,9e,10d,10e
```

Два разработчика закрывают фазу 1 за 5 дней. Три разработчика — фазу 2 за 9 дней. Четыре — фазу 3 за 15 дней.

## Стратегия проверки на каждом этапе

1. **После каждой задачи**: автотесты для изменённого модуля
2. **Конец дня**: `uv run pytest server/tests/ -v` — все тесты
3. **Конец фазы**: ручной прогон сценариев на staging
4. **Перед деплоем**: `make build-frontend && make build-extension && docker compose up --build`

## Стратегия внедрения

- **Canary**: staging-сервер → 1 день → production
- **Откат**: `git revert` + `docker compose up -d` (предыдущий образ)
- **Мониторинг после деплоя**: смотреть `/metrics` (ошибки, latency), `/admin/dashboard` (pending)
