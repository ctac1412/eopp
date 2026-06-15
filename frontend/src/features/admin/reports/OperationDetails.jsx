import React from "react";
import { Tabs } from "antd";
import { formatMoney } from "../../../utils/format";
import { Button, DataTable, StatusTag } from "../../../ui";
import { CaptchaReviewModal } from "../captchas/CaptchaReviewModal";
import { editStateLabel, financeKindLabel } from "../finance/financeFormat";
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
  if (durationMs == null) return "-";
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
      <strong className={mono ? "font-monospace" : ""}>{value || "-"}</strong>
    </div>
  );
}

function CaptchaStatus({ status }) {
  const passed = status === "passed" || status === "confirmed";
  return <StatusTag status={passed ? "confirmed" : "failed"} label={status || "-"} />;
}

function getExecutorLabel(record) {
  return record.executor_name
    || record.executor
    || record.executor_label
    || record.label
    || (record.api_key_id ? `#${record.api_key_id}` : "-");
}

function getCaptchaOperators(captchaRecords) {
  const names = [];
  captchaRecords.forEach((captcha) => {
    if (!Array.isArray(captcha.operator_names)) return;
    captcha.operator_names.forEach((name) => {
      if (name && !names.includes(name)) names.push(name);
    });
  });
  return names.length ? names.join(", ") : "-";
}

function getFinanceUser(row) {
  return row.user_name || row.user || row.name || (row.user_id ? `#${row.user_id}` : "-");
}

function OperationTypeTag({ record }) {
  const opType = getOpType(record);
  const status = record.op_type === "create" ? "create" : record.op_type === "reschedule" ? "reschedule" : "neutral";
  return <StatusTag status={status} label={opType} />;
}

function getFinanceSummary(entries) {
  const payoutsByUser = new Map();
  const total = entries.reduce((acc, row) => acc + Number(row.amount || 0), 0);
  entries.forEach((row) => {
    const amount = Number(row.amount || 0);
    if (!row.user_id || amount >= 0) return;
    const key = String(row.user_id);
    const current = payoutsByUser.get(key) || {
      user: getFinanceUser(row),
      amount: 0,
    };
    current.amount += Math.abs(amount);
    payoutsByUser.set(key, current);
  });
  return {
    total,
    payouts: [...payoutsByUser.values()].sort((a, b) => b.amount - a.amount),
  };
}

export function OperationDetails({
  record,
  captchaRecords,
  captchaLoading,
  captchaError,
  financeEntries = [],
  financeLoading = false,
  financeError = null,
  onRecalculateFinance,
}) {
  const [reviewCaptcha, setReviewCaptcha] = React.useState(null);
  const logs = Array.isArray(record.logs) ? record.logs : [];
  const errorInfo = getErrorInfo(record);
  const captchaOperators = getCaptchaOperators(captchaRecords);
  const financeSummary = getFinanceSummary(financeEntries);

  const captchaColumns = [
    {
      title: "ID",
      dataIndex: "captcha_id",
      width: 96,
      ellipsis: true,
      render: (value) => <span className="font-monospace" title={value}>{value}</span>,
    },
    {
      title: "Ст",
      dataIndex: "status",
      width: 58,
      align: "center",
      render: (value) => <CaptchaStatus status={value} />,
    },
    {
      title: "Время",
      dataIndex: "duration_ms",
      width: 62,
      align: "right",
      render: formatDuration,
    },
    {
      title: "Операторы",
      dataIndex: "operator_names",
      width: 92,
      ellipsis: true,
      render: (value) => Array.isArray(value) && value.length ? value.join(", ") : "-",
    },
  ];

  const financeColumns = [
    {
      title: "Тип",
      dataIndex: "kind",
      width: 92,
      ellipsis: true,
      render: (value) => <span title={financeKindLabel(value)}>{financeKindLabel(value)}</span>,
    },
    {
      title: "Сумма",
      dataIndex: "amount",
      width: 58,
      align: "right",
      render: (value) => formatMoney(value),
    },
    {
      title: "Исп.",
      width: 48,
      ellipsis: true,
      render: (_, row) => <span title={getFinanceUser(row)}>{getFinanceUser(row)}</span>,
    },
    {
      title: "Ст.",
      dataIndex: "edit_state",
      width: 52,
      ellipsis: true,
      render: (value) => <span title={editStateLabel(value)}>{editStateLabel(value)}</span>,
    },
  ];

  const techTabs = [
    {
      key: "config",
      label: "Config",
      children: (
        <pre className="operation-details__code">
          {record.config_json ? JSON.stringify(record.config_json, null, 2) : "Нет config"}
        </pre>
      ),
    },
    {
      key: "logs",
      label: `Тех. логи${logs.length ? ` (${logs.length})` : ""}`,
      children: (
        <div className="operation-details__log">
          {logs.length > 0 ? logs.map((line, index) => (
            <div key={index}>{line}</div>
          )) : <div className="text-muted">Нет логов</div>}
        </div>
      ),
    },
  ];

  return (
    <div data-eopp-component="OperationDetails" className="operation-details">
      <section className="operation-details__panel operation-details__panel--primary">
        <div className="operation-details__price">
          <span>Цена</span>
          <strong>{record.price != null ? formatMoney(record.price) : "-"}</strong>
          <StatusTag
            status={record.paid === true ? "confirmed" : "failed"}
            label={record.paid === true ? "Оплачено" : "Не оплачено"}
          />
        </div>
        <div className="operation-details__fields operation-details__fields--billing">
          <Field label="Свои" value={record.has_custom_slots ? "Да" : "-"} />
          <Field label="Счет" value={record.invoice_id ? `#${record.invoice_id}` : "-"} />
          <div className="operation-details__field">
            <span>Тип</span>
            <OperationTypeTag record={record} />
          </div>
          <div className="operation-details__field">
            <span>Статус</span>
            <StatusTag status={record.status} label={getStatusLabel(record.status)} />
          </div>
          <Field label="Исполнитель" value={getExecutorLabel(record)} />
          <Field label="Операторы капчи" value={captchaOperators} />
        </div>
      </section>

      <section className="operation-details__panel">
        <h3>Капчи</h3>
        <DataTable
          className="operation-details__table operation-details__table--captchas"
          rowKey="id"
          data={captchaRecords}
          columns={captchaColumns}
          loading={captchaLoading}
          error={captchaError}
          emptyText="Нет записей капч"
          pagination={false}
          scroll={captchaRecords.length > 3 ? { y: 118 } : false}
          onRow={(row) => ({
            onDoubleClick: () => setReviewCaptcha(row),
          })}
        />
      </section>

      <section className="operation-details__panel operation-details__panel--finance-report">
        <div className="operation-details__panel-head">
          <h3>{`\u0424\u0438\u043d. \u043e\u0442\u0447\u0435\u0442${financeEntries.length ? ` (${financeEntries.length})` : ""}`}</h3>
          <Button
            size="small"
            onClick={onRecalculateFinance}
            disabled={financeLoading || !onRecalculateFinance}
            title="Пересчитать автоматические строки фин. отчета по текущей цене"
          >
            Обновить
          </Button>
        </div>
        <div className="operation-details__finance-summary">
          <div className="operation-details__finance-total">
            <span>Итого</span>
            <strong>{formatMoney(financeSummary.total)}</strong>
          </div>
          <div className="operation-details__finance-payouts">
            <span>К выплате</span>
            <div>
              {financeSummary.payouts.length ? financeSummary.payouts.map((item) => (
                <strong key={item.user} title={`${item.user}: ${formatMoney(item.amount)}`}>
                  {item.user} {formatMoney(item.amount)}
                </strong>
              )) : <em>-</em>}
            </div>
          </div>
        </div>
        <DataTable
          className="operation-details__table operation-details__table--finance"
          rowKey="id"
          data={financeEntries}
          columns={financeColumns}
          loading={financeLoading}
          error={financeError}
          emptyText="Нет строк фин. отчета"
          pagination={false}
          tableLayout="fixed"
          scroll={financeEntries.length > 4 ? { y: 148 } : false}
        />
      </section>

      <div className="operation-details__grid">
        <section className="operation-details__panel">
          <h3>Общая инфа</h3>
          <div className="operation-details__fields operation-details__fields--dense">
            <Field label="Usage log" value={record.id} mono />
            <Field label="Исполнитель" value={getExecutorLabel(record)} />
            <Field label="Компания" value={getCompanyFull(record)} />
            <Field label="ФИО" value={getFioFull(record)} />
            <Field label="Машина" value={getVehicleNumberFull(record)} mono />
            <Field label="Reservation ID" value={record.reservation_id} mono />
            <Field label="Captcha ID" value={record.captcha_id} mono />
            <Field label="Дата слота" value={record.slot_date} />
          </div>
        </section>

        <section className="operation-details__panel">
          <h3>Диагностика</h3>
          <div className="operation-details__fields operation-details__fields--dense">
            <div className="operation-details__field">
              <span>Категория</span>
              <StatusTag
                status="failed"
                label={errorInfo.label}
                color={getErrorTagColor(errorInfo)}
              />
            </div>
            <Field label="Pipeline step" value={errorInfo.step ? `#${errorInfo.step}` : "-"} />
            <Field label="Raw stage" value={record.error_stage} />
            <Field label="Ошибка" value={record.error_message} />
          </div>
        </section>
      </div>

      <section className="operation-details__panel operation-details__panel--tech">
        <Tabs className="operation-details__tech-tabs" size="small" items={techTabs} />
      </section>

      <CaptchaReviewModal
        captcha={reviewCaptcha}
        open={!!reviewCaptcha}
        onClose={() => setReviewCaptcha(null)}
      />
    </div>
  );
}
