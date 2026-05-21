# Change map

Карта нужна, чтобы маленькая модель могла открыть минимальный набор файлов под
тип задачи и не читать весь проект.

| Задача | Начать отсюда | Обычно затрагивает | Проверка |
| --- | --- | --- | --- |
| Изменить lifecycle usage | `src/domain/usage/README.md` | `src/services/usage_service.py`, `src/repositories/usage_repo.py`, `src/routes/usage.py`, `src/schemas/usage.py` | `uv run pytest tests/test_api_routes.py::TestUsage -q` |
| Изменить solve captcha workflow | `src/domain/captcha/README.md` | `src/routes/captcha.py`, `src/services/captcha_service.py`, `src/schemas/captcha.py` | `uv run pytest tests/test_api_routes.py::TestCaptcha -q` |
| Изменить список сохраненных капч | `src/domain/captcha/README.md` | `src/routes/captchas.py`, `src/services/captcha_records_service.py`, `src/repositories/captcha_repo.py` | `uv run pytest tests/test_api_routes.py::TestCaptchaRecords -q` |
| Изменить admin auth policy | `src/policies/access_policy.py` | `src/routes/admin.py`, tests for protected endpoints | `uv run pytest tests/test_api_routes.py::TestAdmin -q` |
| Изменить billing/admin finance | `src/domain/billing/README.md` | `src/services/billing_service.py`, `src/repositories/billing_repo.py`, `src/routes/admin.py`, `src/schemas/billing.py` | `uv run pytest tests/test_admin_billing.py tests/test_admin_auth.py -q` |
| Изменить вкладки админки | `frontend/src/features/admin/shared/tabs.js` | `frontend/src/AdminPage.jsx`, `frontend/src/components/admin/` | `npm run build` in `frontend/` |
| Изменить admin API headers | `frontend/src/features/admin/shared/adminClient.js` | `frontend/src/AdminPage.jsx`, admin tab components | `npm run build` in `frontend/` |
| Изменить extension release gate | `yandex-browser-plugin/AGENTS.md` | `yandex-browser-plugin/package.json`, `.github/` or release scripts | `npm run typecheck` in `yandex-browser-plugin/` |

## Общие правила

- Сначала меняй schema/service/repository внутри одного контекста, затем route.
- Не добавляй бизнес-логику в route, если ее можно назвать и протестировать как
  service function.
- Для новых подсистем добавляй короткий `src/domain/<name>/README.md` и строку в
  эту карту.
