# Distributed Captcha Solving — Полный план

## Концепция

Распределённое решение icon-click капч (type 1) между мастером и операторами-помощниками.
Иконок всегда 5. Операторы работают с разных концов последовательности к середине.

### Карта распределения (константы)

```python
DISTRIBUTION = {
    1: {"0": [0, 1, 2, 3, 4]},          # 1 оператор = мастер всё сам
    2: {"0": [0, 1, 2], "1": [4, 3]},    # мастер 3 иконки, слейв 2 (с концов к середине)
}
```

```
Позиции:  [0]  [1]  [2]  [3]  [4]
2 op:
  op0:     →    →    →                 (с начала, 3 иконки)
  op1:                    ←    ←       (с конца в обратном порядке, 2 иконки)
```

### Принцип завершения

Когда 5/5 ответов собрано → никто больше не кликает.
Автоматический solve → event.set() → handle_captcha разблокирован → ответ extension'у.
SSE `captcha_solved` всем подписчикам.

---

## API

| Метод | Путь | Назначение |
|-------|------|-----------|
| `POST` | `/register-usage` | + `parallel_operators: int` (0/1/2) |
| `POST` | `/operator/subscribe` | `{operator_key, master_key}` — подписка |
| `DELETE` | `/operator/unsubscribe` | `{operator_key, master_key}` — отписка |
| `GET` | `/operator/subscriptions?operator_key=X` | Список подписок |
| `POST` | `/distribution/answer` | `{captcha_id, operator_id, icon_position, x, y}` → `{icon_position, image, ...}` или `{complete: true}` |

### POST /distribution/answer

**Запрос:**
```json
{
  "captcha_id": "abc123",
  "operator_id": 1,
  "icon_position": 4,
  "x": 230,
  "y": 450
}
```

**Ответ (ещё не всё):**
```json
{
  "icon_position": 3,
  "image": "base64...",
  "total_icons": 5,
  "solved_count": 3,
  "is_outsourced": false
}
```

**Ответ (всё решено):**
```json
{
  "complete": true,
  "coordinates": [
    {"x": 100, "y": 200},
    {"x": 300, "y": 150},
    {"x": 500, "y": 400},
    {"x": 200, "y": 350},
    {"x": 400, "y": 100}
  ]
}
```

---

## БД

### Новые таблицы

```sql
CREATE TABLE operator_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_key_id INTEGER NOT NULL,
  master_key_id INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE captcha_distribution (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usage_log_id INTEGER NOT NULL UNIQUE,
  captcha_id TEXT NOT NULL,
  total_icons INTEGER NOT NULL DEFAULT 5,
  num_operators INTEGER NOT NULL DEFAULT 2,
  assignments TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE distribution_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  distribution_id INTEGER NOT NULL,
  captcha_id TEXT NOT NULL,
  operator_id INTEGER NOT NULL,
  icon_position INTEGER NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
```

### Новые поля

- `RegisterUsageBody.parallel_operators: int = 0`
- `ApiKey.is_distributed_operator: bool = False`

---

## State Machine (в памяти)

```python
distribution_states = {
    captcha_id: {
        # Блокировка handle_captcha
        "event": threading.Event(),
        "usage_log_id": int,
        "api_key_id": int,
        "total_icons": 5,

        # Операторы
        "operators": {
            0: {"assigned": [0, 1, 2], "idx": 0},
            1: {"assigned": [4, 3], "idx": 0},
        },

        # Собранные ответы: {pos: {x, y, operator_id}}
        "all_answers": {},

        # Предвычисленные crop-ы (один раз при solve-captcha)
        "icons_cache": {
            0: {"image": base64, "icon": base64},
            1: {"image": base64, "icon": base64},
            ...
        },

        # Исходные данные капчи для финального /solve
        "captcha_data": {...},
    }
}
```

---

## Поток событий

### 1. Регистрация + создание distribution

```
POST /register-usage {api_key, reservation_id, parallel_operators: 2}
  → usage_log_repo.create_usage()
  → если parallel_operators > 1:
      → captcha_distribution: INSERT (usage_log_id, total_icons=5, num_operators, assignments=JSON)
```

### 2. Приход капчи

```
POST /solve-captcha {api_key, ..., usage_log_id}
  → проверить: есть ли captcha_distribution для usage_log_id?
  → если ДА:
      → декодировать главное изображение + полоску иконок
      → для каждой из 5 иконок: crop вокруг координат → сохранить в icons_cache
      → создать distribution_states[captcha_id]
      → SSE new_captcha мастеру:
          {distribution: {operator_id:0, assigned:[0,1,2]}, first_icon: icons_cache[0]}
      → SSE new_captcha слейвам (через operator_subscriptions):
          {distribution: {operator_id:1, assigned:[4,3]}, first_icon: icons_cache[4]}
      → event.wait(timeout) (как обычно)
  → если НЕТ:
      → обычный flow
```

### 3. Оператор отвечает

```
POST /distribution/answer {captcha_id, operator_id, icon_position, x, y}
  → найти state = distribution_states[captcha_id]
  → сохранить в distribution_answers (БД)
  → state["all_answers"][icon_position] = {x, y, operator_id}
  → отправить SSE distribution_progress (debug)

  → если len(all_answers) == 5:
      → coordinates = [all_answers[i] for i in range(5)]
      → entry = pending[captcha_id]
      → entry["result"] = {variantIndex: 0, variantTiles: coordinates, captcha_type: 1}
      → entry["event"].set()                   ← разблокировать handle_captcha
      → push_sse("captcha_solved", ...)         ← оповестить всех
      → return {complete: true, coordinates}

  → иначе:
      → next = найти следующую нерешённую позицию
      → return {icon_position: next, image: icons_cache[next]}
```

### 4. Поиск следующей нерешённой позиции

```python
def find_next_unanswered(state, operator_id):
    op = state["operators"][operator_id]
    assigned = op["assigned"]

    # Сначала идём по своим
    while op["idx"] < len(assigned):
        pos = assigned[op["idx"]]
        op["idx"] += 1
        if pos not in state["all_answers"]:
            return pos

    # Свои кончились — берём любую нерешённую
    for pos in range(state["total_icons"]):
        if pos not in state["all_answers"]:
            return pos

    return None  # всё решено (не должен дойти)
```

---

## SSE события

| Событие | Кому | Данные |
|---------|------|--------|
| `new_captcha` (+ distribution) | Мастеру + операторам | `{distribution: {operator_id, assigned}, first_icon: {position, image}}` |
| `distribution_progress` | Debug-странице | `{captcha_id, operator_id, icon_position, x, y}` |
| `captcha_solved` | Всем | `{captcha_id, solved_by_super: false}` |

---

## Crop-логика

При появлении капчи (один раз):

```python
from PIL import Image
import io, base64

def crop_icons_for_distribution(main_b64: str, icons_b64: str, coordinates: list[dict]) -> dict:
    """Вычисляет crop для каждой из 5 иконок один раз."""
    main = _decode_b64_image(main_b64)
    icons = _decode_b64_image(icons_b64)
    W, H = main.size
    PAD = 60

    cache = {}
    for pos, coord in enumerate(coordinates):
        x, y = coord["x"], coord["y"]
        left = max(0, x - PAD)
        top = max(0, y - PAD)
        right = min(W, x + PAD)
        bottom = min(H, y + PAD)
        cropped = main.crop((left, top, right, bottom))

        buf = io.BytesIO()
        cropped.save(buf, format="PNG")
        cache[pos] = {
            "image": base64.b64encode(buf.getvalue()).decode(),
            "crop_box": (left, top, right, bottom),
        }
    return cache
```

---

## Фронтенд

### Мастер (поштучный режим)

```
┌── loop (SSE или pull) ───────────────────┐
│                                            │
│  1. Первая иконка приходит в SSE new_captcha │
│     с полем first_icon                     │
│  2. Показать crop одной иконки             │
│  3. Ждать клик → координаты пересчитать    │
│     относительно оригинального изображения │
│  4. POST /distribution/answer             │
│     ├─ {complete: true} → «Решено», выход  │
│     └─ {icon_position, image} → шаг 2     │
│                                            │
│  Параллельно: SSE captcha_solved → выход   │
└────────────────────────────────────────────┘
```

Состояние:
- `currentIcon`: текущая иконка (image + position)
- `solvedCount`: сколько всего решено
- `isOutsourced`: подсветка «на аутсорсе»
- Индикатор: `●●○○○` (5 точек, решённые закрашены)

### Слейв (упрощённый интерфейс)

Аналогично мастеру, но:
- Получает свои иконки через SSE (подписан как super_kiosk на мастер-ключ)
- Интерфейс максимально простой: картинка + клик
- Заголовок: «Помощь: <имя мастера>»

### Debug-страница (/debug/distribution)

- SSE подписка на `distribution_progress`
- Таблица: строки = операторы
- Колонки: лог действий | превью иконок
- Без кликов, только наблюдение
- При `captcha_solved`: зелёная подсветка всей таблицы

---

## Файлы

| Файл | Что |
|------|-----|
| `alembic/versions/xxx_distribution.py` | Миграция БД |
| `src/entities/distribution.py` | Модели SQLAlchemy |
| `src/entities/operator_subscription.py` | Модель подписки |
| `src/constants.py` | DISTRIBUTION константы |
| `src/models.py` | + поля в RegisterUsageBody, новые тела запросов |
| `src/services/distribution_service.py` | Основная логика распределения |
| `src/routes/distribution.py` | /distribution/answer, /operator/* |
| `src/routes/captcha.py` | Модификация handle_captcha для distribution |
| `src/routes/usage.py` | Модификация register-usage |
| `src/captcha_solver_engine/images.py` | crop_icons_for_distribution |
| `src/sse/manager.py` | + distribution_progress в push |
| `frontend/src/components/IconClickCaptcha.jsx` | Поштучный режим |
| `frontend/src/components/DistributedCaptcha.jsx` | Интерфейс слейва |
| `frontend/src/pages/DebugDistribution.jsx` | Debug-страница |

---

## Порядок реализации

1. БД миграция + модели
2. Константы + RegisterUsageBody
3. Подписки операторов (CRUD)
4. Distribution service + register-usage
5. solve-captcha → crop кеш + SSE
6. POST /distribution/answer + state machine
7. Crop-логика
8. Фронтенд мастера
9. Фронтенд слейва
10. Debug-страница
