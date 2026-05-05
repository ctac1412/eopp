# Изменения без фронтенда

## 1. База данных (`src/api_keys.py`)

### Новые таблицы:

**tariffs** — тарифы для API-ключей
- `id` INTEGER PRIMARY KEY
- `api_key_id` INTEGER UNIQUE
- `price_create` INTEGER
- `price_reschedule` INTEGER
- `created_at` TEXT
- `updated_at` TEXT

**withdrawals** — получатели выводов
- `id` INTEGER PRIMARY KEY
- `name` TEXT
- `percent` INTEGER
- `requisites` TEXT
- `created_at` TEXT
- `updated_at` TEXT

### Новые колонки в существующих таблицах:
- `api_keys.comment` — текстовый комментарий
- `usage_log.price` — стоимость операции (INTEGER)
- `usage_log.paid` — флаг оплаты (INTEGER)

---

## 2. Pydantic-модели (`src/models.py`)

```python
class UpdateUsageLogBody(BaseModel):
    price: int | None = None
    paid: bool | None = None

class UpdateApiKeyBody(BaseModel):
    # ... existing
    comment: str | None = None
```

---

## 3. Функции API-ключей (`src/api_keys.py`)

### Тарифы:
| Функция | Параметры | Возвращает |
|---------|-----------|------------|
| `get_tariff` | `api_key_id: int` | `dict \| None` |
| `create_tariff` | `api_key_id, price_create, price_reschedule` | `dict` |
| `update_tariff` | `api_key_id, price_create, price_reschedule` | `dict \| None` |

### Выводы:
| Функция | Параметры | Возвращает |
|---------|-----------|------------|
| `list_withdrawals` | — | `list[dict]` |
| `get_withdrawal` | `withdrawal_id: int` | `dict \| None` |
| `create_withdrawal` | `name, percent, requisites` | `dict` |
| `update_withdrawal` | `withdrawal_id, name, percent, requisites` | `dict \| None` |
| `delete_withdrawal` | `withdrawal_id: int` | `bool` |

### Логи:
| Функция | Параметры | Возвращает |
|---------|-----------|------------|
| `update_usage_log` | `usage_log_id, price, paid` | `dict \| None` |

### Изменения в существующих функциях:
- `update_key()` — добавлен параметр `comment: str = None`
- `confirm_usage()` — автоматически считает цену из тарифа по `config_json.mode` (create/reschedule)

---

## 4. Admin-роуты (`src/routes/admin.py`)

| Метод | Путь | Параметры | Описание |
|-------|------|-----------|----------|
| `GET` | `/admin/tariffs/{api_key_id}` | query: — | получить тариф по апи ключу |
| `PUT` | `/admin/tariffs/{api_key_id}` | `price_create`, `price_reschedule` | создать/обновить тариф по апи ключу |
| `DELETE` | `/admin/tariffs/{api_key_id}` | — | удалить тариф по апи ключу|
| `GET` | `/admin/withdrawals` | — | список выводов |
| `POST` | `/admin/withdrawals` | `name`, `percent`, `requisites` | создать вывод |
| `PUT` | `/admin/withdrawals/{id}` | `name`, `percent`, `requisites` | обновить вывод |
| `DELETE` | `/admin/withdrawals/{id}` | — | удалить вывод |
| `PATCH` | `/admin/api-keys/{id}` | `comment` | обновить ключ, конкретно коментарий |
| `PATCH` | `/admin/usage-log/{id}` | `price`, `paid` | обновить лог |
| `POST` | `/admin/generate-invoice` | `api_key_id`, `usage_log_ids`, `withdrawal_id` | сгенерировать PDF-счёт |

---


## 7. Тесты

### `tests/test_api_routes.py`
- Добавлен fixture `isolate_db` — изоляция БД через tempfile

### `tests/test_database.py` (новый, untracked)
- Полный набор тестов БД:
  - `TestAPIKeysDB` — CRUD операции с ключами
  - `TestValidateKey` — валидация ключей
  - `TestUsageLog` — логирование использования
  - `TestAdminKey` — админский ключ
  - `TestEdgeCases` — граничные случаи