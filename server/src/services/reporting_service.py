"""Daily reporting and telegram-ready text summaries."""

from datetime import UTC, date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from zoneinfo._common import ZoneInfoNotFoundError

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
