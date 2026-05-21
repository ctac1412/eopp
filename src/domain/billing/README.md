# Billing subsystem

Billing отвечает за деньги и распределение: тарифы, счета, расходы, выплаты и
пользователей, между которыми распределяются суммы.

## Поток

1. Админка создает/редактирует тарифы и usage prices.
2. Из usage log собираются invoices.
3. Expenses фиксируют затраты.
4. Payouts распределяют invoices и expenses по пользователям.
5. Статусы выплат блокируют небезопасные изменения на уровне DB-функций.

## Где менять

- HTTP adapter: `src/routes/admin.py`
- Business rules: `src/services/billing_service.py`
- Storage adapter: `src/repositories/billing_repo.py`
- Request schemas: `src/schemas/billing.py`
- SQLite primitives: `src/db/invoices.py`, `src/db/expenses.py`, `src/db/payouts.py`, `src/db/tariffs.py`, `src/db/users.py`
- Route coverage: `tests/test_admin_billing.py`

## Правило границы

Routes не должны считать суммы, выбирать invoices/expenses или напрямую менять
таблицы billing. Новые правила добавляются в service, SQL-операции остаются за
repository/DB-слоем.
