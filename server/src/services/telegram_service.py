"""Telegram notifications for confirmed usages and daily reports."""

import json
import logging
import os
import threading
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib import parse, request

from src.repositories import usage_log_repo
from src.services import reporting_service

logger = logging.getLogger("eopp.telegram")


def _env_bool(name: str, default: bool = True) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def _get_field(record, name: str, default=None):
    if isinstance(record, dict):
        return record.get(name, default)
    return getattr(record, name, default)


def load_local_env(path: str = ".env") -> None:
    env_path = Path(path)
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def is_configured() -> bool:
    return bool(
        _env_bool("TELEGRAM_ENABLED", True)
        and os.environ.get("TELEGRAM_BOT_TOKEN")
        and os.environ.get("TELEGRAM_CHAT_ID")
    )


def parse_report_day(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("DAY must use YYYY-MM-DD format") from exc


def render_confirm_notification(record) -> str:
    op_type = _get_field(record, "op_type") or "unknown"
    op_label = reporting_service.OPERATION_LABELS.get(op_type, op_type)
    price = _get_field(record, "price")
    price_text = f"{price} ₽" if price is not None else "не указана"
    lines = [
        "✅ Подтверждено бронирование",
        f"ID лога: {_get_field(record, 'id', '-')}",
        f"Тип: {op_label}",
        f"Цена: {price_text}",
    ]
    slot_date = _get_field(record, "slot_date")
    company = _get_field(record, "company")
    fio = _get_field(record, "fio")
    vehicle_number = _get_field(record, "vehicle_number")
    if slot_date:
        lines.append(f"Дата слота: {slot_date}")
    if company:
        lines.append(f"Компания: {company}")
    if fio:
        lines.append(f"ФИО: {fio}")
    if vehicle_number:
        lines.append(f"Транспорт: {vehicle_number}")
    return "\n".join(lines)


def _send_message_sync(text: str) -> bool:
    if not is_configured():
        return False
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat_id = os.environ["TELEGRAM_CHAT_ID"]
    timeout = _env_int("TELEGRAM_TIMEOUT_SECONDS", 5)
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = parse.urlencode(
        {
            "chat_id": chat_id,
            "text": text,
            "disable_web_page_preview": "true",
        }
    ).encode("utf-8")
    req = request.Request(url, data=payload, method="POST")
    try:
        with request.urlopen(req, timeout=timeout) as response:
            body = response.read()
    except Exception:
        logger.exception("Telegram notification failed")
        return False
    try:
        data = json.loads(body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return False
    return bool(data.get("ok"))


def send_message_async(text: str) -> bool:
    if not is_configured():
        return False
    thread = threading.Thread(target=_send_message_sync, args=(text,), daemon=True)
    thread.start()
    return True


def notify_confirmed_usage(record) -> bool:
    if not record or bool(_get_field(record, "is_test", False)):
        return False
    return bool(send_message_async(render_confirm_notification(record)))


def notify_usage_by_id(usage_log_id: int, async_send: bool = True) -> bool:
    record = usage_log_repo.get_usage_log(usage_log_id)
    if not record or bool(_get_field(record, "is_test", False)):
        return False
    text = render_confirm_notification(record)
    if async_send:
        return bool(send_message_async(text))
    return _send_message_sync(text)


def send_daily_report(day=None) -> bool:
    report = reporting_service.build_daily_report(day)
    return send_message_async(reporting_service.render_telegram_daily_report(report))


def send_daily_report_sync(day=None) -> bool:
    report = reporting_service.build_daily_report(day)
    return _send_message_sync(reporting_service.render_telegram_daily_report(report))


def seconds_until_next_daily_run(now: datetime | None = None) -> int:
    hour = _env_int("TELEGRAM_DAILY_REPORT_HOUR", 12)
    minute = _env_int("TELEGRAM_DAILY_REPORT_MINUTE", 10)
    current = now or datetime.now(reporting_service.MSK)
    if current.tzinfo is None:
        current = current.replace(tzinfo=reporting_service.MSK)
    current_msk = current.astimezone(reporting_service.MSK)
    target = current_msk.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if current_msk >= target:
        target += timedelta(days=1)
    return max(0, int((target - current_msk).total_seconds()))


def start_daily_report_scheduler(stop_event: threading.Event | None = None) -> threading.Thread | None:
    if not is_configured() or not _env_bool("TELEGRAM_DAILY_REPORT_ENABLED", True):
        return None

    stopper = stop_event or threading.Event()

    def run() -> None:
        while not stopper.wait(seconds_until_next_daily_run()):
            send_daily_report()

    thread = threading.Thread(target=run, name="telegram-daily-report", daemon=True)
    thread.start()
    return thread
