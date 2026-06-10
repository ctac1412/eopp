"""Backfill companies from usage_log data.

Reads company names from:
1. usage_log.company field (already extracted)
2. usage_log.config_json → reservationData.raw.userData.organizationName (not yet extracted)

Creates Company records and updates usage_log.company_id.
Run on the server: python server/scripts/backfill_companies.py
"""

import json
import sys
import os
from datetime import UTC, datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Use the same DB as Alembic migrations (server/data/api_keys.db)
os.environ.setdefault("EOPP_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))

from src.entities import get_session, UsageLog, Company, set_db_path

# Force DB path before any SQLAlchemy usage
_db = os.environ["EOPP_DATA_DIR"]
set_db_path(os.path.join(_db, "api_keys.db"))


def main():
    with get_session() as session:
        # Collect company names from usage_log.company
        rows_with_company = (
            session.query(UsageLog)
            .filter(UsageLog.company.isnot(None), UsageLog.company != "")
            .all()
        )
        print(f"Rows with company field: {len(rows_with_company)}")

        # Collect company names from config_json
        rows_with_config = (
            session.query(UsageLog)
            .filter(UsageLog.config_json.isnot(None))
            .all()
        )
        print(f"Rows with config_json: {len(rows_with_config)}")

        # Extract company names
        company_names: set[str] = set()
        for row in rows_with_company:
            company_names.add(row.company.strip())

        config_extra = 0
        for row in rows_with_config:
            if row.company and row.company.strip():
                continue  # already have company
            try:
                cfg = json.loads(row.config_json)
                org = (
                    cfg.get("reservationData", {})
                    .get("raw", {})
                    .get("userData", {})
                    .get("organizationName", "")
                )
                if org and org.strip():
                    company_names.add(org.strip())
                    config_extra += 1
            except (json.JSONDecodeError, TypeError, AttributeError):
                pass
        print(f"Extra companies from config_json: {config_extra}")
        print(f"Total unique company names: {len(company_names)}")

        if not company_names:
            print("No companies to backfill. Exiting.")
            return

        # Create or find Company for each name
        created = 0
        name_to_id: dict[str, int] = {}
        for name in sorted(company_names):
            existing = session.query(Company).filter(Company.name == name).first()
            if existing:
                name_to_id[name] = existing.id
            else:
                c = Company(
                    name=name,
                    created_at=datetime.now(UTC).isoformat(),
                )
                session.add(c)
                session.flush()
                name_to_id[name] = c.id
                created += 1
                print(f"  Created: {name}")

        session.commit()
        print(f"Created {created} new companies, {len(name_to_id) - created} already existed")

        # Update usage_log.company_id for rows with company name
        updated_company = 0
        for row in rows_with_company:
            name = row.company.strip()
            cid = name_to_id.get(name)
            if cid and row.company_id != cid:
                row.company_id = cid
                updated_company += 1

        # Update usage_log.company_id for rows from config_json
        updated_config = 0
        for row in rows_with_config:
            if row.company and row.company.strip():
                continue  # already handled above
            try:
                cfg = json.loads(row.config_json)
                org = (
                    cfg.get("reservationData", {})
                    .get("raw", {})
                    .get("userData", {})
                    .get("organizationName", "")
                )
                if org and org.strip():
                    cid = name_to_id.get(org.strip())
                    if cid and row.company_id != cid:
                        row.company_id = cid
                        updated_config += 1
            except (json.JSONDecodeError, TypeError, AttributeError):
                pass

        session.commit()
        print(f"Updated company_id from company field: {updated_company}")
        print(f"Updated company_id from config_json: {updated_config}")
        print("Done.")


if __name__ == "__main__":
    main()
