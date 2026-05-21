# Usage subsystem

Usage фиксирует коммерческое событие: клиент начал попытку бронирования,
успешно завершил ее или упал на конкретной стадии. Этот контекст нужен для
лимитов API-ключей, истории, счетов и последующей ручной диагностики.

## Поток

1. Extension вызывает `POST /register-usage` перед решением капчи.
2. Сервер проверяет API-ключ и наличие активного SSE-стрима для этого ключа.
3. Создается запись usage log с `reservation_id`, `captcha_id` и конфигом.
4. Extension вызывает `POST /confirm-usage` или `POST /fail-usage`.
5. Админка читает и редактирует журнал через `/usage-log` и admin endpoints.

## Где менять

- HTTP adapter: `src/routes/usage.py`
- Business rules: `src/services/usage_service.py`
- Storage adapter: `src/repositories/usage_repo.py`
- Request schemas: `src/schemas/usage.py`
- SQLite primitives: `src/db/usage_log.py`
- Route coverage: `tests/test_api_routes.py::TestUsage`

## Правило границы

Routes не должны знать детали SQLite и не должны напрямую менять файлы капч.
Новая логика usage сначала попадает в service, затем при необходимости в repo.
