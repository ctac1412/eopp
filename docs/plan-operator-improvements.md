# План доработок: улучшение UX оператора и мастера

## 1. Настройка отображения иконок (свои / свои+чужие)

**Проблема:** Оператор всегда видит свои иконки → потом чужие (fallthrough). Нужна опция «только свои» — тогда после своих иконок оператор просто ждёт.

**Решение:**
- Добавить поле `icon_display_mode` в таблицу `operators`: `TEXT DEFAULT 'own_then_foreign'` (enum: `own_then_foreign`, `own_only`)
- Добавить колонку через Alembic / сырой SQL при старте
- В `distribution.py::_find_next_unanswered()`: если `mode == "own_only"` и свои кончились — сразу возвращать `{complete: true, waiting: true}`, не идти в чужие
- Админский эндпоинт: `PUT /admin/operators/{id}` body `{icon_display_mode: "own_only"|"own_then_foreign"}`
- На фронте в админке: выпадающий список при редактировании оператора

**Файлы:** `entities/operator.py`, `repositories/operator_repo.py`, `routes/operator.py`, `routes/distribution.py`, `frontend/src/pages/AdminPage.jsx`

---

## 2. Доступные мастера для оператора (фильтр по API ключам)

**Проблема:** Оператор видит все активные API ключи при выборе мастера. Нужно ограничить список.

**Решение:**
- Добавить поле `allowed_master_keys` в `operators`: `TEXT DEFAULT NULL` (JSON-массив id ключей, NULL = все)
- В `GET /operators/{uuid}/masters`: если поле заполнено — фильтровать `list_keys()` по `id IN (allowed_master_keys)`
- Админский эндпоинт: `PUT /admin/operators/{id}` body `{allowed_master_keys: [1, 2, 3]}` или `null`
- На фронте: в админке multiselect доступных ключей

**Файлы:** `entities/operator.py`, `repositories/operator_repo.py`, `routes/operator.py`, `frontend/src/pages/AdminPage.jsx`

---

## 3. Статус активного стрима + оффлайн-операторы

**Проблема:** Оператор числится в `operator_master_links` даже после дисконнекта SSE → попадает в распределение, но не может отвечать.

**Решение (вариант — рвать связь при дисконнекте):**
- В `operator_sse()` при дисконнекте (finally/except): вызвать `unlink_operator()` для всех активных мастеров этого оператора
- Но тогда оператор теряет привязку и вынужден заново выбирать мастера — неудобно

**Решение (вариант — soft online флаг):**
- Добавить поле `online` в таблицу `operators`: `BOOLEAN DEFAULT 0`
- При SSE connect → `UPDATE operators SET online=1`
- При SSE disconnect → `UPDATE operators SET online=0`
- В `get_subscribed_operators()`: фильтровать `WHERE active=1 AND online=1`
- В `distribution.py`: не включать оффлайн-операторов в `num_operators`
- На фронте (OperatorPage): показывать статус "Онлайн" / "Оффлайн"
- На фронте (главная): показывать онлайн-статус операторов

**Выбрать вариант 2 (soft online)** — меньше неудобств для пользователя.

**Файлы:** `entities/operator.py`, `repositories/operator_repo.py`, `routes/operator.py`, `routes/distribution.py`, `routes/captcha.py`, `frontend/src/pages/OperatorPage.jsx`

---

## 4. Чат между мастером и операторами

**Проблема:** Мастер и операторы не могут общаться текстом во время решения. Нужен минимальный чат.

**Решение (минимальное, in-memory):**
- Новый SSE-тип события: `chat_message`
- Эндпоинт: `POST /chat/send` body `{sender_role: "master"|"operator", sender_id: int, message: str}`
- Сервер определяет всех получателей по `operator_master_links` + `api_key_id` мастера
- `push_sse({type: "chat_message", ...})` всем получателям
- Без сохранения в БД (только доставка in-flight), без истории
- На фронте: `<ChatBox>` компонент — поле ввода + список сообщений (последние 50 в памяти)

**Файлы:** `routes/chat.py` (новый), `models.py` (Pydantic модель), `frontend/src/components/ChatBox.jsx` (новый)

---

## 5. Админское редактирование связки оператора

**Проблема:** Админ не может перепривязать оператора к другому мастеру без участия самого оператора.

**Решение:**
- `PUT /admin/operators/{id}/link` body `{master_key_id: int}` — админ меняет связь
- Проверка: `master_key_id` должен быть в `allowed_master_keys` оператора (если заданы)
- Старая связь деактивируется, новая создаётся
- SSE push оператору: `{type: "master_reassigned", master_key_id: ...}` — форсирует переподключение
- На фронте в админке: кнопка «Перепривязать» у каждого оператора

**Файлы:** `routes/operator.py`, `repositories/operator_repo.py`, `frontend/src/pages/AdminPage.jsx`

---

## 6. Флаг «внешний клиент» в API ключах

**Проблема:** Нужно различать внутренних операторов/мастеров и внешних клиентов.

**Решение:**
- Добавить поле `is_external` в `api_keys`: `BOOLEAN DEFAULT 0`
- В `GET /operators/{uuid}/masters`: исключать ключи с `is_external=1` (внешние клиенты не должны быть мастерами)
- В админке: чекбокс при создании/редактировании ключа
- Админские эндпоинты `POST/PUT /api-keys` принимают `is_external`

**Файлы:** `entities/api_key.py`, `repositories/api_key_repo.py`, `routes/api_keys.py`, `routes/operator.py`, `frontend/src/pages/AdminPage.jsx`

---

## 7. Время с секундами на экране оператора и капч

**Проблема:** На экране оператора нет отображения текущего времени с секундами (как в плагине расширения).

**Решение:**
- Компонент `<Clock>` в `OperatorPage.jsx` и на главной странице (режим решения капч)
- Обновление каждую секунду через `setInterval`
- Формат: `HH:MM:SS`
- Также показывать `duration_ms` после ответа (сколько времени занял клик)

**Файлы:** `frontend/src/pages/OperatorPage.jsx`, `frontend/src/App.jsx`

---

## 8. Нотификация операторов о запланированных запусках

**Проблема:** Плагин создаёт запланированные бронирования. Оператор сидит в вакууме — не знает когда примерно начнётся работа.

**Решение (минимальное, in-memory):**
- Новый эндпоинт: `POST /scheduled-event` body `{api_key_id, label, scheduled_at_iso, description}` — вызывает расширение/мастер когда создана плановая бронь
- Сервер хранит в `dict[api_key_id, list[ScheduledEvent]]` (in-memory, сбрасывается при рестарте)
- При подключении оператора к мастеру — отправлять список грядущих событий в handshake: `{type: "connected", ..., scheduled_events: [...]}`
- При добавлении нового события — `push_sse` всем подписанным операторам: `{type: "scheduled_event", ...}`
- На фронте: таймлайн предстоящих запусков (сколько осталось времени)
- TTL событий: автоудаление через 30 минут после `scheduled_at`

**Файлы:** `routes/scheduled.py` (новый), `models.py`, `routes/operator.py` (handshake), `frontend/src/pages/OperatorPage.jsx`

---

## 9. In-memory приоритет, жертвовать консистентностью

**Принцип:** Всё что можно держать в памяти сервера — держим в памяти. После рестарта теряем, и это ок.

**Что уже в памяти:**
- `distribution_states` — ✅
- `pending` (captcha queue) — ✅
- `sse_queues` — ✅
- `_pending_callbacks` (auto-solver) — ✅

**Что нужно перенести в память (из нового):**
- `chat_messages` — только доставка, не храним
- `scheduled_events` — только доставка, не храним

**Что остаётся в БД:**
- `operators`, `operator_master_links` — нужна долгосрочная память
- `api_keys` — нужно для валидации
- `distribution_answers` — нужно для аудита
- `usage_log` — нужно для биллинга

---

## Порядок реализации

| # | Задача | Сложность | Зависит от |
|---|--------|-----------|------------|
| 6 | Флаг внешнего клиента | Низкая | — |
| 1 | Настройка иконок | Средняя | — |
| 2 | Доступные мастера | Средняя | 6 |
| 5 | Админское редактирование связки | Средняя | 2 |
| 3 | Статус стрима + оффлайн | Средняя | — |
| 7 | Часы с секундами | Низкая | — |
| 8 | Нотификация о запусках | Средняя | — |
| 4 | Чат | Средняя | 3 |
| 9 | In-memory приоритет | Принцип | все |

Можно параллелить: {6, 7} → {1, 2, 3} → {4, 5, 8}
