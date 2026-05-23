"""
EOPP Captcha Solver - Routes Package

Модули роутов:
- captcha: решение капч (/solve-captcha, /solve, /trigger-test, /broadcast)
- sse: Server-Sent Events (/stream)
- api_keys: управление API ключами (/api-keys, /validate-key)
- usage: логирование использования (/register-usage, /confirm-usage, /fail-usage)
- captchas: история капч (/captchas)
- mock: Mock EOPP API для тестирования
- admin: админские операции (/admin/*)
- frontend: раздача статики React
"""

from src.routes.admin import register_admin_routes
from src.routes.api_keys import register_api_key_routes
from src.routes.captcha import register_captcha_routes
from src.routes.captchas import register_captchas_routes
from src.routes.frontend import register_frontend_routes, register_test_pages
from src.routes.mock import register_mock_routes
from src.routes.plugin_files import register_plugin_static_routes
from src.routes.slots import register_slots_routes
from src.routes.sse import register_sse_routes
from src.routes.usage import register_usage_routes


def register_all_routes(app, captcha_timeout):
    register_sse_routes(app)
    register_captcha_routes(app, captcha_timeout)
    register_api_key_routes(app)
    register_usage_routes(app)
    register_slots_routes(app)
    register_captchas_routes(app)
    register_admin_routes(app)
    register_mock_routes(app)
    register_plugin_static_routes(app)
    register_frontend_routes(app)
    register_test_pages(app)
