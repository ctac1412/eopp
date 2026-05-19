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
│  Browser Extension (yandex-browser-plugin/)                 │
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

### 2. Python Server (`src/`)

**Основные модули:**

| Файл | Назначение |
|------|-----------|
| `manage.py` | CLI-входная точка сервера (typer), автогенерация self-signed SSL, запуск uvicorn |
| `src/app.py` | FastAPI-приложение: создание app, lifespan, CORS, middleware |
| `src/routes.py` | Точка входа: регистрирует все роутеры из `src/routes/` |
| `src/routes/*.py` | Роутеры по модулям: `captcha.py`, `sse.py`, `api_keys.py`, `usage.py`, `slots.py`, `mock.py`, `admin.py`, `plugins.py`, `frontend.py` |
| `src/models.py` | Pydantic-модели для валидации запросов |
| `src/constants.py` | Константы: порты, пути, токены, настройки |
| `src/utils.py` | Утилиты: хеширование, сборка изображений, SSE push, тесты, benchmark |
| `src/db/` | SQLite-слой: `api_keys.py`, `usage_log.py`, `tariffs.py`, `withdrawals.py`, `init.py`, `connection.py` |
| `src/plugins.py` | Система плагинов: загрузка, хранение, версионирование |
| `scripts/` | Скрипты: `bump_plugin_version.py`, `copy_plugin_to_plugins.py` |
| `captcha_solver.py` | Алгоритм решения капчи (discontinuity, SSIM, coherence, Sobel) |

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
- `make run` — обычный режим, слушает капчи (HTTPS)
- `make run-http` — обычный режим без SSL (HTTP)
- `make run-test` — автоматически посылает тестовые капчи из `tests/test_cases/valid/`
- `make run-write` — labeling mode: капчи из `tests/test_cases/no_valid/`, ответ сохраняется обратно

### 3. Browser Extension (`yandex-browser-plugin/`)

> **ВАЖНО:** Перед релизом плагина ВСЕГДА читай `yandex-browser-plugin/AGENTS.md` — там описан точный порядок действий.

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
| `manage.py` | CLI-входная точка сервера (typer), автогенерация self-signed SSL, запуск uvicorn |
| `src/app.py` | FastAPI-приложение: роуты, SSE, обработка капч, serve фронтенда |
| `src/routes.py` | Все роуты: капчи, SSE, API ключи, usage log, mock EOPP, slots groups (1219 строк) |
| `src/utils.py` | Утилиты: хеширование капч, сборка изображений, SSE push, загрузка тестов, benchmark |
| `captcha_solver.py` | Алгоритм решения капчи (discontinuity, SSIM, coherence, Sobel) |
| `yandex-browser-plugin/manifest.json` | Manifest V3, permissions, content script match |
| `yandex-browser-plugin/src/` | TypeScript-источники расширения (Vite-билд → `dist/`) |
| `frontend/src/App.jsx` | Главная страница: SSE + CaptchaGrid + StatusBar + LogViewer |
| `frontend/src/AdminPage.jsx` | Админ-панель |
| `index.html` | Фоллбэк HTML-UI для капч (vanilla JS, SSE, без React) |

---

## Запуск и разработка

```bash
# Установка зависимостей
uv sync
make install-frontend
make install-extension

# Запуск сервера
make run           # обычный режим (HTTPS)
make run-http      # обычный режим (HTTP)
make run-test      # с тестовыми капчами
make run-write     # labeling mode
make run-dev       # dev режим (HTTP :8766, своя БД)

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

**Extension** (yandex-browser-plugin/package.json):
- react, react-dom, zustand — UI/state
- vite — сборка
- typescript, @types/chrome — типы

---

## Dev/Prod Изоляция (Docker)

Проект поддерживает изоляцию Dev и Prod контуров на одном ПК.

### Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                      Windows (Docker Desktop)                │
│                                                              │
│  make run-dev ──► :8766 (HTTP) ──► data/api_keys_dev.db    │
│                                                              │
│  docker compose up ──► :8765 (HTTPS) ──► eopp_prod_data   │
│                           (volume)                          │
└─────────────────────────────────────────────────────────────┘
```

### Компоненты изоляции

| Компонент | Dev | Prod |
|-----------|-----|------|
| **Порт** | 8766 (HTTP) | 8765 (HTTPS) |
| **База данных** | `data/api_keys_dev.db` | Volume `eopp_eopp_prod_data` |
| **Запуск** | `make run-dev` | `docker compose up -d` |

### Файлы конфигурации

| Файл | Назначение |
|------|-----------|
| `manage.py` | + `--db-path` аргумент для кастомной БД |
| `src/api_keys.py` | Поддержка `EOPP_DB_PATH` env variable |
| `Makefile` | + `run-dev` target |
| `Dockerfile` | Multi-stage build для prod |
| `docker-compose.yml` | Prod сервис с named volume |
| `.dockerignore` | Исключения для Docker сборки |

### Команды

```bash
# Dev-контур (локально, без Docker)
make run-dev                  # HTTP :8766, своя БД

# Prod-контур (Docker)
docker compose up -d --build  # HTTPS :8765, volume
docker compose down           # Остановить
docker compose logs -f        # Логи

# Бекап prod БД
docker run --rm -v eopp_eopp_prod_data:/data -v $(pwd):/backup alpine tar czf /backup.tar.gz -C /data .
```

### Важные детали

- **SSL**: Сертификат генерируется автоматически при старте контейнера
- **Volume**: Данные prod сохраняются между перезапусками контейнера
- **Изоляция**: Dev и Prod используют **разные БД** — изменения в dev не влияют на prod
- **Фронтенд**: При сборке Docker автоматически включает `frontend/dist/`