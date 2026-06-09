# Captcha subsystem

Captcha subsystem принимает капчу от extension, отдает ее в ручной UI или
авторешатель, связывает ответ с usage log и хранит размеченные/неразмеченные
кейсы для улучшения solver.

## Поток

1. Extension отправляет `POST /solve-captcha`.
2. Сервер валидирует API-ключ, связывает запрос с usage log и captcha id.
3. Если включен `auto_solve`, вызывается solver.
4. Иначе капча пушится в SSE UI и запрос ждет `POST /solve`.
5. После ответа UI/solver extension валидирует капчу в EOPP и завершает usage.

## Где менять

- Solve HTTP adapter: `src/routes/captcha.py`
- Captcha records HTTP adapter: `src/routes/captchas.py`
- Solve business helpers: `src/services/captcha_service.py`
- Captcha records business rules: `src/services/captcha_records_service.py`
- Storage adapter: `src/repositories/captcha_repo.py`
- Request schemas: `src/schemas/captcha.py`
- Captcha files DB helpers: `src/db/captchas.py`
- Solver algorithm: `captcha_solver.py`

## Правило границы

`src/routes/captcha.py` управляет HTTP/SSE workflow, но не должен напрямую
решать вопросы владения данными usage или captcha records. Для этого есть
service/repository слой.
