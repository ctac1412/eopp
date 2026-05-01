# EOPP — Captcha Solver & Reservation Injector

## Обзор проекта

Проект решает пазл-капчу системы EOPP (Электронная система организации пропуска транспорта через пункты пропуска) и автоматизирует перенос/создание бронирований на пропускных пунктах (АПП).

Состоит из 3 независимых компонентов:
1. **Python-сервер** (FastAPI) — решатель капчи с веб-UI для ручного решения
2. **React-фронтенд** — SPA для управления конфигурацией инжектора
3. **Browser Extension** — контент-скрипт для автоматизации прямо в браузере на `eopp.epd-portal.ru`

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  Browser Extension (yandex-browser-plugin/)                  │
│  content.js  ──port──▶  background.js  ──fetch──▶  Server   │
│  (EOPP API)            (прокси к нашему серверу)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ POST /solve-captcha
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Python Server (src/app.py, captcha_solver.py)               │
│  FastAPI на :8765 (HTTPS, self-signed cert)                  │
│                                                              │
│  POST /solve-captcha  ← принимает капчу, блокирует до ответа │
│  POST /solve          ← ручной ответ от UI                   │
│  GET  /stream         ← SSE, пуш новых капч                  │
│  /*                     ← React SPA (frontend/dist/)         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  React Frontend (frontend/)                                  │
│  /      — UI для ручного решения капч (CaptchaGrid, SSE)    │
│  /injector — конфигуратор инжектора + экспорт JSON           │
└─────────────────────────────────────────────────────────────┘
```

---

## Сервисы и эндпоинты

### Python Server (`manage.py`, порт 8765, HTTPS)

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/stream` | SSE-поток: события `new_captcha`, `captcha_solved`, `captcha_timeout` |
| `POST` | `/solve-captcha` | Принимает данные капчи. Если `auto_solve=true` — решает сразу. Иначе блокирует до ручного ответа или таймаута (10с) |
| `POST` | `/solve` | Отправляет ручной ответ: `{ captcha_id, variantIndex }` |
| `POST` | `/broadcast` | Ручной пуш SSE-события |
| `POST` | `/trigger-test` | Запуск тестовых капч из `tests/test_cases/valid/` |
| `GET` | `/*` | React SPA (файлы из `frontend/dist/`) |

### Режимы запуска сервера

- `make run` — обычный режим, слушает капчи
- `make run-test` — автоматически посылает тестовые капчи из `tests/test_cases/valid/`
- `make run-write` — labeling mode: капчи из `tests/test_cases/no_valid/`, ответ сохраняется обратно

---

## Компоненты

### 1. Captcha Solver (`captcha_solver.py`)

Алгоритм автоматического решения пазл-капчи. Анализирует N вариантов сборки тайлов, выбирает лучший по совокупности метрик:

- **Discontinuity** — разница пикселей на стыках тайлов (чем меньше, тем лучше)
- **SSIM** — структурное сходство на стыках (чем больше, тем лучше)
- **Coherence** — корреляция градиентов между соседними тайлами (чем больше, тем лучше)
- **Sobel continuity** — непрерывность краёв через оператор Собеля (чем меньше, тем лучше)

Финальный score: `disc * 0.5 + (1 - ssim) * 800 - coh * 80 + sobel * 0.5`. Минимальный score = лучший вариант.

Дополнительно: динамическая обрезка чёрных коррумпированных бордеров с тайлов перед анализом.

### 2. Browser Extension (`yandex-browser-plugin/`)

Manifest V3 расширение для Яндекс.Браузера (совместимо с Chrome).

**Архитектура расширения:**
- **Content Script** (`content.js`) — инжектируется на страницы `eopp.epd-portal.ru/ru/reservations/reservation/*/edit`. Делает прямые fetch-запросы к EOPP API (`/reservations-api/v1/...`) с `credentials: "include"`. Содержит полную 5-стадийную логику pipeline.
- **Background Script** (`background.js`) — service worker. Проксирует запросы к `https://china.alabai.netcraze.pro` (наш сервер).

**Коммуникация content ↔ background:** Port-based messaging (`chrome.runtime.connect` + `port.onMessage`). Async callback-подход ненадёжен в MV3 — service worker может быть suspend-нут.

**5-стадийный pipeline инжектора:**
1. `getAvailableSlots()` — GET `/reservations-api/v1/timeslot/AvailableSlots`
2. `generateCaptcha()` — POST `/reservations-api/v1/captcha`
3. `solveCaptcha()` → background → POST `china.alabai.netcraze.pro/solve-captcha`
4. `validateCaptcha()` — POST `/reservations-api/v1/captcha-validate`
5. `submitReschedule()` / `submitCreate()` — POST `/reservations-api/v1/Reschedule` или `/reservations-api/v1/SubmitDraft`

**UI:** Кнопка "Инжектор" (фиксированная, bottom-right) → модалка с JSON-конфигуратором (textarea) → кнопка "Запустить".

### 3. React Frontend (`frontend/`)

Vite + React 18 + React Router + Zustand.

**Страницы:**
- `/` — CaptchaGrid: отображает активную капчу, варианты с изображениями, SSE-подписка, ручной выбор варианта
- `/injector` — Конфигуратор инжектора: форма с полями (АПП, vehicleId, reservationId, transportType, slotDate, mode, preferredTime, retry-настройки), генерация скрипта для копирования, экспорт JSON

**Конфиг инжектора (JSON):**
```json
{
  "runUpTo": 4,
  "facilityId": "...",
  "vehicleId": "...",
  "reservationId": "...",
  "transportType": 1,
  "slotDate": "2026-04-30",
  "mode": "reschedule",
  "preferredTime": null,
  "autoSolve": true,
  "retryOnAllSlotsOccupied": true,
  "maxSlotRetries": 5,
  "slotRetryDelayMs": 500,
  "retryDelayMs": 5000,
  "maxRetries": 5
}
```

---

## Ключевые файлы

| Файл | Назначение |
|------|-----------|
| `manage.py` | CLI-входная точка сервера (typer), автогенерация self-signed SSL, запуск uvicorn |
| `src/app.py` | FastAPI-приложение: роуты, SSE, обработка капч, serve фронтенда |
| `src/utils.py` | Утилиты: хеширование капч, сборка изображений, SSE push, загрузка тестов |
| `captcha_solver.py` | Алгоритм решения капчи (discontinuity, SSIM, coherence, Sobel) |
| `yandex-browser-plugin/manifest.json` | Manifest V3, permissions, content script match |
| `yandex-browser-plugin/src/` | TypeScript-источники расширения (Vite-билд → `dist/`) |
| `yandex-browser-plugin/content.css` | Стили кнопки и модалки расширения |
| `frontend/src/App.jsx` | Главная страница: SSE + CaptchaGrid + StatusBar + LogViewer |
| `frontend/src/InjectorPage.jsx` | Страница `/injector`: конфиг, генерация скрипта, экспорт JSON |
| `frontend/src/main.css` | Стили фронтенда |
| `index.html` | Фоллбэк HTML-UI для капч (vanilla JS, SSE, без React) |
| `tests/test_solve_captcha.py` | Бенчмарк решателя на тестовых кейсах |
| `tests/test_cases/` | Данные для тестов: `valid/` (с ответом), `no_valid/` (без ответа) |

---

## Запуск и разработка

```bash
# Установка зависимостей
uv sync
make install-frontend

# Запуск сервера
make run           # обычный режим
make run-test      # с тестовыми капчами
make run-write     # labeling mode

# Разработка фронтенда
make dev-frontend  # Vite dev server

# Сборка фронтенда
make build-frontend

# Тесты / бенчмарк
make bench
```

---

## Важные детали

- **SSL**: сервер использует self-signed сертификат (`certs/cert.pem` + `certs/key.pem`), генерируется автоматически при первом запуске
- **CORS**: разрешены все origin (`*`), с credentials
- **Таймаут капчи**: 10 секунд (`CAPTCHA_TIMEOUT` в `src/utils.py`)
- **Дублирование UI**: существует 2 UI для решения капч — `index.html` (vanilla JS, фоллбэк) и React фронтенд (`frontend/`). React используется по умолчанию при наличии `frontend/dist/`
- **АПП (пропускные пункты)**: Забайкальск, Тагиркент-Казмаляр, Бугристое, Верхний Ларс, Чернышевское
- **Port-based messaging**: критично для MV3 — `chrome.runtime.sendMessage` с async callback ненадёжен, service worker suspend-ится. Всегда использовать `chrome.runtime.connect` + `port.onMessage`
