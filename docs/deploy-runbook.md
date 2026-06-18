# EOPP Deploy Runbook

This runbook documents Phase 9 production delivery. A release has one
`release_id` and `release.json`. Normal deploys promote code/plugins only;
local database and JSON content are promoted only by explicit operator choice.

```json
{
  "release_id": "20260611_181500-a1b2c3d",
  "release_type": "full_state_promotion",
  "git_sha": "a1b2c3d",
  "image": "eopp:20260611_181500-a1b2c3d",
  "created_at": "2026-06-11T18:15:00+03:00",
  "compose_sha256": "example-compose-sha256",
  "nginx_sha256": "example-nginx-sha256",
  "plugins_sha256": "example-plugins-sha256",
  "db_backup": "backup_20260611_181430_20260611_181500-a1b2c3d",
  "migration_before": "w4x5y6z7a8b9",
  "migration_after": "head",
  "health": "passed"
}
```

## Release Layout

Production uses this remote shape:

```text
/opt/eopp/
  current -> releases/<release_id>
  previous -> releases/<release_id>
  docker-compose.yml
  nginx/default.conf
  releases/<release_id>/
    docker-compose.yml
    nginx-default.conf
    release.json
    plugins/
  shared/
    data/
      api_keys.db
      captcha_examples/
    certs/
    backups/<backup_id>/
```

`server/deploy/docker-compose.yml` mounts `./shared/data`, `./shared/certs`,
and `./current/plugins`. App startup has `EOPP_AUTO_MIGRATE=0`; migrations are
run explicitly by `scripts/deploy/migrate.ps1`.

## Normal Code Deploy

Use this when local code and plugin assets should move to prod without
replacing production `shared/data`.

```powershell
make deploy
```

The deploy script:

1. Creates `release_id = YYYYMMDD_HHMMSS-<short_git_sha>`.
2. Prints a diff summary before push: git status/stat, local DB counts, remote
   DB counts, local data checksum, and local plugins checksum.
3. Requires confirmation unless `-Force` is passed directly to the script.
4. Builds frontend, extension, and Docker image tagged with the release id.
5. Creates a mandatory remote backup under `shared/backups`.
6. Uploads `docker-compose.yml`, `nginx-default.conf`, `plugins/`, and
   `release.json` to `releases/<release_id>`.
7. Leaves production `shared/data` untouched.
8. Runs `migrate.ps1` explicitly.
9. Starts the app with `EOPP_AUTO_MIGRATE=0`.
10. Runs `verify-release.ps1` and marks `health` as `passed`.

## Full-State Deploy

Use this only when local `server/data/api_keys.db` and JSON content should
replace production `shared/data` as part of the release. The script asks for an
additional production confirmation before copying data.

```powershell
make deploy-full-state
# or
powershell -ExecutionPolicy Bypass -File scripts/deploy/deploy.ps1 -PromoteData
```

## Plugin-Only Deploy

Use only for emergency extension/plugin rollout when server code and DB do not
change.

```powershell
make deploy-push-plugins
```

This still creates a release id, backs up current plugins and DB metadata,
writes a plugin release manifest, switches `current` atomically, and verifies
`/plugins/update.xml`.

## Data-Only Promotion

Use when local `server/data/api_keys.db` and JSON content should be promoted
without changing code.

```powershell
make deploy-push-data
```

This command is not a loose DB copy. It prints the diff summary, creates a
mandatory backup, stops the app, replaces the DB/content from staging, removes
WAL/SHM files, restarts the current release image, and verifies production.

## Release Rollback

Rollback selects a release manifest. It never chooses a Docker image with
`head -1`.

```powershell
make deploy-rollback RELEASE_ID=20260610_220000-f9e8d7c
```

Without `RELEASE_ID`, rollback uses `/opt/eopp/previous` if it has a
`release.json`. Release rollback switches `current`, restores compose/nginx from
the target release, restarts containers, and verifies health. It does not
restore the DB unless explicitly requested.

## Explicit DB Restore

Use this when a destructive migration, bad full-state promotion, or bad data
edit requires database rollback.

```powershell
make deploy-restore-backup BACKUP_ID=backup_20260611_181430_20260611_181500-a1b2c3d
```

`restore-backup.ps1` stops the app, saves an
`emergency_before_restore_<timestamp>` copy of the current DB, prints the
backup's release id, restores `api_keys.db`, removes/restores WAL/SHM
consistently, starts the current release, and verifies health.

## Failed Migration Response

If `migrate.ps1` fails:

1. Do not start the candidate release.
2. Inspect `releases/<release_id>/migration_before.txt`.
3. If migration touched production data, run explicit DB restore from the
   mandatory backup.
4. Fix migration locally and create a new release id.

For SQLite, destructive migrations are rollback-by-restore unless a downgrade
has been tested against a copy of production data.

Migration safety labels for release notes or migration headers:

```text
safe_expand    - add nullable columns, indexes, or tables
data_backfill  - data fill that can run async after deploy
contract       - drops/renames after old code is gone
irreversible   - rollback requires DB restore
```

## Verify Backups

Before peak windows, test backup readability:

```powershell
make deploy-backup
make deploy-verify
```

On the server, each backup contains `api_keys.db`, WAL/SHM files when present,
`captcha_examples/`, `plugins/`, compose/nginx snapshots, current
`release.json`, and `backup.json`.

## Rollback Drill

Before peak windows, practice on a quiet period:

```powershell
make deploy-verify
make deploy-rollback RELEASE_ID=<previous_release_id>
make deploy-verify
make deploy-rollback RELEASE_ID=<current_release_id>
make deploy-verify
```

Only use `deploy-restore-backup` during a drill if the selected backup and the
current production window are explicitly approved.
