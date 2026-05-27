"""Admin routes.

HTTP adapters for admin auth, monitoring, billing, users, and captcha replay.
Business rules live in services; storage calls live behind repositories.
"""

import base64
import io
import json
import logging
import os
from datetime import datetime
from pathlib import Path

from PIL import Image

from fastapi import Request
from fastapi.responses import JSONResponse

from src.benchmark import run_benchmark_cached
from src.models import (
    AdminAuthBody,
    CaptchaLabelSaveBody,
    CompanyAliasBody,
    CompanyBillingSettingBody,
    CreateExpenseBody,
    CreateInvoiceBody,
    CreatePayoutBody,
    CreatePrepaidPackageBody,
    CreateUserBody,
    GenerateInvoiceBody,
    OpenInvoiceBody,
    PreviewPayoutBody,
    SendSelectedCaptchasBody,
    SetPayoutStatusBody,
    TariffBody,
    TelegramPreviewBody,
    TopUpPrepaidPackageBody,
    UpdateApiKeyBody,
    UpdateExpenseBody,
    UpdateInvoiceBody,
    UpdatePayoutBody,
    UpdatePrepaidPackageBody,
    UpdateUsageLogBody,
    UpdateUserBody,
)
from src.policies.access_policy import requires_admin
from src.repositories import api_key_repo, usage_log_repo

logger = logging.getLogger("eopp.admin")
from src.services import billing_service, captcha_service, reporting_service
from src.sse import get_connected_streams
from src.test_runner import get_test_stats


def admin_auth_middleware_factory(app):
    @app.middleware("http")
    async def admin_auth_middleware(request, call_next):
        path = request.url.path
        if requires_admin(request.method, path):
            token = request.headers.get("X-Admin-Token") or request.query_params.get("admin_token")
            if not token or not api_key_repo.check_admin_token(token):
                return JSONResponse(status_code=401, content={"error": "Unauthorized"})
        response = await call_next(request)
        return response

    return admin_auth_middleware


def _json_result(result):
    status, content = result
    return JSONResponse(status_code=status, content=content)


def _tail_lines(path: Path, limit: int) -> list[str]:
    if limit <= 0:
        return []
    with path.open("r", encoding="utf-8", errors="replace") as file:
        return file.readlines()[-limit:]


def register_admin_routes(app):
    @app.post("/admin/auth")
    async def admin_auth(body: AdminAuthBody):
        if api_key_repo.check_admin_token(body.token):
            return JSONResponse(content={"ok": True})
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    @app.get("/admin/streams")
    async def admin_streams():
        return JSONResponse(content=get_connected_streams())

    @app.get("/admin/test-stats")
    async def admin_test_stats():
        return JSONResponse(content=get_test_stats())

    @app.get("/admin/backend-logs")
    async def admin_backend_logs(lines: int = 300):
        limit = max(1, min(lines, 1000))
        raw_path = os.environ.get("EOPP_BACKEND_LOG_PATH", "data/backend.log")
        log_path = Path(raw_path)
        if not log_path.exists():
            return JSONResponse(
                status_code=404,
                content={
                    "error": "log_file_not_found",
                    "path": str(log_path),
                    "lines": [],
                },
            )
        return JSONResponse(
            content={
                "path": str(log_path),
                "limit": limit,
                "lines": [line.rstrip("\n") for line in _tail_lines(log_path, limit)],
            }
        )

    @app.post("/admin/benchmark")
    async def admin_benchmark():
        return JSONResponse(content=run_benchmark_cached())

    @app.get("/admin/daily-report")
    async def admin_daily_report(day: str | None = None):
        parsed_day = None
        if day:
            try:
                parsed_day = datetime.fromisoformat(day).date()
            except ValueError:
                return JSONResponse(
                    status_code=400, content={"error": "invalid day format, expected YYYY-MM-DD"}
                )
        report = reporting_service.build_daily_report(parsed_day)
        return JSONResponse(content=report)

    @app.get("/admin/daily-report-text")
    async def admin_daily_report_text(day: str | None = None):
        parsed_day = None
        if day:
            try:
                parsed_day = datetime.fromisoformat(day).date()
            except ValueError:
                return JSONResponse(
                    status_code=400, content={"error": "invalid day format, expected YYYY-MM-DD"}
                )
        report = reporting_service.build_daily_report(parsed_day)
        return JSONResponse(
            content={
                "text": reporting_service.render_telegram_daily_report(report),
                "report": report,
            }
        )

    @app.post("/admin/telegram/preview")
    async def admin_telegram_preview(body: TelegramPreviewBody):
        return JSONResponse(content=reporting_service.telegram_command_preview(body.command))

    @app.get("/admin/captcha-label/{captcha_id}")
    async def admin_captcha_label_by_id(captcha_id: str):
        result = captcha_service.read_label_captcha(captcha_id)
        if not result:
            return JSONResponse(status_code=404, content={"error": "captcha not found"})
        return JSONResponse(content=result)

    @app.post("/admin/captcha-label/save")
    async def admin_captcha_label_save(body: CaptchaLabelSaveBody):
        status, content = captcha_service.save_captcha_label(body.captcha_id, body.variant_index)
        return JSONResponse(status_code=status, content=content)

    @app.get("/admin/tariffs/{api_key_id}")
    async def get_admin_tariff(api_key_id: int):
        return _json_result(billing_service.get_tariff(api_key_id))

    @app.put("/admin/tariffs/{api_key_id}")
    async def create_update_tariff(api_key_id: int, body: TariffBody):
        return _json_result(billing_service.upsert_tariff(api_key_id, body))

    @app.delete("/admin/tariffs/{api_key_id}")
    async def delete_admin_tariff(api_key_id: int):
        return _json_result(billing_service.delete_tariff(api_key_id))

    @app.patch("/admin/api-keys/{id}")
    async def update_api_key(id: int, body: UpdateApiKeyBody):
        return _json_result(billing_service.update_api_key(id, body))

    @app.patch("/admin/usage-log/{id}")
    async def update_admin_usage_log(id: int, body: UpdateUsageLogBody):
        return _json_result(billing_service.update_usage_log(id, body))

    @app.post("/admin/generate-invoice")
    async def generate_invoice(body: GenerateInvoiceBody):
        return _json_result(billing_service.generate_invoice(body))

    @app.get("/admin/invoices")
    async def list_admin_invoices():
        return _json_result(billing_service.list_invoices())

    @app.post("/admin/invoices")
    async def create_admin_invoice(body: CreateInvoiceBody):
        return _json_result(billing_service.create_invoice(body))

    @app.patch("/admin/invoices/{id}")
    async def update_admin_invoice(id: int, body: UpdateInvoiceBody):
        return _json_result(billing_service.update_invoice(id, body))

    @app.delete("/admin/invoices/{id}")
    async def delete_admin_invoice(id: int):
        return _json_result(billing_service.delete_invoice(id))

    @app.post("/admin/open-invoices/ensure")
    async def ensure_admin_open_invoice(body: OpenInvoiceBody):
        return _json_result(billing_service.ensure_open_invoice(body.company))

    @app.post("/admin/auto-invoices/open")
    async def open_admin_auto_invoice(body: OpenInvoiceBody):
        return _json_result(billing_service.ensure_open_invoice(body.company))

    @app.post("/admin/open-invoices/issue")
    async def issue_admin_open_invoice(body: OpenInvoiceBody):
        return _json_result(billing_service.issue_open_invoice(body.company, body.comment))

    @app.get("/admin/company-billing-settings")
    async def list_admin_company_billing_settings():
        return _json_result(billing_service.list_company_billing_settings())

    @app.put("/admin/company-billing-settings/{company}")
    async def update_admin_company_billing_settings(company: str, body: CompanyBillingSettingBody):
        return _json_result(billing_service.update_company_billing_settings(company, body))

    @app.get("/admin/company-aliases")
    async def list_admin_company_aliases():
        return _json_result(billing_service.list_company_aliases())

    @app.post("/admin/company-aliases")
    async def upsert_admin_company_alias(body: CompanyAliasBody):
        return _json_result(billing_service.upsert_company_alias(body))

    @app.delete("/admin/company-aliases/{alias}")
    async def delete_admin_company_alias(alias: str):
        return _json_result(billing_service.delete_company_alias(alias))

    @app.get("/admin/expenses")
    async def list_admin_expenses():
        return _json_result(billing_service.list_expenses())

    @app.post("/admin/expenses")
    async def create_admin_expense(body: CreateExpenseBody):
        return _json_result(billing_service.create_expense(body))

    @app.put("/admin/expenses/{id}")
    async def update_admin_expense(id: int, body: UpdateExpenseBody):
        return _json_result(billing_service.update_expense(id, body))

    @app.delete("/admin/expenses/{id}")
    async def delete_admin_expense(id: int):
        return _json_result(billing_service.delete_expense(id))

    @app.get("/admin/payouts")
    async def list_admin_payouts():
        return _json_result(billing_service.list_payouts())

    @app.post("/admin/payouts/preview")
    async def preview_admin_payout(body: PreviewPayoutBody):
        return _json_result(billing_service.preview_payout(body))

    @app.get("/admin/payouts/available")
    async def get_available_resources():
        return _json_result(billing_service.available_resources())

    @app.post("/admin/payouts")
    async def create_admin_payout(body: CreatePayoutBody):
        return _json_result(billing_service.create_payout(body))

    @app.put("/admin/payouts/{id}")
    async def update_admin_payout(id: int, body: UpdatePayoutBody):
        return _json_result(billing_service.update_payout(id, body))

    @app.patch("/admin/payouts/{id}")
    async def set_admin_payout_status(id: int, body: SetPayoutStatusBody):
        return _json_result(billing_service.set_payout_status(id, body))

    @app.delete("/admin/payouts/{id}")
    async def delete_admin_payout(id: int):
        return _json_result(billing_service.delete_payout(id))

    @app.post("/admin/payouts/{id}/recalculate")
    async def recalculate_admin_payout(id: int, body: CreatePayoutBody):
        return _json_result(billing_service.recalculate_payout(id, body))

    @app.get("/admin/users")
    async def list_admin_users():
        return _json_result(billing_service.list_users())

    @app.post("/admin/users")
    async def create_admin_user(body: CreateUserBody):
        return _json_result(billing_service.create_user(body))

    @app.put("/admin/users/{id}")
    async def update_admin_user(id: int, body: UpdateUserBody):
        return _json_result(billing_service.update_user(id, body))

    @app.delete("/admin/users/{id}")
    async def delete_admin_user(id: int):
        return _json_result(billing_service.delete_user(id))

    @app.get("/admin/prepaid-packages")
    async def list_admin_prepaid_packages():
        return _json_result(billing_service.list_prepaid_packages())

    @app.post("/admin/prepaid-packages")
    async def create_admin_prepaid_package(body: CreatePrepaidPackageBody):
        return _json_result(billing_service.create_prepaid_package(body))

    @app.patch("/admin/prepaid-packages/{id}")
    async def update_admin_prepaid_package(id: int, body: UpdatePrepaidPackageBody):
        return _json_result(billing_service.update_prepaid_package(id, body))

    @app.delete("/admin/prepaid-packages/{id}")
    async def delete_admin_prepaid_package(id: int):
        return _json_result(billing_service.delete_prepaid_package(id))

    @app.post("/admin/prepaid-packages/{id}/top-up")
    async def top_up_admin_prepaid_package(id: int, body: TopUpPrepaidPackageBody):
        return _json_result(billing_service.top_up_prepaid_package(id, body))

    @app.get("/admin/prepaid-deductions")
    async def list_admin_prepaid_deductions(
        package_id: int | None = None, api_key_id: int | None = None
    ):
        return _json_result(billing_service.list_prepaid_deductions(package_id, api_key_id))

    @app.post("/admin/captchas/send-selected")
    async def send_selected_captchas(body: SendSelectedCaptchasBody):
        if not body.captcha_ids:
            return JSONResponse(status_code=400, content={"error": "Нет выбранных капч"})
        sent = captcha_service.replay_captchas(body.captcha_ids)
        if sent is None:
            return JSONResponse(status_code=400, content={"error": "Нет активных SSE подключений"})
        return JSONResponse(content={"sent": sent})

    @app.get("/admin/captchas")
    async def list_admin_captchas(
        status: str | None = None,
        api_key_id: int | None = None,
    ):
        from src.db.captchas import list_captchas

        rows = list_captchas()
        result = []
        for r in rows:
            if status and r["status"] != status:
                continue
            ul = usage_log_repo.get_usage_log(r["usage_log_id"])
            if api_key_id:
                if not ul or ul["api_key_id"] != api_key_id:
                    continue
            key_label = None
            if ul:
                key_info = api_key_repo.get_key_by_id(ul["api_key_id"])
                if key_info:
                    key_label = key_info.label
            entry = dict(r)
            entry["key_label"] = key_label
            entry["api_key_id"] = ul["api_key_id"] if ul else None
            result.append(entry)
        return JSONResponse(content=result)

    @app.get("/admin/captcha-files")
    async def list_admin_captcha_files():
        from src.services import captcha_file_service

        captcha_file_service.sync_captcha_files()
        return JSONResponse(content=captcha_file_service.list_captcha_files())

    @app.get("/admin/captcha-files/{captcha_id}/thumbnail")
    async def admin_captcha_thumbnail(captcha_id: str, mode: str | None = None):
        from fastapi.responses import Response
        from src.services import captcha_file_service
        from src.captcha_assembly import get_valid_variant_index

        data = captcha_file_service.load_captcha_payload(captcha_id)
        if data is None:
            return Response(status_code=404, content="Not found")

        vi = get_valid_variant_index(data)
        if mode == "solver_top1" and vi is None:
            if captcha_file_service.ensure_analysis_metadata(data):
                source_path = captcha_file_service.captcha_file_path(captcha_id)
                captcha_file_service.write_captcha_json(source_path, data)
                captcha_file_service.upsert_captcha_file_data(source_path, data, captcha_id)
            top3 = data.get("solver_top3")
            if isinstance(top3, list) and top3 and isinstance(top3[0], int):
                vi = top3[0]
        if vi is None:
            return Response(status_code=404, content="No valid_index")

        puzzle = data.get("puzzle", data)
        variants = puzzle.get("variantsCapture", [])
        tiles = puzzle.get("tiles", [])

        if vi < 0 or vi >= len(variants):
            return Response(status_code=404, content="Invalid variant index")

        tile_map = {}
        for t in tiles:
            try:
                img = Image.open(io.BytesIO(base64.b64decode(t["imageData"]))).convert("RGBA")
                tile_map[t["tileId"]] = img
            except Exception:
                pass

        tile_ids = variants[vi]
        images = [tile_map[tid] for tid in tile_ids if tid in tile_map]
        if len(images) != len(tile_ids):
            return Response(status_code=500, content="Tile assembly failed")

        w, h = images[0].size
        cols = min(len(images), 3)
        rows = (len(images) + cols - 1) // cols
        canvas = Image.new("RGBA", (w * cols, h * rows), (255, 255, 255, 255))
        for i, img in enumerate(images):
            r = i // cols
            c = i % cols
            canvas.paste(img, (c * w, r * h))

        buf = io.BytesIO()
        canvas.save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png")

    @app.post("/admin/captcha-files/backfill-valid-index")
    async def admin_backfill_valid_index():
        from src.services import captcha_file_service

        result = captcha_file_service.backfill_valid_index_from_logs()
        return JSONResponse(content=result)

    @app.post("/admin/captcha-files/backfill-analysis-metadata")
    async def admin_backfill_analysis_metadata():
        from src.services import captcha_file_service

        result = captcha_file_service.backfill_analysis_metadata()
        return JSONResponse(content=result)

    @app.post("/admin/captcha-files/backfill-dates")
    async def admin_backfill_dates():
        from src.services import captcha_file_service

        result = captcha_file_service.backfill_captcha_dates()
        return JSONResponse(content=result)

    @app.put("/admin/captcha-files/{captcha_id}/classification")
    async def admin_set_classification(captcha_id: str, body: dict):
        from src.repositories import captcha_file_repo

        classification = body.get("classification")
        if classification not in ("digit", "puzzle", "figures", None):
            raise HTTPException(400, "classification must be 'digit', 'puzzle', 'figures', or null")
        ok = captcha_file_repo.update_classification(captcha_id, classification)
        if not ok:
            raise HTTPException(404, "Captcha file not found")
        return JSONResponse(content={"captcha_id": captcha_id, "classification": classification})

    @app.get("/admin/ai/models")
    async def admin_ai_models():
        """List available trained models."""
        from src.captcha_solver_engine.train import list_models
        return JSONResponse(content=list_models())

    @app.get("/admin/ai/runs")
    async def admin_ai_runs():
        """Get history of classification runs."""
        from src.db.connection import get_connection
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM classification_runs ORDER BY created_at DESC LIMIT 10"
        ).fetchall()
        conn.close()
        return JSONResponse(content=[dict(r) for r in rows])

    @app.post("/admin/ai/classify")
    async def admin_ai_classify(body: dict):
        """Run classifier on all captchas, return results with Top-1 previews."""
        from src.services import captcha_file_service
        from src.captcha_solver_engine.classifier import ChainClassifier
        from src.captcha_solver_engine.digit_classifier import DigitCaptchaClassifier
        from src.captcha_solver_engine.figures_classifier import FigureCaptchaClassifier
        from src.captcha_solver_engine.common import build_captcha_context
        from src.captcha_solver_engine.solvers import solver_for_classification
        from src.captcha_assembly import get_valid_variant_index
        from src.db.connection import get_connection
        import time
        import numpy as np

        classifier_type = body.get("classifier", "chain")
        gt_only = body.get("gt_only")  # filter captchas by ground truth class

        # Select classifier
        if classifier_type == "figures":
            clf = FigureCaptchaClassifier()
            model_name = "figures"; model_version = 0
        elif classifier_type == "digits":
            model_name = body.get("model_name", "hog_svm")
            model_version = body.get("model_version", 1)
            from src.captcha_solver_engine import digit_classifier as dc_mod
            from src.captcha_solver_engine.train import MODELS_DIR
            model_path = os.path.join(MODELS_DIR, f"{model_name}_v{model_version}.pkl")
            if os.path.exists(model_path):
                import pickle
                with open(model_path, "rb") as f:
                    dc_mod._model_cache = pickle.load(f)
            clf = DigitCaptchaClassifier()
        else:
            clf = ChainClassifier()
            model_name = "chain"; model_version = 0

        captcha_file_service.sync_captcha_files()
        all_files = captcha_file_service.list_captcha_files()

        results = []

        for cf in all_files:
            cid = cf["captcha_id"]

            # Filter by ground truth if requested
            if gt_only and cf.get("classification") != gt_only:
                continue

            data = captcha_file_service.load_captcha_payload(cid)
            if data is None:
                continue

            context = build_captcha_context(data)

            t0 = time.perf_counter()
            classification = clf.classify(context)
            elapsed = time.perf_counter() - t0

            # Run solver to check Top-1 accuracy (optional)
            solver_top1_match = None
            solver_name = None
            if body.get("check_solver"):
                try:
                    solver = solver_for_classification(classification)
                    solver_output = solver.solve(context, classification, edge_trim=3, verbose=False)
                    vi = get_valid_variant_index(data)
                    solver_top1_match = (solver_output.best_variant == vi) if vi is not None else None
                    solver_name = solver_output.solver_name
                except Exception as e:
                    solver_name = f"error: {e}"

            # Generate Top-1 preview
            puzzle = data.get("puzzle", data)
            variants = puzzle.get("variantsCapture", [])
            tiles = puzzle.get("tiles", [])
            vi = get_valid_variant_index(data)
            if vi is None:
                top3 = data.get("solver_top3")
                if isinstance(top3, list) and top3 and isinstance(top3[0], int):
                    vi = top3[0]

            preview_b64 = None
            if vi is not None and vi < len(variants):
                tile_ids = variants[vi]
                tile_map = {}
                for t in tiles:
                    try:
                        img = Image.open(io.BytesIO(base64.b64decode(t["imageData"]))).convert("RGBA")
                        tile_map[t["tileId"]] = img
                    except Exception:
                        pass
                images = [tile_map[tid] for tid in tile_ids if tid in tile_map]
                if len(images) == len(tile_ids):
                    w, h = images[0].size
                    cols = min(len(images), 3)
                    rows = (len(images) + cols - 1) // cols
                    canvas = Image.new("RGBA", (w * cols, h * rows), (255, 255, 255, 255))
                    for i, img in enumerate(images):
                        r = i // cols
                        c = i % cols
                        canvas.paste(img, (c * w, r * h))
                    buf = io.BytesIO()
                    canvas.save(buf, format="PNG")
                    preview_b64 = base64.b64encode(buf.getvalue()).decode()

            results.append({
                "captcha_id": cid,
                "kind": classification.kind,
                "confidence": round(classification.confidence, 3),
                "details": classification.details,
                "time_s": round(elapsed, 4),
                "preview": preview_b64,
                "ground_truth": cf.get("classification"),
                "solver_top1_match": solver_top1_match,
                "solver_name": solver_name,
            })

        digit_count = sum(1 for r in results if r["kind"] == "digit")
        figure_count = sum(1 for r in results if r["kind"] == "figures")
        puzzle_count = sum(1 for r in results if r["kind"] == "default")
        times = [r["time_s"] for r in results]

        # Compute stats vs ground truth
        tp = fp = fn = tn = 0
        for r in results:
            gt = r["ground_truth"]
            is_digit = r["kind"] == "digit"
            if gt == "digit" and is_digit:
                tp += 1
            elif gt == "digit" and not is_digit:
                fn += 1
            elif gt and gt != "digit" and is_digit:
                fp += 1
            elif gt and gt != "digit" and not is_digit:
                tn += 1

        total_l = tp + tn + fp + fn
        accuracy = (tp + tn) / max(total_l, 1)
        precision = tp / max(tp + fp, 1)
        recall = tp / max(tp + fn, 1)
        f1_val = 2 * precision * recall / max(precision + recall, 0.001) if (precision + recall) > 0 else 0.0

        # Save stats to DB
        try:
            conn = get_connection()
            conn.execute(
                """INSERT INTO classification_runs
                   (model_name, model_version, total, figure_found, digit_found, puzzle_found,
                    true_positives, false_positives, false_negatives, true_negatives,
                    accuracy, precision, recall, f1, speed_avg, speed_median,
                    solver_top1_hits, solver_top1_total)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (model_name, model_version, len(results), figure_count, digit_count,
                 puzzle_count, tp, fp, fn, tn,
                 round(accuracy, 4), round(precision, 4), round(recall, 4), round(f1_val, 4),
                 round(float(np.mean(times)), 4), round(float(np.median(times)), 4),
                 sum(1 for r in results if r.get("solver_top1_match") is True),
                 sum(1 for r in results if r.get("solver_top1_match") is not None)),
            )
            conn.commit()
            conn.close()
        except Exception:
            pass

        return JSONResponse(content={
            "total": len(results),
            "figure_count": figure_count,
            "digit_count": digit_count,
            "puzzle_count": puzzle_count,
            "speed": {
                "avg": round(float(np.mean(times)), 4),
                "median": round(float(np.median(times)), 4),
                "max": round(float(np.max(times)), 4),
            },
            "stats": {"tp": tp, "fp": fp, "fn": fn, "tn": tn,
                      "accuracy": round(accuracy, 3), "precision": round(precision, 3),
                      "recall": round(recall, 3), "f1": round(f1_val, 3)},
            "results": results,
        })

    @app.post("/admin/slots-group/clear")
    async def admin_slots_group_clear():
        from src.services.slots_group_service import clear as slots_clear

        return JSONResponse(content=slots_clear())

    @app.get("/admin/stream/slots")
    async def admin_slots_stream(request: Request, admin_token: str | None = None):
        from fastapi.responses import StreamingResponse

        from src.services.slots_group_service import get_events_since, stats

        if not admin_token or not api_key_repo.check_admin_token(admin_token):
            return JSONResponse(status_code=401, content={"error": "Unauthorized"})

        async def event_generator():
            import asyncio
            import time
            import uuid

            stream_id = uuid.uuid4().hex[:8]
            client = request.client.host if request.client else "unknown"
            last_index = 0
            last_heartbeat_at = 0.0
            heartbeat_interval = 15.0
            logger.warning("slots stream open id=%s client=%s", stream_id, client)
            yield "retry: 2000\n\n"
            try:
                while True:
                    events, last_index = get_events_since(last_index)
                    if events:
                        payload = {
                            "type": "events",
                            "events": events,
                            "stats": stats(),
                        }
                        yield f"data: {json.dumps(payload)}\n\n"
                        last_heartbeat_at = time.monotonic()
                    elif time.monotonic() - last_heartbeat_at >= heartbeat_interval:
                        yield f": ping {int(time.time())}\n\n"
                        last_heartbeat_at = time.monotonic()
                    await asyncio.sleep(1)
            except asyncio.CancelledError:
                logger.warning("slots stream cancelled id=%s client=%s", stream_id, client)
                raise
            except Exception:
                logger.exception("slots stream crashed id=%s client=%s", stream_id, client)
                raise
            finally:
                logger.warning("slots stream closed id=%s client=%s", stream_id, client)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
