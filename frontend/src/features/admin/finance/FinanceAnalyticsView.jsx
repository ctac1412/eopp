import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Card, Space, Spin } from "antd";

import { Button, MetricsStrip, Toolbar } from "../../../ui";
import { getFinanceReport, listFinanceEntries } from "./financeApi.js";
import { financeKindLabel, formatMoney } from "./financeFormat.js";

function dateRangeToIso(value, fallback = "") {
  if (!value) return fallback;
  if (typeof value === "string") return value.slice(0, 10);
  if (typeof value?.format === "function") return value.format("YYYY-MM-DD");
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return fallback;
}

function rangeFilters(dateRange) {
  const [start, end] = Array.isArray(dateRange) ? dateRange : [];
  return {
    start: dateRangeToIso(start, undefined),
    end: dateRangeToIso(end, undefined),
  };
}

function amountAbs(value) {
  const amount = Number(value) || 0;
  return Math.abs(amount);
}

function byMagnitudeDesc(a, b) {
  return amountAbs(b.amount) - amountAbs(a.amount);
}

function companyName(row) {
  return row.company_name || row.name || (row.company_id ? `#${row.company_id}` : "Без компании");
}

function normalizeDay(value) {
  if (!value) return "Без даты";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(5, 10);
}

function isWithinRange(entry, filters) {
  if (!filters.start && !filters.end) return true;
  const day = String(entry.created_at || "").slice(0, 10);
  if (!day) return false;
  if (filters.start && day < filters.start) return false;
  if (filters.end && day > filters.end) return false;
  return true;
}

function BarList({ rows, className = "", valueLabel = formatMoney }) {
  const max = Math.max(1, ...rows.map((row) => amountAbs(row.amount)));
  return (
    <div className={`finance-chart-bars ${className}`.trim()}>
      {rows.length === 0 ? (
        <div className="text-muted small">Нет данных</div>
      ) : (
        rows.map((row) => {
          const width = `${Math.max(4, Math.round((amountAbs(row.amount) / max) * 100))}%`;
          const tone = Number(row.amount) < 0 ? "danger" : "success";
          return (
            <div className="finance-chart-bar" key={row.key || row.label}>
              <div className="finance-chart-bar__meta">
                <span title={row.label}>{row.label}</span>
                <strong>{valueLabel(row.amount)}</strong>
              </div>
              <div className="finance-chart-bar__track">
                <span
                  className={`finance-chart-bar__fill is-${tone}`}
                  style={{ width }}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export function FinanceAnalyticsView({ adminToken, dateRange, refreshKey, onError }) {
  const [report, setReport] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filters = useMemo(() => rangeFilters(dateRange), [dateRange]);

  const loadAnalytics = useCallback(() => {
    if (!adminToken) return;
    setLoading(true);
    Promise.all([
      getFinanceReport(adminToken, filters),
      listFinanceEntries(adminToken),
    ])
      .then(([nextReport, nextEntries]) => {
        setReport(nextReport || {});
        setEntries(Array.isArray(nextEntries) ? nextEntries : []);
        setError("");
      })
      .catch((err) => {
        const message = err?.message || "Не удалось загрузить финансовую аналитику";
        setError(message);
        onError?.(message);
      })
      .finally(() => setLoading(false));
  }, [adminToken, filters, onError]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics, refreshKey]);

  const totals = report?.totals || {};
  const kindRows = useMemo(
    () =>
      Object.entries(totals)
        .filter(([key, amount]) => !["profit_lots_gross", "net_profit_remaining"].includes(key) && Number(amount) !== 0)
        .map(([kind, amount]) => ({ key: kind, label: financeKindLabel(kind), amount }))
        .sort(byMagnitudeDesc)
        .slice(0, 8),
    [totals],
  );

  const companyRows = useMemo(
    () =>
      Object.entries(report?.companies || {})
        .map(([key, row]) => ({
          key,
          label: companyName(row),
          amount: row.total || Object.values(row).filter((value) => typeof value === "number").reduce((sum, value) => sum + value, 0),
        }))
        .filter((row) => Number(row.amount) !== 0)
        .sort(byMagnitudeDesc)
        .slice(0, 8),
    [report],
  );

  const dailyRows = useMemo(() => {
    const map = new Map();
    for (const entry of entries.filter((item) => isWithinRange(item, filters))) {
      const day = normalizeDay(entry.created_at);
      map.set(day, (map.get(day) || 0) + (Number(entry.amount) || 0));
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([label, amount]) => ({ key: label, label, amount }));
  }, [entries, filters]);

  const grossIncome = Number(totals.customer_income || 0);
  const expenses = kindRows
    .filter((row) => Number(row.amount) < 0)
    .reduce((sum, row) => sum + amountAbs(row.amount), 0);
  const payroll = amountAbs(totals.executor_salary) + amountAbs(totals.operator_salary);
  const net = Number(totals.net_profit_remaining || 0);

  const metrics = [
    { key: "gross", label: "Валовый доход", value: formatMoney(grossIncome), tone: grossIncome > 0 ? "success" : "neutral" },
    { key: "net", label: "Остаток", value: formatMoney(net), tone: net >= 0 ? "info" : "danger" },
    { key: "payroll", label: "ФОТ", value: formatMoney(payroll), tone: payroll > 0 ? "warning" : "neutral" },
    { key: "expenses", label: "Расходы", value: formatMoney(expenses), tone: expenses > 0 ? "warning" : "success" },
    { key: "entries", label: "Проводки", value: entries.length, tone: entries.length > 0 ? "neutral" : "warning" },
  ];

  return (
    <div data-eopp-component="FinanceAnalyticsView" className="finance-analytics-view">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Аналитика</h2>
            <div className="small text-muted">
              {filters.start || "начало"} - {filters.end || "сегодня"}
            </div>
          </div>
        }
        right={
          <Space wrap>
            {loading && <Spin size="small" />}
            <Button size="small" onClick={loadAnalytics}>Обновить</Button>
          </Space>
        }
      />
      {error && <Alert className="mb-3" type="error" showIcon message={error} />}

      <MetricsStrip items={metrics} className="finance-analytics-metrics mb-3" />

      <div className="finance-analytics-grid">
        <Card size="small" title="Динамика по дням" className="finance-analytics-chart finance-analytics-chart--daily">
          <BarList rows={dailyRows} />
        </Card>
        <Card size="small" title="Структура по типам" className="finance-analytics-chart finance-analytics-chart--kinds">
          <BarList rows={kindRows} />
        </Card>
        <Card size="small" title="Топ компаний" className="finance-analytics-chart finance-analytics-chart--companies">
          <BarList rows={companyRows} />
        </Card>
      </div>
    </div>
  );
}
