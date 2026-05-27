from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEPLOY_DIR = ROOT / "scripts" / "deploy"


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
