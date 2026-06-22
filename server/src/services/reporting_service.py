"""Daily reporting and telegram-ready text summaries."""

from datetime import UTC, date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from zoneinfo._common import ZoneInfoNotFoundError

from src.db.connection import get_connection
from src.repositories import usage_log_repo

try:
    MSK = ZoneInfo("Europe/Moscow")
except ZoneInfoNotFoundError:
    MSK = timezone(timedelta(hours=3), "Europe/Moscow")

OPERATION_LABELS = {
    "create": "Создание",
    "reschedule": "Перенос",
    "unknown": "Неизвестно",
}

PAYMENT_LABELS = {
    "paid": "Оплачено",
    "unpaid": "Не оплачено",
    "no_price": "Без цены",
}

FINANCE_REPORT_KINDS = (
    "customer_income",
    "executor_salary",
    "operator_salary",
    "invoice_commission",
    "invoice_tax",
    "expense_repayment",
    "director_profit",
    "manual_adjustment",
)


def _msk_day_bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime(day.year, day.month, day.day, tzinfo=MSK)
    end = start + timedelta(days=1)
    return start.astimezone(UTC), end.astimezone(UTC)


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


def _usage_in_day(entries, day: date) -> list:
    start_utc, end_utc = _msk_day_bounds(day)
    result = []
    for item in entries:
        created = _parse_iso(item.created_at)
        if created and start_utc <= created < end_utc:
            result.append(item)
    return result


def _company_totals(entries) -> list[dict]:
    grouped: dict[str, dict] = {}
    for row in entries:
        company = row.company or "—"
        node = grouped.setdefault(
            company,
            {"company": company, "success": 0, "failed": 0, "pending": 0, "revenue": 0},
        )
        status = row.status
        if status == "confirmed":
            node["success"] += 1
            node["revenue"] += row.price or 0
        elif status == "failed":
            node["failed"] += 1
        else:
            node["pending"] += 1
    return sorted(grouped.values(), key=lambda item: item["revenue"], reverse=True)


def _operation_totals(entries) -> dict[str, dict]:
    grouped: dict[str, dict] = {}
    for row in entries:
        if row.status != "confirmed":
            continue
        op_type = row.op_type or "unknown"
        node = grouped.setdefault(op_type, {"count": 0, "revenue": 0})
        node["count"] += 1
        node["revenue"] += row.price or 0
    return grouped


def _payment_totals(entries) -> dict[str, dict]:
    grouped = {
        "paid": {"count": 0, "revenue": 0},
        "unpaid": {"count": 0, "revenue": 0},
        "no_price": {"count": 0, "revenue": 0},
    }
    for row in entries:
        if row.status != "confirmed":
            continue
        if row.price is None:
            bucket = "no_price"
        elif row.paid is True:
            bucket = "paid"
        else:
            bucket = "unpaid"
        grouped[bucket]["count"] += 1
        grouped[bucket]["revenue"] += row.price or 0
    return grouped


def build_daily_report(day: date | None = None) -> dict:
    target_day = day or datetime.now(MSK).date()
    all_rows = [row for row in usage_log_repo.list_usage() if not row.is_test]
    rows = _usage_in_day(all_rows, target_day)
    success = [row for row in rows if row.status == "confirmed"]
    failed = [row for row in rows if row.status == "failed"]
    pending = [row for row in rows if row.status == "pending"]
    revenue = sum((row.price or 0) for row in success)
    return {
        "date": target_day.isoformat(),
        "timezone": "Europe/Moscow",
        "total": len(rows),
        "success_count": len(success),
        "failed_count": len(failed),
        "pending_count": len(pending),
        "revenue_total": revenue,
        "operations": _operation_totals(rows),
        "payments": _payment_totals(rows),
        "companies": _company_totals(rows),
    }


def _report_bound(value: date | datetime | str | None, *, end: bool = False) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, date):
        dt = datetime(value.year, value.month, value.day, tzinfo=UTC)
        if end:
            dt = dt + timedelta(days=1)
    else:
        parsed = _parse_iso(value)
        if parsed is None:
            parsed_date = date.fromisoformat(value)
            dt = datetime(parsed_date.year, parsed_date.month, parsed_date.day, tzinfo=UTC)
            if end:
                dt = dt + timedelta(days=1)
        else:
            dt = parsed
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat()


def build_finance_report(
    start: date | datetime | str | None = None,
    end: date | datetime | str | None = None,
) -> dict:
    start_iso = _report_bound(start)
    end_iso = _report_bound(end, end=True)
    filters = []
    params: list = []
    if start_iso:
        filters.append("fe.created_at >= ?")
        params.append(start_iso)
    if end_iso:
        filters.append("fe.created_at < ?")
        params.append(end_iso)
    where = f"WHERE {' AND '.join(filters)}" if filters else ""

    conn = get_connection()
    entry_rows = conn.execute(
        f"""
        SELECT fe.kind, fe.amount, fe.user_id, u.name AS user_name
        FROM finance_entries fe
        LEFT JOIN users u ON u.id = fe.user_id
        {where}
        """,
        params,
    ).fetchall()
    lot_rows = conn.execute(
        f"""
        SELECT
            pl.gross_amount,
            pl.gross_amount + COALESCE(SUM(fe.amount), 0) AS available
        FROM profit_lots pl
        LEFT JOIN finance_entries fe ON fe.profit_lot_id = pl.id
        {"WHERE pl.created_at >= ?" if start_iso else ""}
        {"AND pl.created_at < ?" if start_iso and end_iso else "WHERE pl.created_at < ?" if end_iso else ""}
        GROUP BY pl.id
        """,
        [p for p in (start_iso, end_iso) if p],
    ).fetchall()
    conn.close()

    totals = {kind: 0.0 for kind in FINANCE_REPORT_KINDS}
    users: dict[str, dict] = {}
    for row in entry_rows:
        kind = row["kind"]
        amount = float(row["amount"] or 0)
        report_amount = amount if kind in ("customer_income", "manual_adjustment") else abs(amount)
        if kind not in totals:
            totals[kind] = 0.0
        totals[kind] += report_amount
        if row["user_id"] is None:
            continue
        user_key = str(row["user_id"])
        item = users.setdefault(
            user_key,
            {"user_id": row["user_id"], "user_name": row["user_name"], **{k: 0.0 for k in FINANCE_REPORT_KINDS}},
        )
        item[kind] = item.get(kind, 0.0) + report_amount

    totals["profit_lots_gross"] = sum(float(row["gross_amount"] or 0) for row in lot_rows)
    totals["net_profit_remaining"] = sum(float(row["available"] or 0) for row in lot_rows)
    return {
        "start": start_iso,
        "end": end_iso,
        "totals": totals,
        "users": users,
    }


def _user_label(row) -> str:
    return row["user_name"] or row["user_login"] or f"#{row['user_id']}"


def build_company_finance_analytics(company_id: int) -> dict | None:
    """Return company-scoped finance and launch analytics for the admin company card."""

    conn = get_connection()
    try:
        company = conn.execute(
            "SELECT id, name FROM companies WHERE id = ?",
            (company_id,),
        ).fetchone()
        if company is None:
            return None

        income_row = conn.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS amount
            FROM finance_entries
            WHERE company_id = ? AND kind = 'customer_income'
            """,
            (company_id,),
        ).fetchone()
        success_row = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM usage_log
            WHERE company_id = ?
              AND status = 'confirmed'
              AND COALESCE(is_test, 0) = 0
            """,
            (company_id,),
        ).fetchone()
        starts_by_type = [
            {
                "op_type": row["op_type"] or "unknown",
                "count": int(row["count"] or 0),
                "income": int(row["income"] or 0),
            }
            for row in conn.execute(
                """
                WITH usage_income AS (
                    SELECT usage_log_id, SUM(amount) AS income
                    FROM finance_entries
                    WHERE company_id = ? AND kind = 'customer_income'
                    GROUP BY usage_log_id
                )
                SELECT
                    COALESCE(ul.op_type, 'unknown') AS op_type,
                    COUNT(*) AS count,
                    COALESCE(SUM(ui.income), 0) AS income
                FROM usage_log ul
                LEFT JOIN usage_income ui ON ui.usage_log_id = ul.id
                WHERE ul.company_id = ?
                  AND ul.status = 'confirmed'
                  AND COALESCE(ul.is_test, 0) = 0
                GROUP BY COALESCE(ul.op_type, 'unknown')
                ORDER BY count DESC, op_type
                """,
                (company_id, company_id),
            ).fetchall()
        ]
        commission_rows = [
            {
                "kind": row["kind"],
                "user_id": row["user_id"],
                "user_name": _user_label(row) if row["user_id"] is not None else "Без получателя",
                "amount": abs(int(row["amount"] or 0)),
                "starts_count": int(row["starts_count"] or 0),
            }
            for row in conn.execute(
                """
                SELECT
                    fe.kind,
                    fe.user_id,
                    u.name AS user_name,
                    u.login AS user_login,
                    SUM(ABS(fe.amount)) AS amount,
                    COUNT(DISTINCT fe.usage_log_id) AS starts_count
                FROM finance_entries fe
                LEFT JOIN users u ON u.id = fe.user_id
                WHERE fe.company_id = ?
                  AND fe.kind IN ('invoice_commission', 'invoice_tax')
                GROUP BY fe.kind, fe.user_id, u.name, u.login
                HAVING amount != 0
                ORDER BY ABS(amount) DESC, fe.kind
                """,
                (company_id,),
            ).fetchall()
        ]
        payments_by_user = [
            {
                "user_id": row["user_id"],
                "user_name": _user_label(row),
                "amount": abs(int(row["amount"] or 0)),
                "entries_count": int(row["entries_count"] or 0),
            }
            for row in conn.execute(
                """
                SELECT
                    fe.user_id,
                    u.name AS user_name,
                    u.login AS user_login,
                    SUM(ABS(fe.amount)) AS amount,
                    COUNT(*) AS entries_count
                FROM finance_entries fe
                LEFT JOIN users u ON u.id = fe.user_id
                WHERE fe.company_id = ?
                  AND fe.user_id IS NOT NULL
                GROUP BY fe.user_id, u.name, u.login
                HAVING amount != 0
                ORDER BY ABS(amount) DESC, user_name
                """,
                (company_id,),
            ).fetchall()
        ]
        tax_recipients_for_starts = [
            {
                "user_id": row["user_id"],
                "user_name": _user_label(row),
                "amount": abs(int(row["amount"] or 0)),
                "starts_count": int(row["starts_count"] or 0),
            }
            for row in conn.execute(
                """
                SELECT
                    fe.user_id,
                    u.name AS user_name,
                    u.login AS user_login,
                    SUM(ABS(fe.amount)) AS amount,
                    COUNT(DISTINCT fe.usage_log_id) AS starts_count
                FROM finance_entries fe
                LEFT JOIN users u ON u.id = fe.user_id
                WHERE fe.company_id = ?
                  AND fe.kind = 'invoice_tax'
                  AND fe.usage_log_id IS NOT NULL
                  AND fe.user_id IS NOT NULL
                GROUP BY fe.user_id, u.name, u.login
                HAVING amount != 0
                ORDER BY ABS(amount) DESC, user_name
                """,
                (company_id,),
            ).fetchall()
        ]
        settings = conn.execute(
            """
            SELECT
                cbs.tax_commission_mode,
                cbs.default_percent_rate,
                cbs.default_tax_rate,
                cbs.default_commission_user_id,
                cu.name AS default_commission_user_name,
                cu.login AS default_commission_user_login,
                cbs.default_tax_user_id,
                tu.name AS default_tax_user_name,
                tu.login AS default_tax_user_login
            FROM company_billing_settings cbs
            LEFT JOIN users cu ON cu.id = cbs.default_commission_user_id
            LEFT JOIN users tu ON tu.id = cbs.default_tax_user_id
            WHERE cbs.company = ?
            """,
            (company["name"],),
        ).fetchone()

        commission_settings = {}
        if settings is not None:
            commission_settings = {
                "tax_commission_mode": settings["tax_commission_mode"] or "added",
                "default_percent_rate": float(settings["default_percent_rate"] or 0),
                "default_tax_rate": float(settings["default_tax_rate"] or 0),
                "default_commission_user_id": settings["default_commission_user_id"],
                "default_commission_user_name": (
                    settings["default_commission_user_name"]
                    or settings["default_commission_user_login"]
                ),
                "default_tax_user_id": settings["default_tax_user_id"],
                "default_tax_user_name": settings["default_tax_user_name"] or settings["default_tax_user_login"],
            }

        return {
            "company": {"id": company["id"], "name": company["name"]},
            "totals": {
                "income": int(income_row["amount"] or 0),
                "successful_starts": int(success_row["count"] or 0),
            },
            "starts_by_type": starts_by_type,
            "commission_settings": commission_settings,
            "commission_rows": commission_rows,
            "payments_by_user": payments_by_user,
            "tax_recipients_for_starts": tax_recipients_for_starts,
        }
    finally:
        conn.close()


def build_companies_finance_analytics(company_id: int | None = None) -> dict:
    """Return all-company finance summary, optionally scoped to one tenant company."""

    conn = get_connection()
    try:
        params = [company_id] if company_id is not None else []
        where = "WHERE id = ?" if company_id is not None else ""
        companies = conn.execute(
            f"SELECT id, name FROM companies {where} ORDER BY name",
            params,
        ).fetchall()
        tax_filters = ["fe.kind = 'invoice_tax'", "fe.usage_log_id IS NOT NULL", "fe.user_id IS NOT NULL"]
        tax_params: list[int] = []
        if company_id is not None:
            tax_filters.append("fe.company_id = ?")
            tax_params.append(company_id)
        tax_recipients_for_starts = [
            {
                "user_id": row["user_id"],
                "user_name": _user_label(row),
                "amount": int(row["amount"] or 0),
                "starts_count": int(row["starts_count"] or 0),
            }
            for row in conn.execute(
                f"""
                SELECT
                    fe.user_id,
                    u.name AS user_name,
                    u.login AS user_login,
                    SUM(ABS(fe.amount)) AS amount,
                    COUNT(DISTINCT fe.usage_log_id) AS starts_count
                FROM finance_entries fe
                LEFT JOIN users u ON u.id = fe.user_id
                WHERE {" AND ".join(tax_filters)}
                GROUP BY fe.user_id, u.name, u.login
                HAVING amount != 0
                ORDER BY amount DESC, user_name
                """,
                tax_params,
            ).fetchall()
        ]
    finally:
        conn.close()

    company_reports = [
        report
        for report in (build_company_finance_analytics(int(company["id"])) for company in companies)
        if report is not None
    ]
    company_rows = []
    starts_by_type: dict[str, dict] = {}
    totals = {
        "income": 0,
        "successful_starts": 0,
        "companies_count": len(company_reports),
        "payments_amount": 0,
        "tax_recipients_amount": sum(row["amount"] for row in tax_recipients_for_starts),
    }
    for report in company_reports:
        payments_amount = sum(row["amount"] for row in report["payments_by_user"])
        tax_amount = sum(row["amount"] for row in report["tax_recipients_for_starts"])
        commission_amount = sum(row["amount"] for row in report["commission_rows"])
        income = int(report["totals"]["income"] or 0)
        successful_starts = int(report["totals"]["successful_starts"] or 0)
        totals["income"] += income
        totals["successful_starts"] += successful_starts
        totals["payments_amount"] += payments_amount
        company_rows.append(
            {
                "company_id": report["company"]["id"],
                "company_name": report["company"]["name"],
                "income": income,
                "successful_starts": successful_starts,
                "payments_amount": payments_amount,
                "commission_amount": commission_amount,
                "tax_recipients_amount": tax_amount,
            }
        )
        for row in report["starts_by_type"]:
            node = starts_by_type.setdefault(
                row["op_type"],
                {"op_type": row["op_type"], "count": 0, "income": 0},
            )
            node["count"] += int(row["count"] or 0)
            node["income"] += int(row["income"] or 0)

    company_rows.sort(key=lambda row: row["income"], reverse=True)
    return {
        "totals": totals,
        "companies": company_rows,
        "starts_by_type": sorted(starts_by_type.values(), key=lambda row: (-row["count"], row["op_type"])),
        "tax_recipients_for_starts": tax_recipients_for_starts,
    }


def render_telegram_daily_report(report: dict) -> str:
    lines = [
        f"📊 Итоги за день: {report['date']} (МСК)",
        f"📌 Всего запусков: {report['total']}",
        f"✅ Успешно: {report['success_count']}",
        f"💰 Сумма: {report['revenue_total']} ₽",
    ]
    if report.get("failed_count", 0):
        lines.append(f"❌ Ошибки: {report['failed_count']}")
    if report.get("pending_count", 0):
        lines.append(f"⏳ В ожидании: {report['pending_count']}")

    operations = {
        op_type: item
        for op_type, item in (report.get("operations") or {}).items()
        if item.get("count", 0) > 0
    }
    if operations:
        lines.extend(["", "🔧 По типам:"])
        for op_type, item in sorted(operations.items()):
            label = OPERATION_LABELS.get(op_type, op_type)
            lines.append(f"- {label}: {item['count']} / {item['revenue']} ₽")

    companies = report.get("companies") or []
    if companies:
        lines.extend(["", "🏢 По компаниям:"])
        for item in companies[:12]:
            lines.append(
                f"- {item['company']}: ✅ {item['success']}, ❌ {item['failed']}, "
                f"⏳ {item['pending']}, 💰 {item['revenue']} ₽"
            )
    return "\n".join(lines)


def telegram_command_preview(command: str, today: date | None = None) -> dict:
    cmd = (command or "").strip().lower()
    target_day = today or datetime.now(MSK).date()
    report = build_daily_report(target_day)
    if cmd in ("/status", "status"):
        text = (
            f"Status: total {report['total']}, success {report['success_count']}, "
            f"failed {report['failed_count']}, pending {report['pending_count']}"
        )
        return {"command": command, "text": text}
    if cmd in ("/today", "today", "/report"):
        return {"command": command, "text": render_telegram_daily_report(report)}
    if cmd.startswith("/company "):
        raw_name = command.split(" ", 1)[1].strip()
        company = next(
            (item for item in report["companies"] if item["company"].lower() == raw_name.lower()),
            None,
        )
        if not company:
            return {
                "command": command,
                "text": f"Company '{raw_name}' not found for {report['date']}",
            }
        text = (
            f"{company['company']} ({report['date']}): "
            f"ok {company['success']}, fail {company['failed']}, "
            f"pending {company['pending']}, rev {company['revenue']}"
        )
        return {"command": command, "text": text}
    return {
        "command": command,
        "text": "Unknown command. Use /status, /today, /report or /company <name>",
    }
