import os
import json

PORT = 8765
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_DIR = os.path.join(PROJECT_DIR, "tests", "test_cases")
VALID_DIR = os.path.join(TEST_DIR, "valid")
NO_VALID_DIR = os.path.join(TEST_DIR, "no_valid")
CAPTCHA_TIMEOUT = 10
FRONTEND_DIST = os.path.join(PROJECT_DIR, "frontend", "dist")

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN") or 13243546
if not ADMIN_TOKEN:
    admin_token_path = os.path.join(PROJECT_DIR, "data", "admin_token")
    if os.path.exists(admin_token_path):
        with open(admin_token_path) as f:
            ADMIN_TOKEN = f.readline().strip()

ADMIN_TOKEN = str(ADMIN_TOKEN)
PROTECTED_PATHS = (
    "/api-keys",
    "/usage-log",
)

write_mode = False
override_captcha_timeout = None

_TEST_API_KEY = None


def get_test_api_key():
    global _TEST_API_KEY
    if _TEST_API_KEY is not None:
        return _TEST_API_KEY

    from src.api_keys import get_key_record, create_key

    existing = get_key_record("__test_key__")
    if existing:
        _TEST_API_KEY = existing["key"]
        return _TEST_API_KEY

    row = create_key("__test_key__", max_uses=None)
    _TEST_API_KEY = row["key"]
    return _TEST_API_KEY
