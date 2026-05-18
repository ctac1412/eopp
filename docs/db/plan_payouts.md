# План: редизайн `payouts`

## Цель
Нормализовать выплаты: N пользователей, связь 1:N с инвойсами и расходами.

## Новые таблицы

### `payouts` (упрощённая):
| Поле | Тип |
|------|-----|
| `id` | INTEGER PK |
| `name` | TEXT |
| `status` | TEXT |
| `created_at` | TEXT |
| `completed_at` | TEXT |

### `payout_shares`:
| Поле | Тип |
|------|-----|
| `id` | INTEGER PK |
| `payout_id` | INTEGER FK → payouts |
| `user_id` | INTEGER FK → users |
| `split_pct` | REAL — доля от чистой прибыли |
| `expenses_compensation` | REAL — компенсация расходов |
| `profit_share` | REAL — доля от чистой прибыли |
| `total` | REAL — итого к выплате |

### `payout_invoices`:
| Поле | Тип |
|------|-----|
| `id` | INTEGER PK |
| `payout_id` | INTEGER FK → payouts |
| `invoice_id` | INTEGER FK → invoices |
| `amount` | REAL — сколько списано от инвойса |

### `payout_expenses`:
| Поле | Тип |
|------|-----|
| `id` | INTEGER PK |
| `payout_id` | INTEGER FK → payouts |
| `expense_id` | INTEGER FK → expenses |
| `amount` | REAL — сколько компенсировано |

## Удалить из старой схемы
- `payout_invoices` (старую с 2 FK)
- `total_income`, `total_expenses`, `net_amount`
- `user_id1`, `split_pct1`, `amount_user1`, `expenses_user1`
- `user_id2`, `split_pct2`, `amount_user2`, `expenses_user2`

## Логика расчёта выплаты

1. `invoices_total = SUM(payout_invoices.amount)`
2. Получить linked expenses отсортированные по `created_at` (FIFO)
3. FIFO компенсация: для каждого expense забираем сколько можем из `invoices_total`
4. `net = invoices_total - SUM(compensated_expenses)`
5. Если `net > 0`: делить пропорционально `split_pct` → `profit_share`
6. `total = expenses_compensation + profit_share`

## Пример FIFO
```
invoices = 100
expense1 (user1) = 80, created_at раньше
expense2 (user2) = 40, created_at позже
```
→ expense1: компенсация 80, осталось 0
→ expense2: компенсация 20, долг 20

## Фронтенд — убрать вычисления
- `totalNet`, `totalExp1/2`, `totalProf1/2`, `totalAll1/2`
- `total1/2` в строках
- `user1_name`, `user2_name` — JOIN на бэке
- `invoice_count` — из COUNT(payout_invoices)