from pathlib import Path
import json


ROOT = Path(__file__).resolve().parents[2]
DEPLOY_DIR = ROOT / "scripts" / "deploy"
SERVER_DEPLOY_DIR = ROOT / "server" / "deploy"


def read_script(name: str) -> str:
    return (DEPLOY_DIR / name).read_text(encoding="utf-8")


def test_full_deploy_does_not_download_local_backup():
    script = read_script("deploy.ps1")

    forbidden_tokens = [
        "Backing up remote data",
        "$script:LocalBackupDir",
        "${script:SshTarget}:${script:RemoteDir}/data/.",
        "${script:SshTarget}:${script:RemoteDir}/plugins/.",
        "Backup: $backupSubdir",
    ]

    for token in forbidden_tokens:
        assert token not in script


def test_manual_backup_script_still_downloads_remote_data():
    script = read_script("backup.ps1")

    assert "Backing up remote data" in script
    assert "${script:SshTarget}:${script:RemoteDir}/data/." in script
    assert "${script:SshTarget}:${script:RemoteDir}/plugins/." in script


def test_deploy_uses_release_manifest_and_mandatory_backup():
    script = read_script("deploy.ps1")

    assert "New-ReleaseId" in script
    assert "Write-ReleaseManifest" in script
    assert "Invoke-RemoteBackup" in script
    assert "Show-ReleaseDiffSummary" in script
    assert '"release_type" = "full_state_promotion"' in script
    assert '"release_id" = $releaseId' in script
    assert '"db_backup" = $backupId' in script
    assert '"plugins_sha256" = $pluginsSha' in script
    assert "EOPP_AUTO_MIGRATE=0" in script


def test_deploy_passes_git_metadata_into_docker_build():
    script = read_script("deploy.ps1")

    assert "--build-arg" in script
    assert "EOPP_GIT_SHA=$gitSha" in script
    assert "EOPP_RELEASE_ID=$releaseId" in script
    assert "EOPP_IMAGE=$imageFull" in script


def test_dockerfile_embeds_release_metadata_env_and_labels():
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")

    assert "ARG EOPP_GIT_SHA=unknown" in dockerfile
    assert "ARG EOPP_RELEASE_ID=local" in dockerfile
    assert "ARG EOPP_IMAGE=eopp:local" in dockerfile
    assert "ENV EOPP_GIT_SHA=$EOPP_GIT_SHA" in dockerfile
    assert "ENV EOPP_RELEASE_ID=$EOPP_RELEASE_ID" in dockerfile
    assert "ENV EOPP_IMAGE=$EOPP_IMAGE" in dockerfile
    assert 'org.opencontainers.image.revision="$EOPP_GIT_SHA"' in dockerfile
    assert 'org.opencontainers.image.version="$EOPP_RELEASE_ID"' in dockerfile


def test_release_helper_documents_release_state_contract():
    script = read_script("release.ps1")

    assert ".SYNOPSIS" in script
    assert "release.json" in script
    assert "YYYYMMDD_HHMMSS-<short_git_sha>" in script
    assert "function New-ReleaseId" in script
    assert "function Write-ReleaseManifest" in script
    assert "function Get-DirectorySha256" in script
    assert "function Show-ReleaseDiffSummary" in script
    assert "code, database, JSON content, and plugins" in script


def test_rollback_targets_selected_release_manifest_not_docker_images():
    script = read_script("rollback.ps1")

    assert "param(" in script
    assert "[string]$ReleaseId" in script
    assert "Resolve-RollbackReleaseId" in script
    assert "release.json" in script
    assert "RestoreDbBackup" in script
    assert "docker images" not in script
    assert "head -1" not in script
    assert "grep -v" not in script


def test_restore_backup_is_explicit_and_operator_confirmed():
    script = read_script("restore-backup.ps1")

    assert "[Parameter(Mandatory = $true)]" in script
    assert "[string]$BackupId" in script
    assert "release_id" in script
    assert "emergency_before_restore" in script
    assert "Remove-WalShm" in script
    assert "-Force" in script


def test_verify_release_checks_manifest_backup_db_plugins_and_alembic():
    script = read_script("verify-release.ps1")

    for token in [
        "current/release.json",
        "docker compose ps",
        "/version",
        "/plugins/update.xml",
        "sqlite3",
        "alembic current",
        "db_backup",
        "git_sha mismatch",
        "release_id mismatch",
    ]:
        assert token in script


def test_remote_compose_uses_shared_data_and_release_bound_plugins():
    compose = (SERVER_DEPLOY_DIR / "docker-compose.yml").read_text(encoding="utf-8")

    assert "./shared/data:/app/data" in compose
    assert "./shared/certs:/app/certs" in compose
    assert "./current/plugins:/app/plugins" in compose
    assert "EOPP_AUTO_MIGRATE=${EOPP_AUTO_MIGRATE:-0}" in compose
    assert "image: ${EOPP_IMAGE" in compose


def test_release_manifest_schema_example_is_valid_json():
    runbook = (ROOT / "docs" / "deploy-runbook.md").read_text(encoding="utf-8")
    start = runbook.index("```json")
    end = runbook.index("```", start + 7)
    manifest = json.loads(runbook[start + 7 : end])

    assert manifest["release_id"] == "20260611_181500-a1b2c3d"
    assert manifest["release_type"] == "full_state_promotion"
    assert set(manifest) >= {
        "release_id",
        "git_sha",
        "image",
        "created_at",
        "compose_sha256",
        "nginx_sha256",
        "plugins_sha256",
        "db_backup",
        "migration_before",
        "migration_after",
        "health",
    }


def test_auto_migrate_can_be_disabled_for_production_startup(monkeypatch):
    from src.db import init as db_init

    called = False

    def fake_upgrade(*args, **kwargs):
        nonlocal called
        called = True

    monkeypatch.setenv("EOPP_AUTO_MIGRATE", "0")
    monkeypatch.setattr(db_init.command, "upgrade", fake_upgrade)

    db_init.init_db()

    assert called is False
