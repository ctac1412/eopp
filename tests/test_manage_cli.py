from typer.testing import CliRunner


def test_manage_cli_sets_runtime_constants_before_starting_server(monkeypatch):
    import manage
    import src.constants

    captured = {}

    def fake_run(app, **kwargs):
        captured["kwargs"] = kwargs

    monkeypatch.setattr("uvicorn.run", fake_run)

    result = CliRunner().invoke(manage.app, ["--no-ssl", "--port", "8766"])

    assert result.exit_code == 0, result.output
    assert src.constants.use_ssl is False
    assert src.constants.PORT == 8766
    assert captured["kwargs"]["port"] == 8766
    assert "ssl_certfile" not in captured["kwargs"]
