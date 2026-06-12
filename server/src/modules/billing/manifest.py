"""Manifest for the optional billing side module.

Billing is deliberately exposed as a side module: captcha and usage core paths
may enqueue billing work, but tariff, prepaid, and invoice failures must stay
outside core HTTP startup and request handling.
"""

from __future__ import annotations

from src.platform.module_registry import ModuleManifest


manifest = ModuleManifest(
    name="billing",
    job_handlers={
        "billing.calculate_usage_price": "src.modules.billing.jobs.calculate_usage_price",
        "billing.deduct_prepaid": "src.modules.billing.jobs.deduct_prepaid",
        "billing.link_open_invoice": "src.modules.billing.jobs.link_open_invoice",
    },
    permissions=("billing.view", "billing.edit", "invoice.generate"),
)
"""Flat declaration used by the platform module registry."""
