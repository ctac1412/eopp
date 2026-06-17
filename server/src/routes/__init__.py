"""
EOPP Captcha Solver - Routes Package

Модули роутов (все используют APIRouter):
- captcha: решение капч (/solve-captcha, /solve, /trigger-test, /broadcast)
- sse: Server-Sent Events (/stream)
- api_keys: управление API ключами (/api-keys, /validate-key)
- usage: логирование использования (/register-usage, /confirm-usage, /fail-usage)
- captchas: история капч (/captchas)
- slots: координация слотов (/slots-group/*)
- distribution: распределённое решение (/distribution/*)
- mock: Mock EOPP API для тестирования
- operator: операторы (/operators/*)
- admin: админские операции (/admin/*)
- frontend: раздача статики React
- plugin_files: раздача файлов плагинов
"""

import os

from src.constants import PLUGINS_DIR


DEFAULT_MODULE_MANIFESTS = (
    "src.modules.billing.manifest",
    "src.modules.training.manifest",
)
"""Default optional server modules loaded after protected core routers."""


def _configured_module_manifests() -> tuple[str, ...]:
    """Return enabled module manifest paths without mutating core registration."""

    configured = os.environ.get("EOPP_MODULE_MANIFESTS")
    if configured is None:
        return DEFAULT_MODULE_MANIFESTS
    return tuple(path.strip() for path in configured.split(",") if path.strip())


def register_all_routes(app):
    """Register protected core routers first, then optional module manifests."""

    from src.routes.admin import admin_auth_middleware_factory
    from src.routes.admin import router as admin_router
    from src.routes.admin_jobs import router as admin_jobs_router
    from src.routes.auth import router as auth_router
    from src.routes.api_keys import router as api_keys_router
    from src.routes.callback import txt_router as callback_txt_router
    from src.routes.captcha import router as captcha_router
    from src.routes.captchas import router as captchas_router
    from src.routes.chat import router as chat_router
    from src.routes.distribution import router as distribution_router
    from src.routes.frontend import register_frontend_routes, register_test_pages
    from src.routes.health import router as health_router
    from src.routes.mock import router as mock_router
    from src.routes.operator import router as operator_router
    from src.routes.plugin_files import router as plugin_router
    from src.routes.scheduled import router as scheduled_router
    from src.routes.slots import router as slots_router
    from src.routes.sse import router as sse_router
    from src.routes.usage import router as usage_router
    from src.platform.module_registry import register_modules

    admin_auth_middleware_factory(app)

    api_prefix = "/api"

    app.include_router(health_router, prefix=api_prefix)
    app.include_router(sse_router, prefix=api_prefix)
    # Rucaptcha pingback is disabled for the release perimeter until auto-solver
    # traffic is intentionally re-enabled.
    app.include_router(callback_txt_router)
    app.include_router(auth_router, prefix=api_prefix)
    app.include_router(captcha_router, prefix=api_prefix)
    app.include_router(distribution_router, prefix=api_prefix)
    app.include_router(api_keys_router, prefix=api_prefix)
    app.include_router(usage_router, prefix=api_prefix)
    app.include_router(slots_router, prefix=api_prefix)
    app.include_router(captchas_router, prefix=api_prefix)
    app.include_router(operator_router, prefix=api_prefix)
    # Plugin-channel API is disabled until the channel plugin has active consumers.
    app.include_router(chat_router, prefix=api_prefix)
    app.include_router(scheduled_router, prefix=api_prefix)
    app.include_router(mock_router, prefix=api_prefix)
    app.include_router(admin_router, prefix=api_prefix)
    app.include_router(admin_jobs_router, prefix=api_prefix)

    if os.path.isdir(PLUGINS_DIR):
        app.include_router(plugin_router)

    register_modules(app, _configured_module_manifests(), prefix=api_prefix)

    register_test_pages(app)
    register_frontend_routes(app)
