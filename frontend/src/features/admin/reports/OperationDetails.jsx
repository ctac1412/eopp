import React from "react";
import { formatMoney } from "../../../utils/format";
import { Button, DataTable, StatusTag } from "../../../ui";
import { CaptchaReviewModal } from "../../../components/admin/CaptchaReviewModal";
import {
  getCompanyFull,
  getErrorInfo,
  getErrorTagColor,
  getFioFull,
  getOpType,
  getStatusLabel,
  getVehicleNumberFull,
} from "./reportUtils";

function formatDuration(durationMs) {
  if (durationMs == null) return "—";
  if (durationMs < 1000) return `${durationMs} мс`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)} с`;
  const mins = Math.floor(durationMs / 60000);
  const secs = ((durationMs % 60000) / 1000).toFixed(1);
  return `${mins}м ${secs}с`;
}

function Field({ label, value, mono = false }) {
  return (
    <div className="operation-details__field">
      <span>{label}</span>
      <strong className={mono ? "font-monospace" : ""}>{value || "—"}</strong>
      <CaptchaReviewModal
        captcha={reviewCaptcha}
        open={!!reviewCaptcha}
        onClose={() => setReviewCaptcha(null)}
      />
    </div>
  );
}

function CaptchaStatus({ status }) {
  const passed = status === "passed" || status === "confirmed";
  return <StatusTag status={passed ? "confirmed" : "failed"} label={status || "—"} />;
}

export function OperationDetails({
  record,
  captchaRecords,
  captchaLoading,
  captchaError,
}) {
  const [reviewCaptcha, setReviewCaptcha] = React.useState(null);
  const logs = Array.isArray(record.logs) ? record.logs : [];
  const errorInfo = getErrorInfo(record);

  const captchaColumns = [
    {
      title: "ID",
      dataIndex: "captcha_id",
      width: 160,
      ellipsis: true,
      render: (value) => <span className="font-monospace" title={value}>{value}</span>,
    },
    {
      title: "Статус",
      dataIndex: "status",
      width: 96,
      align: "center",
      render: (value) => <CaptchaStatus status={value} />,
    },
    {
      title: "Время",
      dataIndex: "duration_ms",
      width: 92,
      align: "right",
      render: formatDuration,
    },
    {
      title: "Ответ",
      dataIndex: "correct_answer",
      width: 80,
      align: "center",
      render: (value) => value ?? "—",
    },
    {
      title: "Причина",
      dataIndex: "fail_reason",
      ellipsis: true,
      render: (value) => <span title={value || "—"}>{value || "—"}</span>,
    },
    {
      title: "Операторы",
      dataIndex: "operator_names",
      width: 150,
      render: (value) => Array.isArray(value) && value.length ? value.join(", ") : "—",
    },
    {
      title: "",
      width: 92,
      align: "center",
      render: (_, row) => (
        <Button size="small" onClick={() => setReviewCaptcha(row)}>
          Отсмотр
        </Button>
      ),
    },
  ];

  return (
    <div data-eopp-component="OperationDetails" className="operation-details">
      <div className="operation-details__grid">
        <section className="operation-details__panel">
          <h3>Операция</h3>
          <div className="operation-details__fields">
            <Field label="Usage log" value={record.id} mono />
            <Field label="API key" value={record.label || `#${record.api_key_id}`} />
            <Field label="Тип" value={getOpType(record)} />
            <div className="operation-details__field">
              <span>Статус</span>
              <StatusTag status={record.status} label={getStatusLabel(record.status)} />
            </div>
            <Field label="Компания" value={getCompanyFull(record)} />
            <Field label="ФИО" value={getFioFull(record)} />
            <Field label="Машина" value={getVehicleNumberFull(record)} mono />
            <Field label="Reservation ID" value={record.reservation_id} mono />
            <Field label="Captcha ID" value={record.captcha_id} mono />
          </div>
        </section>

        <section className="operation-details__panel">
          <h3>Диагностика</h3>
          <div className="operation-details__fields">
            <div className="operation-details__field">
              <span>Категория</span>
              <StatusTag
                status="failed"
                label={errorInfo.label}
                color={getErrorTagColor(errorInfo)}
              />
            </div>
            <Field label="Дата слота" value={record.slot_date} />
            <Field label="Pipeline step" value={errorInfo.step ? `#${errorInfo.step}` : "—"} />
            <Field label="Raw stage" value={record.error_stage} />
            <Field label="Ошибка" value={record.error_message} />
          </div>

          <div className="operation-details__subhead">Captcha records</div>
          <DataTable
            className="operation-details__table"
            rowKey="id"
            data={captchaRecords}
            columns={captchaColumns}
            loading={captchaLoading}
            error={captchaError}
            emptyText="Нет записей капч"
            pagination={false}
            scroll={{ x: 560, y: 180 }}
          />
        </section>

        <section className="operation-details__panel">
          <h3>Биллинг</h3>
          <div className="operation-details__fields operation-details__fields--three">
            <Field label="Цена" value={record.price != null ? formatMoney(record.price) : "—"} />
            <Field label="Счет" value={record.invoice_id ? `#${record.invoice_id}` : "—"} />
            <Field label="Оплата" value={record.paid === true ? "Оплачено" : "Не оплачено"} />
          </div>

          <div className="operation-details__subhead">Config</div>
          <pre className="operation-details__code">
            {record.config_json ? JSON.stringify(record.config_json, null, 2) : "Нет config"}
          </pre>
        </section>
      </div>

      <section className="operation-details__panel operation-details__panel--logs">
        <h3>Логи</h3>
        <div className="operation-details__log">
          {logs.length > 0 ? logs.map((line, index) => (
            <div key={index}>{line}</div>
          )) : <div className="text-muted">Нет логов</div>}
        </div>
      </section>
    </div>
  );
}
