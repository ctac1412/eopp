import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Space } from "antd";

import { Button, DataTable, TextInput, Toolbar } from "../../../ui";
import { getFinanceReport } from "./financeApi.js";
import { financeKindLabel, formatMoney } from "./financeFormat.js";

const PROFIT_TOTAL_KEYS = new Set(["profit_lots_gross", "net_profit_remaining"]);

function todayMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toDate = (date) => date.toISOString().slice(0, 10);
  return { start: toDate(start), end: toDate(end) };
}

function reportFilters(start, end) {
  return {
    start: start || undefined,
    end: end || undefined,
  };
}

export function FinanceReportView({
  adminToken,
  refreshKey,
  onError,
  onViewChange,
  onLedgerFilters,
  onLotsView,
}) {
  const initialRange = useMemo(() => todayMonthRange(), []);
  const [start, setStart] = useState(initialRange.start);
  const [end, setEnd] = useState(initialRange.end);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadReport = useCallback(() => {
    if (!adminToken) {
      return;
    }
    setLoading(true);
    getFinanceReport(adminToken, reportFilters(start, end))
      .then((data) => {
        setReport(data || {});
        setError("");
      })
      .catch((err) => {
        const message = err?.message || "Не удалось загрузить финансовую сводку";
        setError(message);
        onError?.(message);
      })
      .finally(() => setLoading(false));
  }, [adminToken, end, onError, start]);

  useEffect(() => {
    loadReport();
  }, [loadReport, refreshKey]);

  const totals = report?.totals || {};
  const totalRows = useMemo(
    () =>
      Object.entries(totals)
        .filter(([key]) => !PROFIT_TOTAL_KEYS.has(key))
        .map(([kind, amount]) => ({
          kind,
          label: financeKindLabel(kind),
          amount,
        })),
    [totals],
  );

  const userRows = useMemo(
    () =>
      Object.values(report?.users || {}).map((row) => {
        const total = Object.entries(row)
          .filter(([key, value]) => key !== "user_id" && key !== "user_name" && typeof value === "number")
          .reduce((sum, [, value]) => sum + value, 0);
        return { ...row, total };
      }),
    [report],
  );

  const companyRows = useMemo(
    () =>
      Object.entries(report?.companies || {}).map(([companyId, row]) => ({
        company_id: row.company_id || companyId,
        company_name: row.company_name || row.name || `#${companyId}`,
        total: row.total || Object.values(row).filter((value) => typeof value === "number").reduce((sum, value) => sum + value, 0),
      })),
    [report],
  );

  const resetMonth = () => {
    const range = todayMonthRange();
    setStart(range.start);
    setEnd(range.end);
  };

  const openLedger = (filters) => {
    onLedgerFilters?.(filters);
    onViewChange?.("ledger");
  };

  const totalColumns = [
    { title: "Тип", dataIndex: "label", width: 220 },
    { title: "Сумма", dataIndex: "amount", width: 140, align: "right", render: (value) => <span className="font-monospace">{formatMoney(value)}</span> },
    {
      title: "",
      width: 100,
      align: "right",
      render: (_, row) => <Button size="small" onClick={() => openLedger({ kind: row.kind })}>Проводки</Button>,
    },
  ];

  const userColumns = [
    { title: "Участник", dataIndex: "user_name", width: 180, ellipsis: true, render: (value, row) => value || `#${row.user_id}` },
    { title: "Всего", dataIndex: "total", width: 128, align: "right", render: (value) => <span className="font-monospace">{formatMoney(value)}</span> },
    { title: "Исп.", dataIndex: "executor_salary", width: 110, align: "right", render: formatMoney },
    { title: "Опер.", dataIndex: "operator_salary", width: 110, align: "right", render: formatMoney },
    { title: "Директор", dataIndex: "director_profit", width: 120, align: "right", render: formatMoney },
    {
      title: "",
      width: 100,
      align: "right",
      render: (_, row) => <Button size="small" onClick={() => openLedger({ search: row.user_name || String(row.user_id) })}>Проводки</Button>,
    },
  ];

  const companyColumns = [
    { title: "Компания", dataIndex: "company_name", width: 200, ellipsis: true },
    { title: "Всего", dataIndex: "total", width: 140, align: "right", render: (value) => <span className="font-monospace">{formatMoney(value)}</span> },
    {
      title: "",
      width: 100,
      align: "right",
      render: (_, row) => <Button size="small" onClick={() => openLedger({ company_id: String(row.company_id) })}>Проводки</Button>,
    },
  ];

  return (
    <div data-eopp-component="FinanceReportView" className="finance-report-view">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Сводка</h2>
            <div className="small text-muted">Период: {start || "—"} — {end || "—"}</div>
          </div>
        }
        right={
          <Space wrap>
            <label className="form-label small mb-0">
              Начало
              <TextInput size="small" type="date" value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label className="form-label small mb-0">
              Конец
              <TextInput size="small" type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
            </label>
            <Button size="small" onClick={resetMonth}>Текущий месяц</Button>
            <Button size="small" variant="primary" onClick={loadReport}>Обновить</Button>
          </Space>
        }
      />

      <div className="eopp-metrics-strip mb-3">
        <div className="eopp-metric-card">
          <div className="eopp-metric-card__label">Gross lots</div>
          <div className="eopp-metric-card__value">{formatMoney(totals.profit_lots_gross || 0)}</div>
        </div>
        <div className="eopp-metric-card">
          <div className="eopp-metric-card__label">Remaining</div>
          <div className="eopp-metric-card__value">{formatMoney(totals.net_profit_remaining || 0)}</div>
        </div>
        <div className="eopp-metric-card">
          <div className="eopp-metric-card__label">Buckets</div>
          <div className="eopp-metric-card__value">{totalRows.length}</div>
        </div>
        <div className="eopp-metric-card">
          <Button size="small" onClick={onLotsView}>Лоты прибыли</Button>
        </div>
      </div>

      <div className="mb-3">
        <DataTable
          rowKey="kind"
          columns={totalColumns}
          data={totalRows}
          loading={loading}
          error={error}
          emptyText="Нет итогов по типам"
        />
      </div>
      {companyRows.length > 0 && (
        <div className="mb-3">
          <DataTable
            rowKey="company_id"
            columns={companyColumns}
            data={companyRows}
            loading={loading}
            emptyText="Нет итогов по компаниям"
          />
        </div>
      )}
      <DataTable
        rowKey="user_id"
        columns={userColumns}
        data={userRows}
        loading={loading}
        emptyText="Нет итогов по участникам"
      />
    </div>
  );
}
