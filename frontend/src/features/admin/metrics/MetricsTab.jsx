import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Spin } from "antd";
import { formatMoney } from "../../../utils/format";
import {
  Button,
  DataTable,
  MetricsStrip,
  StatusTag,
  Toolbar,
} from "../../../ui";
import { adminHeadersJson, adminRequest } from "../shared/adminClient";
import { groupByCompany } from "../reports/reportUtils";

const METRICS_USAGE_LOG_LIMIT = 500;

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function formatBoolean(value) {
  return value ? "Включено" : "Выключено";
}

export function MetricsTab({ adminToken, onError }) {
  const [dashboard, setDashboard] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const usageParams = new URLSearchParams({
        hide_test: "true",
        limit: String(METRICS_USAGE_LOG_LIMIT),
        offset: "0",
      });
      const [dashboardRes, usageRes] = await Promise.all([
        adminRequest("/admin/dashboard", { headers: adminHeadersJson(adminToken) }),
        adminRequest(`/usage-log?${usageParams.toString()}`, {
          headers: adminHeadersJson(adminToken),
        }),
      ]);
      if (!dashboardRes.ok) throw new Error(`dashboard HTTP ${dashboardRes.status}`);
      if (!usageRes.ok) throw new Error(`usage-log HTTP ${usageRes.status}`);
      setDashboard(await dashboardRes.json());
      const usageData = await usageRes.json();
      setRecords(Array.isArray(usageData) ? usageData : []);
    } catch (err) {
      onError?.(err.message);
      setDashboard(null);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const summary = useMemo(() => {
    const confirmed = records.filter((record) => record.status === "confirmed").length;
    const failed = records.filter((record) => record.status === "failed").length;
    const total = records.length;
    const readyForInvoice = records.filter((record) => (
      record.status === "confirmed" &&
      record.price > 0 &&
      record.paid !== true &&
      !record.invoice_id
    ));
    const invoiceAmount = readyForInvoice.reduce((sum, record) => sum + (record.price || 0), 0);
    return {
      confirmed,
      failed,
      total,
      successRate: total > 0 ? (confirmed / total) * 100 : 0,
      readyForInvoice: readyForInvoice.length,
      invoiceAmount,
    };
  }, [records]);

  const metricItems = [
    {
      key: "pending_captchas",
      label: "Очередь",
      value: dashboard?.pending_captchas ?? 0,
      tone: (dashboard?.pending_captchas ?? 0) > 0 ? "warning" : "success",
    },
    {
      key: "operators_online",
      label: "Операторы онлайн",
      value: `${dashboard?.operators_online ?? 0}/${dashboard?.operators_total ?? 0}`,
      tone: (dashboard?.operators_online ?? 0) > 0 ? "success" : "warning",
    },
    {
      key: "success_rate",
      label: "Успешность",
      value: formatPercent(summary.successRate),
      tone: summary.successRate >= 80 ? "success" : summary.failed > 0 ? "warning" : "neutral",
    },
    {
      key: "failed",
      label: "Ошибки",
      value: summary.failed,
      tone: summary.failed > 0 ? "danger" : "success",
    },
    {
      key: "ready_invoice",
      label: "К счету",
      value: `${summary.readyForInvoice} / ${formatMoney(summary.invoiceAmount)}`,
      tone: summary.readyForInvoice > 0 ? "info" : "neutral",
    },
    {
      key: "rucaptcha",
      label: "Автосолвер",
      value: formatBoolean(dashboard?.rucaptcha_enabled),
      tone: dashboard?.rucaptcha_enabled ? "success" : "neutral",
    },
  ];

  const companyRows = useMemo(
    () => groupByCompany(records)
      .filter((company) => company.name !== "—")
      .sort((a, b) => b.records.length - a.records.length)
      .slice(0, 12),
    [records],
  );

  const columns = [
    {
      title: "Компания",
      dataIndex: "name",
      render: (value) => <strong>{value}</strong>,
    },
    {
      title: "Всего",
      align: "center",
      render: (_, row) => row.records.length,
    },
    {
      title: "Успех",
      align: "center",
      render: (_, row) => row.records.filter((record) => record.status === "confirmed").length,
    },
    {
      title: "Ошибки",
      dataIndex: "errors",
      align: "center",
      render: (value) => (
        <StatusTag status={value > 0 ? "failed" : "confirmed"} label={String(value)} />
      ),
    },
    {
      title: "К счету",
      dataIndex: "invoiceAmount",
      align: "right",
      render: (value, row) => `${row.readyForInvoice} / ${formatMoney(value)}`,
    },
  ];

  if (loading) {
    return (
      <div data-eopp-component="MetricsTabLoading" className="admin-metrics-page admin-metrics-page--loading">
        <Spin size="small" />
        Загрузка...
      </div>
    );
  }

  return (
    <div data-eopp-component="MetricsTab" className="admin-metrics-page">
      <Toolbar
        className="mb-2"
        left={<Button size="small" onClick={refresh}>Обновить</Button>}
        right={<span className="text-muted small">Последние {records.length} операций без тестовых</span>}
      />
      <MetricsStrip items={metricItems} className="admin-metrics-page__strip mb-3" />

      <div className="admin-metrics-page__grid">
        <Card
          data-eopp-component="MetricsRuntimeCard"
          size="small"
          title="Рантайм"
          className="admin-metrics-page__card"
        >
          <dl className="admin-metrics-runtime">
            <div>
              <dt>SSE подключения</dt>
              <dd>{dashboard?.sse_connections ?? 0}</dd>
            </div>
            <div>
              <dt>Активные distribution states</dt>
              <dd>{dashboard?.distribution_states ?? 0}</dd>
            </div>
            <div>
              <dt>Callback очереди</dt>
              <dd>{dashboard?.rucaptcha_pending_callbacks ?? 0}</dd>
            </div>
            <div>
              <dt>API keys в SSE</dt>
              <dd>{Array.isArray(dashboard?.sse_api_key_ids) ? dashboard.sse_api_key_ids.length : 0}</dd>
            </div>
          </dl>
        </Card>

        <Card
          data-eopp-component="MetricsCompaniesCard"
          size="small"
          title="Компании"
          className="admin-metrics-page__card"
        >
          <DataTable
            rowKey="name"
            data={companyRows}
            columns={columns}
            pagination={false}
            emptyText="Нет операций"
          />
        </Card>
      </div>
    </div>
  );
}
