import os
import subprocess
import sys

from typer.testing import CliRunner


def test_manage_cli_sets_runtime_constants_before_starting_server(monkeypatch):
    import manage
    import src.constants

    captured = {}

    def fake_run(app, **kwargs):
        captured["app"] = app
        captured["kwargs"] = kwargs

    class FakeLoop:
        def set_default_executor(self, executor):
            captured["executor"] = executor

    monkeypatch.setattr("asyncio.get_event_loop", lambda: FakeLoop())
    monkeypatch.setattr("uvicorn.run", fake_run)
    monkeypatch.setattr("src.app.create_app", lambda: "fake-fastapi-app")

    result = CliRunner().invoke(manage.app, ["--no-ssl", "--port", "8766"])

    assert result.exit_code == 0, result.output
    assert src.constants.use_ssl is False
    assert src.constants.PORT == 8766
    assert captured["app"] == "fake-fastapi-app"
    assert "executor" in captured
    assert captured["kwargs"]["port"] == 8766
    assert "ssl_certfile" not in captured["kwargs"]


def test_manage_help_does_not_require_admin_token():
    env = os.environ.copy()
    env.pop("ADMIN_TOKEN", None)

    result = subprocess.run(
        [sys.executable, "server/manage.py", "--help"],
        cwd=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        env=env,
        text=True,
        capture_output=True,
        timeout=10,
    )

    assert result.returncode == 0, result.stderr
    assert "Captcha Solver Server" in result.stdout
