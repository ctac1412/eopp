import React from "react";
import { formatMoney } from "../../../utils/format";
import {
  getCompanyFull,
  getErrorInfo,
  getErrorToneClass,
  getFioFull,
  getOpType,
  getStatusClass,
  getStatusLabel,
  getVehicleNumberFull,
} from "./reportUtils";

function Field({ label, value, mono = false }) {
  return (
    <div>
      <div className="text-muted small">{label}</div>
      <div className={`small ${mono ? "font-monospace" : ""}`}>{value || "—"}</div>
    </div>
  );
}

function CaptchaStatus({ status }) {
  const passed = status === "passed" || status === "confirmed";
  return <span className={`badge ${passed ? "bg-success" : "bg-danger"}`}>{status || "—"}</span>;
}

export function OperationDetails({
  record,
  captchaRecords,
  captchaLoading,
  captchaError,
}) {
  const logs = Array.isArray(record.logs) ? record.logs : [];
  const errorInfo = getErrorInfo(record);

  return (
    <div className="p-3" style={{ background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
      <div className="row g-3">
        <div className="col-12 col-xl-4">
          <h6 className="mb-2">Операция</h6>
          <div className="row g-2">
            <div className="col-6"><Field label="Usage log" value={record.id} mono /></div>
            <div className="col-6"><Field label="API key" value={record.label || `#${record.api_key_id}`} /></div>
            <div className="col-6"><Field label="Тип" value={getOpType(record)} /></div>
            <div className="col-6">
              <div className="text-muted small">Статус</div>
              <span className={`badge ${getStatusClass(record.status)}`}>{getStatusLabel(record.status)}</span>
            </div>
            <div className="col-12"><Field label="Компания" value={getCompanyFull(record)} /></div>
            <div className="col-6"><Field label="ФИО" value={getFioFull(record)} /></div>
            <div className="col-6"><Field label="Машина" value={getVehicleNumberFull(record)} mono /></div>
            <div className="col-12"><Field label="Reservation ID" value={record.reservation_id} mono /></div>
            <div className="col-12"><Field label="Captcha ID" value={record.captcha_id} mono /></div>
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <h6 className="mb-2">Диагностика</h6>
          <div className="row g-2 mb-3">
            <div className="col-6">
              <div className="text-muted small">Категория</div>
              <span className={`badge ${getErrorToneClass(errorInfo)}`}>{errorInfo.label}</span>
            </div>
            <div className="col-6"><Field label="Дата слота" value={record.slot_date} /></div>
            <div className="col-6"><Field label="Pipeline step" value={errorInfo.step ? `#${errorInfo.step}` : "—"} /></div>
            <div className="col-6"><Field label="Raw stage" value={record.error_stage} /></div>
            <div className="col-12">
              <Field label="Ошибка" value={record.error_message} />
            </div>
          </div>

          <div className="mb-2 text-muted small">Captcha records</div>
          {captchaLoading && <div className="small text-muted">Загрузка капч...</div>}
          {captchaError && <div className="small text-danger">{captchaError}</div>}
          {!captchaLoading && !captchaError && captchaRecords.length === 0 && (
            <div className="small text-muted">Нет записей капч</div>
          )}
          {captchaRecords.length > 0 && (
            <div className="table-responsive">
              <table className="table table-sm table-bordered mb-0">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Статус</th>
                    <th>Ответ</th>
                    <th>Причина</th>
                  </tr>
                </thead>
                <tbody>
                  {captchaRecords.map((captcha) => (
                    <tr key={captcha.id}>
                      <td className="font-monospace small">{captcha.captcha_id}</td>
                      <td><CaptchaStatus status={captcha.status} /></td>
                      <td className="small">{captcha.correct_answer ?? "—"}</td>
                      <td className="small text-danger">{captcha.fail_reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="col-12 col-xl-4">
          <h6 className="mb-2">Биллинг</h6>
          <div className="row g-2 mb-3">
            <div className="col-4"><Field label="Цена" value={record.price != null ? formatMoney(record.price) : "—"} /></div>
            <div className="col-4"><Field label="Счет" value={record.invoice_id ? `#${record.invoice_id}` : "—"} /></div>
            <div className="col-4"><Field label="Оплата" value={record.paid === true ? "Оплачено" : "Не оплачено"} /></div>
          </div>

          <div className="mb-2 text-muted small">Config</div>
          {record.config_json ? (
            <pre className="p-2 small mb-0" style={{ maxHeight: "220px", overflow: "auto", background: "var(--bs-dark)", borderRadius: "0.375rem" }}>
              {JSON.stringify(record.config_json, null, 2)}
            </pre>
          ) : (
            <div className="small text-muted">Нет config</div>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 text-muted small">Логи</div>
        <div className="p-2 small" style={{ maxHeight: "280px", overflow: "auto", background: "var(--bs-dark)", borderRadius: "0.375rem", fontFamily: "var(--bs-font-monospace)", color: "#8b949e" }}>
          {logs.length > 0 ? logs.map((line, index) => (
            <div key={index} className="mb-1">{line}</div>
          )) : <div className="text-muted">Нет логов</div>}
        </div>
      </div>
    </div>
  );
}
