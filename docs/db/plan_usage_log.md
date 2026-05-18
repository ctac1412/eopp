# План: денормализация `usage_log`

## Цель
Убрать вычисляемые поля с фронтенда — парсить `config_json` при создании записи.

## Новые поля

| Поле | Тип | Источник |
|------|-----|----------|
| `op_type` | TEXT | `config.mode` (`'create'` / `'reschedule'`) |
| `company` | TEXT | `reservationData.raw.userData.organizationName` |
| `fio` | TEXT | `reservationData.raw.userData.fio` |
| `vehicle_number` | TEXT | `vehicleData[].regNumber` (subTypeId=1, первый) |
| `is_test` | INTEGER | `runUpTo < 5` или UUID v0 / `unknown` / `""` |

## Изменения

### 1. `src/db/init.py`
Миграция:
```python
_add_column(conn, "usage_log", "op_type", "TEXT")
_add_column(conn, "usage_log", "company", "TEXT")
_add_column(conn, "usage_log", "fio", "TEXT")
_add_column(conn, "usage_log", "vehicle_number", "TEXT")
_add_column(conn, "usage_log", "is_test", "INTEGER DEFAULT 0")
```

### 2. `src/db/usage_log.py`
- `_extract_fields_from_config(config_json)` — парсит company, fio, vehicle_number, op_type
- `_calc_is_test(reservation_id, config_json)` — логика is_test
- `log_usage()` — при вставке парсить config_json и писать в новые поля
- `list_usages()`, `get_usage_log_entry()` — возвращать новые поля

### 3. Фронтенд — убрать вычисления
- `getOpType()` → `record.op_type`
- `getCompany()` / `getCompanyFull()` → `record.company`
- `getFio()` / `getFioFull()` → `record.fio`
- `getVehicleNumber()` → `record.vehicle_number`
- `isTestRecord()` → `record.is_test === 1`
- `captcha_id_short` → убрать