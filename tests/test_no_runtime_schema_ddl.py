from pathlib import Path


FORBIDDEN_RUNTIME_SCHEMA_PATTERNS = (
    "ALTER TABLE",
    "ADD COLUMN",
    "DROP COLUMN",
    "PRAGMA table_info",
    "sqlite_master",
)


def test_server_runtime_code_does_not_mutate_or_repair_schema():
    repo_root = Path(__file__).resolve().parents[1]
    runtime_root = repo_root / "server" / "src"
    offenders: list[str] = []

    for path in runtime_root.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        for pattern in FORBIDDEN_RUNTIME_SCHEMA_PATTERNS:
            if pattern in text:
                offenders.append(f"{path.relative_to(repo_root)} contains {pattern!r}")

    assert offenders == []
