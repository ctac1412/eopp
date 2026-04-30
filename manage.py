#!/usr/bin/env python3
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import typer

from src.utils import PORT, TEST_DIR
from src.app import create_app

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
    test: bool = False,
    write: bool = False,
    host: str = "127.0.0.1",
    port: int = PORT,
):
    """Start the captcha solver server."""
    import uvicorn
    import src.utils

    if write:
        src.utils.write_mode = True

    certfile, keyfile = ensure_self_signed_cert()
    typer.echo(f"Server running on http://{host}:{port}")
    typer.echo()
    typer.echo("Endpoints:")
    typer.echo("  GET  /          — User interface")
    typer.echo("  GET  /stream    — SSE stream for new captchas")
    typer.echo("  POST /solve-captcha — Submit captcha (blocks until solved)")
    typer.echo("  POST /solve     — Submit solution (called by UI)")
    typer.echo()

    if test:
        typer.echo(f"Loading test cases from {TEST_DIR} ...")

    if write:
        typer.echo(f"LABELING MODE — loading unlabelled cases from {TEST_DIR} ...")

    fastapi_app = create_app(use_tests=test)
    uvicorn.run(
        fastapi_app,
        host=host,
        port=port,
        log_level="warning",
        timeout_graceful_shutdown=2,
        ssl_certfile=certfile,
        ssl_keyfile=keyfile,
    )


if __name__ == "__main__":
    app()
