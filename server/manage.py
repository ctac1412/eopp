#!/usr/bin/env python3
"""
EOPP Captcha Solver Server - CLI Entry Point.

Точка входа для запуска Python-сервера решателя капч. Использует typer для CLI,
генерирует self-signed SSL сертификат, запускает uvicorn.

Использование:
    python server/manage.py --host 0.0.0.0          # HTTPS режим
    python server/manage.py --host 0.0.0.0 --no-ssl # HTTP режим

Переменные окружения:
    ADMIN_TOKEN - токен для админских операций
"""

import os
import sys
import logging
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Project root is one level above the server/ directory
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Load .env from project root (and server/ as fallback)
try:
    from dotenv import load_dotenv
    for env_path in [
        Path(_PROJECT_ROOT) / ".env",
        Path(__file__).parent / ".env",
    ]:
        if env_path.exists():
            load_dotenv(env_path)
            logging.info(f"Loaded env from {env_path}")
except ImportError:
    pass

import typer

app = typer.Typer(help="Captcha Solver Server")

CERT_DIR = Path(__file__).parent / "certs"
CERT_FILE = CERT_DIR / "cert.pem"
KEY_FILE = CERT_DIR / "key.pem"


def ensure_self_signed_cert():
    """Generate self-signed certificate if it doesn't exist."""
    if CERT_FILE.exists() and KEY_FILE.exists():
        return str(CERT_FILE), str(KEY_FILE)

    CERT_DIR.mkdir(exist_ok=True)

    import subprocess

    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:4096",
            "-nodes",
            "-keyout",
            str(KEY_FILE),
            "-out",
            str(CERT_FILE),
            "-days",
            "3650",
            "-subj",
            "/CN=localhost",
            "-addext",
            "subjectAltName=DNS:localhost,IP:127.0.0.1",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return str(CERT_FILE), str(KEY_FILE)


@app.callback(invoke_without_command=True)
def main(
    host: str = "127.0.0.1",
    port: int = 8765,
    no_ssl: bool = False,
    data_dir: str = None,
):
    """Start the captcha solver server."""
    import uvicorn

    if data_dir:
        os.environ["EOPP_DATA_DIR"] = data_dir
        os.environ["EOPP_DB_PATH"] = os.path.join(data_dir, "api_keys.db")

    import src.constants as constants
    from src.app import create_app
    from src.constants import CAPTCHA_TIMEOUT, NO_VALID_DIR, TEST_DIR, VALID_DIR
    from src.logging_config import configure_logging

    log_level = logging.getLevelName(configure_logging()).lower()

    certfile, keyfile = None, None
    if not no_ssl:
        certfile, keyfile = ensure_self_signed_cert()

    constants.use_ssl = not no_ssl
    constants.PORT = port

    typer.echo("=" * 56)
    typer.echo("  EOPP Captcha Solver Server — Configuration")
    typer.echo("=" * 56)
    typer.echo(f"  Host            : {host}")
    typer.echo(f"  Port            : {port}")
    typer.echo(f"  Protocol        : {'HTTP (no SSL)' if no_ssl else 'HTTPS (self-signed)'}")
    if not no_ssl:
        typer.echo(f"  Cert            : {certfile}")
        typer.echo(f"  Key             : {keyfile}")
    typer.echo(f"  Captcha timeout : {CAPTCHA_TIMEOUT}s")
    typer.echo(f"  Test dir        : {TEST_DIR}")
    typer.echo(f"  Valid dir       : {VALID_DIR}")
    typer.echo(f"  No-valid dir    : {NO_VALID_DIR}")
    typer.echo(f"  Data dir        : {os.environ.get('EOPP_DATA_DIR', 'data/')}")
    typer.echo(f"  DB path         : {os.environ.get('EOPP_DB_PATH', 'data/api_keys.db')}")
    typer.echo(f"  Log level       : {os.environ.get('EOPP_LOG_LEVEL', 'INFO')}")

    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    max_workers = int(os.environ.get("EOPP_THREAD_POOL", "100"))
    asyncio.get_event_loop().set_default_executor(ThreadPoolExecutor(max_workers=max_workers))
    typer.echo(f"  Thread pool     : {max_workers} max workers")

    import captcha_solver

    typer.echo(
        f"  Solver weights  : disc={captcha_solver.W_DISC}, ssim={captcha_solver.W_SSIM}, coh={captcha_solver.W_COH}, sobel={captcha_solver.W_SOBEL}"
    )
    typer.echo(f"  Solver edge_trim: {captcha_solver.EDGE_TRIM}")

    frontend_dist = os.path.join(_PROJECT_ROOT, "frontend", "dist")
    typer.echo(
        f"  Frontend dist   : {'built' if os.path.isdir(frontend_dist) else 'NOT BUILT — run make build-frontend'}"
    )
    rucaptcha_key = os.environ.get("RUCAPTCHA_API_KEY", "").strip()
    rucaptcha_enabled = os.environ.get("EOPP_AUTO_SOLVER_ENABLED", "0") != "0"
    if rucaptcha_enabled:
        typer.echo(
            f"  Rucaptcha       : {'configured' if rucaptcha_key else 'DISABLED — RUCAPTCHA_API_KEY not set'}"
        )
    else:
        typer.echo("  Rucaptcha       : disabled (EOPP_AUTO_SOLVER_ENABLED=0)")
    typer.echo("=" * 56)
    typer.echo()
    typer.echo("Endpoints:")
    typer.echo("  GET  /          — User interface")
    typer.echo("  GET  /stream    — SSE stream for new captchas")
    typer.echo("  POST /solve-captcha — Submit captcha (blocks until solved)")
    typer.echo("  POST /solve     — Submit solution (called by UI)")
    typer.echo("  POST /trigger-test — Trigger test cases")
    typer.echo("  POST /broadcast  — Broadcast SSE event")
    typer.echo()

    fastapi_app = create_app()
    uvicorn_kwargs = {
        "host": host,
        "port": port,
        "log_level": os.environ.get("EOPP_UVICORN_LOG_LEVEL", log_level),
        "timeout_graceful_shutdown": 2,
        "limit_concurrency": int(os.environ.get("EOPP_CONCURRENCY", "100")),
    }
    if certfile and keyfile:
        uvicorn_kwargs["ssl_certfile"] = certfile
        uvicorn_kwargs["ssl_keyfile"] = keyfile
    uvicorn.run(fastapi_app, **uvicorn_kwargs)


if __name__ == "__main__":
    app()
