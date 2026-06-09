# EOPP Task TODO

Дата: 2026-05-22

## Статусы

| ID | Задача | Статус | Основные файлы | Заметки |
| --- | --- | --- | --- | --- |
| F1 | Счета: фильтры и сводная аналитика | done | `frontend/src/components/admin/InvoicesTab.jsx` | Добавлены поиск, фильтры, summary cards, улучшенная таблица. |
| F2 | Расходы: фильтры и сводная аналитика | done | `frontend/src/components/admin/ExpensesTab.jsx` | Добавлены поиск, фильтры, summary cards, распределение. |
| F3 | Выплаты: новый визуал, фильтры, аналитика | done | `frontend/src/components/admin/PayoutsTab.jsx` | Добавлены фильтры, сводки, участники, детали счетов/расходов. |
| C1 | Benchmark/captcha examples audit | done | `tests/test_solve_captcha.py`, `src/utils.py`, `data/captcha_examples/**` | Valid set now contains only examples with integer in-range `valid_index`; 41 `null` examples moved to `no_valid`. |
| C2 | Починить сохранение valid example без варианта | done | `src/utils.py`, routes captcha/admin | `valid_index` is accepted only when it is an integer inside `variantsCapture`; `0` remains a valid first-variant label. |
| C3 | Frontend labeling mode для капч | planned-only | frontend/admin + backend route TBD | По просьбе можно пока только спланировать. |
| E1 | UI расширения: обзор и улучшения | done | `extension/src/**` | Основной запуск стал компактнее: дата рядом с режимом, редкие настройки свернуты, добавлены чипы состояния. |
| E2 | Shared slots под feature toggle | done | `src/routes/slots.py`, `src/services/slots_group_service.py`, `extension/src/api/**`, `ConfigForm.tsx`, store/types | Реализовано через claim/wait/publish/fail, toggle выключен по умолчанию, fallback сохраняет старое поведение. |
| B1 | Тарифы по времени/окнам | pending | `src/db/tariffs.py`, `src/services/billing_service.py`, admin UI | Новый сценарий: бронь в 12 тарифицируется как перенос или дороже. |
| B2 | Открытый счет компании | pending | billing repo/service, invoices UI | Новые usage-записи копятся в открытом счете до выписки. |
| B3 | Предоплаченный пакет | pending | new db/service/routes/admin UI TBD | Баланс денег/логов, списание по тарифу, связь с логами. |
| T1 | Telegram bot commands | research | new integration TBD | Команды и уведомления без деплоя. |
| T2 | Scheduled daily report | research | scheduler/service TBD | Сводка в 12:03 по Москве. |

## Текущий порядок

1. Зафиксировать этот план и TODO.
2. Осмотреть финансовые вкладки и backend-контракты.
3. Реализовать F1-F3 как следующий frontend-блок.
4. Отдельно проверить C1-C2 и разложить captcha examples.
5. После этого переходить к B1/B2/B3, так как они меняют контракты.

## Вопросы к пользователю позже

- Для тарифа "бронь в 12" точное окно: только 12:00-12:59 или весь высокий период вокруг 12?
- Telegram: один общий чат администратора или уведомления по компаниям/клиентам тоже нужны?

## Блокеры

Пока нет.
## 2026-05-23 Execution Track (Codex)

- [x] Stage 1: Analyze current billing state (invoices/open/prepaid/manual).
- [x] Stage 2: Introduce company billing settings (`auto_invoice_reopen`).
- [x] Stage 3: Rework auto-invoice lifecycle (manual create, optional reopen, no implicit auto-create on confirm).
- [x] Stage 4: Restore manual invoice issuance from unlinked usage logs in Reports.
- [x] Stage 5: Add/restore prepaid admin UI and verify prepaid flow end-to-end.
- [x] Stage 6: Functional audit for admin + plugin UX gaps and dead/legacy code.
- [x] Stage 7: Ruff setup/normalization via `uv`.
- [x] Stage 8: DTO layer above billing repositories (invoices/usage/prepaid paths).
- [x] Stage 9: Start moving critical raw SQL paths to ORM/Core query layer.
