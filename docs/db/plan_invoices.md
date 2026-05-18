# План: редизайн `invoices` + связь с `usage_log`

## Цель
Убрать вычисления с фронта, 1:N связь вместо JSON-массива.

## Изменения в `invoices`

### Новая схема:
| Поле | Тип |
|------|-----|
| `id` | INTEGER PK |
| `invoice_number` | TEXT |
| `comment` | TEXT |
| `percent_rate` | REAL |
| `tax_rate` | REAL |
| `debt_amount` | INTEGER |
| `percent_amount` | INTEGER |
| `tax_amount` | INTEGER |
| `total_amount` | INTEGER |
| `pdf_path` | TEXT |
| `paid` | INTEGER |
| `created_at` | TEXT |

### Удалить:
- `api_key_id`
- `usage_log_ids` (JSON)
- `withdrawal_id`

## Изменения в `usage_log`

### Новое поле:
- `invoice_id` INTEGER FK → invoices (nullable)

### Удалить:
- `invoice_number` TEXT → убрать (FK достаточно)

## Логика

1. При создании инвойса:
   - INSERT в `invoices`
   - UPDATE `usage_log` SET `invoice_id` = new_invoice_id WHERE id IN (...)

2. При удалении инвойса:
   - UPDATE `usage_log` SET `invoice_id` = NULL WHERE `invoice_id` = ?
   - DELETE из `invoices`

3. При получении связанных логов:
   - `SELECT * FROM usage_log WHERE invoice_id = ?`

4. Для count логов в инвойсе:
   - `SELECT COUNT(*) FROM usage_log WHERE invoice_id = ?`

5. Для PDF — label и реквизиты передавать в запросе при генерации