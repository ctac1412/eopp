# EOPP Task TODO

Дата: 2026-05-22

## Статусы

| ID | Задача | Статус | Основные файлы | Заметки |
| --- | --- | --- | --- | --- |
| F1 | Счета: фильтры и сводная аналитика | pending | `frontend/src/components/admin/InvoicesTab.jsx`, `src/routes/admin.py`, `src/services/billing_service.py` | Делать как журнал: поиск, статус, период, summary cards. |
| F2 | Расходы: фильтры и сводная аналитика | pending | `frontend/src/components/admin/ExpensesTab.jsx`, `src/db/expenses.py` | Если API уже отдает все поля, начать с frontend. |
| F3 | Выплаты: новый визуал, фильтры, аналитика | pending | `frontend/src/components/admin/PayoutsTab.jsx`, `frontend/src/components/admin/PayoutModal.jsx`, `src/db/payouts.py` | Сначала изучить доступные поля. |
| C1 | Benchmark/captcha examples audit | pending | `tests/test_solve_captcha.py`, `src/utils.py`, `data/captcha_examples/**` | Проверить JSON, `valid_index`, диапазоны, переместить ошибочные. |
| C2 | Починить сохранение valid example без варианта | pending | `src/utils.py`, routes captcha/admin | Найти, почему пример может стать valid без выбранного ответа. |
| C3 | Frontend labeling mode для капч | planned-only | frontend/admin + backend route TBD | По просьбе можно пока только спланировать. |
| E1 | UI расширения: обзор и улучшения | pending | `yandex-browser-plugin/src/**` | Предложить/сделать компактнее, скрыть дефолтные настройки. |
| E2 | Shared slots под feature toggle | done | `src/routes/slots.py`, `src/services/slots_group_service.py`, `yandex-browser-plugin/src/api/**`, `ConfigForm.tsx`, store/types | Реализовано через claim/wait/publish/fail, toggle выключен по умолчанию, fallback сохраняет старое поведение. |
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

- Нужно ли считать `valid_index: 0` легитимным ответом, если первый вариант действительно правильный, или в старых файлах это всегда признак "не размечено"?
- Для тарифа "бронь в 12" точное окно: только 12:00-12:59 или весь высокий период вокруг 12?
- Telegram: один общий чат администратора или уведомления по компаниям/клиентам тоже нужны?

## Блокеры

Пока нет.
