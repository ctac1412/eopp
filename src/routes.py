"""
EOPP Captcha Solver - Routes Package

Этот файл теперь служит точкой входа для обратной совместимости.
Основная логика распределена по модулям в src/routes/:

- sse.py: Server-Sent Events (/stream)
- captcha.py: Решение капч (/solve-captcha, /solve, /trigger-test)
- api_keys.py: Управление ключами (/api-keys, /validate-key)
- usage.py: Логирование использования (/register-usage, /confirm-usage)
- slots.py: Координация слотов (/slots-group)
- mock.py: Mock EOPP API (/reservations-api/v1/*)
- admin.py: Админские операции (/admin/*)
- frontend.py: Раздача статики React

Импортирует все роутеры и регистрирует их в приложении.
"""

from src.routes.captcha import register_captcha_routes
from src.routes.sse import register_sse_routes
from src.routes.api_keys import register_api_key_routes
from src.routes.usage import register_usage_routes
from src.routes.slots import register_slots_routes
from src.routes.mock import register_mock_routes
from src.routes.admin import register_admin_routes, admin_auth_middleware_factory
from src.routes.frontend import register_frontend_routes, register_test_pages

from src.constants import CAPTCHA_TIMEOUT

from src.routes_plugins import register_plugin_routes


def register_all_routes(app, captcha_timeout=CAPTCHA_TIMEOUT):
    register_sse_routes(app)
    register_captcha_routes(app, captcha_timeout)
    register_api_key_routes(app)
    register_usage_routes(app)
    register_slots_routes(app)
    register_admin_routes(app)
    register_mock_routes(app)
    register_test_pages(app)
    register_frontend_routes(app)
    register_plugin_routes(app)


# Re-export for backwards compatibility
__all__ = [
    "register_all_routes",
    "admin_auth_middleware_factory",
]
