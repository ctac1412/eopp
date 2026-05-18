# Итоговый план: редизайн БД

## Цель
Убрать вычисления с фронтенда, нормализовать связи, денормализировать данные для отображения.

---

## 1. `usage_log`

### Новые поля:
| Поле | Тип | Источник |
|------|-----|----------|
| `op_type` | TEXT | `config.mode` |
| `company` | TEXT | `reservationData.raw.userData.organizationName` |
| `fio` | TEXT | `reservationData.raw.userData.fio` |
| `vehicle_number` | TEXT | `vehicleData[].regNumber` (subTypeId=1, первый) |
| `is_test` | INTEGER | `runUpTo < 5` или UUID v0 / `unknown` / `""` |

### Изменить:
- `invoice_number` → удалить, оставить `invoice_id` (FK)

### Фронтенд убрать:
- `getOpType()`, `getCompany()`, `getFio()`, `getVehicleNumber()`, `isTestRecord()`
- `captcha_id_short`

---

## 2. `invoices`

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

### Связь:
- `usage_log.invoice_id` (INTEGER FK → invoices, nullable)

---

## 3. `payouts`

### Новая схема `payouts`:
| Поле | Тип |
|------|-----|
| `id` | INTEGER PK |
| `name` | TEXT |
| `status` | TEXT |
| `created_at` | TEXT |
| `completed_at` | TEXT |

### Новая `payout_shares`:
| Поле | Тип |
|------|-----|
| `id` | INTEGER PK |
| `payout_id` | INTEGER FK → payouts |
| `user_id` | INTEGER FK → users |
| `split_pct` | REAL |
| `expenses_compensation` | REAL |
| `profit_share` | REAL |
| `total` | REAL |

### Новая `payout_invoices`:
| Поле | Тип |
|------|-----|
| `id` | INTEGER PK |
| `payout_id` | INTEGER FK → payouts |
| `invoice_id` | INTEGER FK → invoices |
| `amount` | REAL |

### Новая `payout_expenses`:
| Поле | Тип |
|------|-----|
| `id` | INTEGER PK |
| `payout_id` | INTEGER FK → payouts |
| `expense_id` | INTEGER FK → expenses |
| `amount` | REAL |

### Удалить:
- Старую `payout_invoices`
- `total_income`, `total_expenses`, `net_amount`
- `user_id1`, `split_pct1`, `amount_user1`, `expenses_user1`
- `user_id2`, `split_pct2`, `amount_user2`, `expenses_user2`

### Логика расчёта:
1. `invoices_total = SUM(payout_invoices.amount)`
2. Expenses FIFO по `created_at`
3. Компенсация расходов из `invoices_total`
4. `net = invoices_total - SUM(compensated_expenses)`
5. Если `net > 0`: делить пропорционально `split_pct` → `profit_share`
6. `total = expenses_compensation + profit_share`

---

## 4. `expenses` — без изменений
Уже нормализована с `user_id` FK.

## 5. `users` — без изменений
Простая таблица, JOIN на бэке при запросах.

---

## Порядок миграции

1. `usage_log` — добавить поля, убрать `invoice_number`
2. `invoices` — новая схема
3. `payouts` — удалить старые поля, создать новые таблицы
4. Фронтенд — убрать вычисления