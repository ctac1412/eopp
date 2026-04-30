# Phase 4 — Улучшение API keys

## 1. Детальный лог использований

### Backend — новая таблица `usage_log`
- Создать таблицу `usage_log` в `src/api_keys.py`:
  ```
  id INTEGER PRIMARY KEY AUTOINCREMENT
  api_key_id INTEGER FK → api_keys.id
  reservation_id TEXT NOT NULL
  captcha_id TEXT NOT NULL    -- хеш капчи из solve-captcha
  status TEXT NOT NULL        -- 'pending' | 'confirmed' | 'failed'
  error_message TEXT          -- текст ошибки (если status='failed'): 429, 400, валидация, и т.д.
  error_stage TEXT            -- на каком этапе упало: 'stage3', 'stage4', 'stage5', 'other'
  created_at TEXT NOT NULL    -- время запроса капчи
  confirmed_at TEXT           -- время подтверждения (stage 5 OK)
  ```
- Новая функция `log_usage(api_key: str, reservation_id: str, captcha_id: str) -> int` — возвращает `usage_log.id`
- Новая функция `confirm_usage(usage_log_id: int) -> bool` — ставит status='confirmed', confirmed_at=now, инкрементит `api_keys.usage_count`
- Новая функция `fail_usage(usage_log_id: int, error_message: str, error_stage: str) -> bool` — ставит status='failed', сохраняет ошибку (без инкремента)
- Новая функция `list_usages(api_key_id: int | None) -> list[dict]` — все записи или по конкретному ключу

### Backend — изменение `/solve-captcha`
- Убрать `increment_usage(api_key)` из текущего места (строка 219 app.py)
- После валидации ключа вызвать `log_usage(api_key, reservationId из payload, captcha_id)` → получить `usage_log_id`
- Вернуть в ответе JSON: `"usage_log_id": <int>` (если api_key был)
- Если api_key отсутствует → вернуть 400 `"error": "api_key is required"`

### Backend — новые эндпоинты
- `POST /confirm-usage` body: `{ "usage_log_id": int, "api_key": str }` — подтверждает использование
- `POST /fail-usage` body: `{ "usage_log_id": int, "api_key": str, "error_message": str, "error_stage": str }` — помечает как проваленное + сохраняет ошибку
- `GET /usage-log?api_key_id=N` — список записей usage_log (все или по ключу)
- `GET /api-key-status?key=...` — лёгкая проверка ключа: `{ "valid": bool, "remaining": int|null, "label": str }`

### Plugin — сохранить usage_log_id и report результат
- В `stages.ts`, `solveCaptcha` — извлечь `usage_log_id` из ответа и сохранить в store
- В `pipeline.ts` — обернуть весь цикл slotRetries в try/catch:
  - Успех stage 5 → `/confirm-usage`
  - **Любая ошибка** (stage 3, 4, 5, сетевая, таймаут, 429, 400, валидация) → `/fail-usage` с `error_message` + `error_stage`
- Новый метод в `background.ts`: `confirmUsage(usageLogId, apiKey)` и `failUsage(usageLogId, apiKey, errorMessage, errorStage)`
- Background.js — новый обработчик для `confirmUsage` и `failUsage`

### Admin — таблица использований
- Под каждой строкой ключа — раскрывающаяся секция "История" с таблицей использований
- Колонки: Время, Reservation ID, Captcha ID (укороченный), Статус (pending/confirmed/failed), Этап ошибки, Текст ошибки

---

## 2. Защита /admin

### Решение: ADMIN_TOKEN
- Переменная окружения `ADMIN_TOKEN` (или файл `data/admin_token`)
- На фронте: при переходе на `/admin` проверить `localStorage.getItem('admin_token')`
  - Если нет — форма ввода → POST `/admin/auth` → если OK, сохранить токен
  - Если есть — отправлять как header `X-Admin-Token` на все запросы `/api-keys/*`, `/usage-log`
- Новый эндпоинт `POST /admin/auth` body: `{ "token": "..." }` → `{ "ok": true }` или 401
- Middleware: на все `/api-keys/*`, `/usage-log`, `/confirm-usage`, `/fail-usage` проверять header `X-Admin-Token`

---

## 3. API ключ обязательный + localStorage + проверка остатка

### Plugin — localStorage
- При открытии модалки (`index.tsx`): прочитать `localStorage.getItem('injector_api_key')`, подставить в `config.apiKey`
- При изменении поля "API ключ" в форме — сохранять в localStorage
- Поле "API ключ" — обязательное (валидация при запуске)

### Plugin — проверка остатка при открытии
- При открытии модалки (после подстановки ключа): fetch `/api-key-status?key=...` через background
- Результат показать в модалке: бейдж "Осталось: N" / "Без лимита" / "Ключ недействителен"
- Новый компонент `ApiKeyStatus` в хедере модалки

### Backend
- `GET /api-key-status?key=...` — лёгкая проверка без блокировки
- `api_key` обязательный в `/solve-captcha` — если нет → 400

---

## 4. Подсчёт использования по stage 5

### Ключевые изменения:
- `/solve-captcha` больше НЕ инкрементирует usage_count
- Создаётся запись в `usage_log` со статусом `pending`
- После stage 5 OK → плагин шлёт `/confirm-usage` → status='confirmed', usage_count++
- Если pipeline упал до stage 5 → плагин шлёт `/fail-usage` → status='failed', usage_count не меняется
- `validate_key` проверяет `usage_count` (только confirmed записи)

### Хранение usage_log_id
- Store плагина: новое поле `usageLogId: number | null`
- Устанавливается в `solveCaptcha` из ответа сервера
- Считывается в `runFromStage2` после stage 5

---

## Порядок реализации

1. **Backend — БД + функции** — новая таблица `usage_log`, функции CRUD
2. **Backend — эндпоинты** — `/confirm-usage`, `/fail-usage`, `/usage-log`, `/api-key-status`, `/admin/auth`
3. **Backend — изменение `/solve-captcha`** — обязательный api_key, log_usage, return usage_log_id, убрать increment_usage
4. **Backend — admin token** — middleware на защищённые роуты
5. **Plugin — store + types** — новые поля в store
6. **Plugin — background.ts + background.js** — confirmUsage, failUsage, apiKeyStatus
7. **Plugin — pipeline.ts + stages.ts** — сохранить usage_log_id, подтвердить/отменить после stage 5
8. **Plugin — ConfigForm + Modal** — localStorage, ApiKeyStatus компонент, обязательное поле
9. **Plugin — index.tsx** — подстановка ключа из localStorage при открытии
10. **Frontend — AdminPage** — история использований, auth форма для /admin
11. **Билд + тест**
