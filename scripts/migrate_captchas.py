"""
Миграция v2 captchas: заполнение tiles_hash и correct_answer.

Обрабатывает ТОЛЬКО v2 логи (с "<log-version>v2</log-version>" в первой строке).
Для v1 логов используй scripts/migrate_v1_captchas.py
"""

import hashlib
import json
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.db.captchas import _extract_v2

DEV_DB = "data/api_keys_dev.db"

_V2_VERSION_RE = re.compile(r"<log-version>v2</log-version>")


def get_examples_dir(db_path: str) -> tuple[str, str]:
    db_dir = os.path.dirname(os.path.abspath(db_path))
    base = os.path.join(db_dir, "captcha_examples")
    return os.path.join(base, "valid"), os.path.join(base, "no_valid")


def tiles_hash(tiles: list[dict]) -> str:
    tile_ids = sorted(t["tileId"] for t in tiles)
    hash_input = json.dumps(tile_ids, sort_keys=True)
    return hashlib.sha256(hash_input.encode()).hexdigest()[:16]


def find_captcha_file(captcha_id: str, valid_dir: str, no_valid_dir: str) -> str | None:
    for dir_path in (valid_dir, no_valid_dir):
        path = os.path.join(dir_path, f"{captcha_id}.json")
        if os.path.exists(path):
            return path
    return None


def is_v2_log(logs: list[str] | None) -> bool:
    if not logs:
        return False
    return bool(_V2_VERSION_RE.search(logs[0]))


def migrate(db_path: str = DEV_DB):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    valid_dir, no_valid_dir = get_examples_dir(db_path)
    print(f"  Valid dir: {valid_dir}")
    print(f"  No valid dir: {no_valid_dir}")

    total_captchas = conn.execute("SELECT COUNT(*) FROM captchas").fetchone()[0]
    print(f"[1/4] Deleting {total_captchas} existing captchas records...")
    conn.execute("DELETE FROM captchas")
    conn.commit()

    rows = conn.execute(
        "SELECT id, captcha_id, status, created_at, logs FROM usage_log WHERE is_test = 0 AND captcha_id IS NOT NULL AND captcha_id != 'unknown' ORDER BY id"
    ).fetchall()

    print(f"[2/4] Found {len(rows)} usage_log entries")

    v1_count = 0
    v2_count = 0
    skipped = 0
    created = 0
    with_correct_answer = 0
    hash_groups = {}
    multi_captcha_logs = 0

    print(f"[3/4] Processing...")
    for row in rows:
        logs = json.loads(row["logs"]) if row["logs"] else None

        if not is_v2_log(logs):
            v1_count += 1
            continue

        v2_count += 1
        parsed = _extract_v2(logs)

        if not parsed:
            parsed = [(row["captcha_id"], "passed" if row["status"] == "confirmed" else "failed", None, None)]

        if len(parsed) > 1:
            multi_captcha_logs += 1

        for captcha_id, cap_status, correct_answer, fail_reason in parsed:
            file_path = find_captcha_file(captcha_id, valid_dir, no_valid_dir)

            if not file_path:
                skipped += 1
                continue

            with open(file_path, "r") as f:
                data = json.load(f)

            puzzle = data.get("puzzle", data)
            tiles = puzzle.get("tiles", [])
            variants = puzzle.get("variantsCapture", [])
            valid_index = data.get("valid_index")

            thash = tiles_hash(tiles) if tiles else None

            if correct_answer is None and valid_index is not None and variants and 0 <= valid_index < len(variants):
                correct_answer = json.dumps(variants[valid_index])

            if correct_answer:
                with_correct_answer += 1

            hash_groups.setdefault(thash, []).append(captcha_id)

            conn.execute(
                """INSERT INTO captchas (captcha_id, status, usage_log_id, tiles_hash, correct_answer, fail_reason, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (captcha_id, cap_status, row["id"], thash, correct_answer, fail_reason, row["created_at"]),
            )
            created += 1

    conn.commit()

    print(f"[4/4] Results:")
    print(f"  V2 logs processed: {v2_count}")
    print(f"  V1 logs skipped (use migrate_v1_captchas.py): {v1_count}")
    print(f"  Captchas created: {created}")
    print(f"  Skipped (file not found): {skipped}")
    print(f"  With correct_answer: {with_correct_answer}")
    print(f"  Logs with multiple captchas: {multi_captcha_logs}")

    duplicate_hashes = {h: ids for h, ids in hash_groups.items() if len(ids) > 1}
    if duplicate_hashes:
        print(f"\nDuplicate tiles_hash groups ({len(duplicate_hashes)}):")
        for h, ids in sorted(duplicate_hashes.items(), key=lambda x: -len(x[1])):
            print(f"  {h}: {len(ids)} captchas - {', '.join(ids[:5])}{'...' if len(ids) > 5 else ''}")

    total = conn.execute("SELECT COUNT(*) FROM captchas").fetchone()[0]
    print(f"\nTotal captchas in DB: {total}")

    conn.close()


if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else DEV_DB
    print(f"DB: {db}")
    migrate(db)
