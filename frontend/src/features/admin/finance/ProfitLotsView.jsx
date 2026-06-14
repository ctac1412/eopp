import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Space, Tag } from "antd";

import { Button, DataTable, Toolbar } from "../../../ui";
import { listProfitLots } from "./financeApi.js";
import { FinanceFilters } from "./FinanceFilters.jsx";
import { formatDateTime, formatMoney, matchesFinanceSearch } from "./financeFormat.js";

const STATUS_OPTIONS = [
  { value: "open", label: "Открытые" },
  { value: "allocated", label: "Распределены" },
];

function toServerFilters(filters) {
  const serverFilters = {};
  ["company_id", "usage_log_id", "invoice_id", "status"].forEach((field) => {
    if (filters[field]) {
      serverFilters[field] = filters[field];
    }
  });
  return serverFilters;
}

export function ProfitLotsView({
  adminToken,
  companies = [],
  refreshKey,
  onError,
  onViewChange,
  onLedgerFilters,
}) {
  const [lots, setLots] = useState([]);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadLots = useCallback(() => {
    if (!adminToken) {
      return;
    }
    setLoading(true);
    listProfitLots(adminToken, toServerFilters(filters))
      .then((data) => {
        setLots(Array.isArray(data) ? data : []);
        setError("");
      })
      .catch((err) => {
        const message = err?.message || "Не удалось загрузить лоты прибыли";
        setError(message);
        onError?.(message);
      })
      .finally(() => setLoading(false));
  }, [adminToken, filters, onError]);

  useEffect(() => {
    loadLots();
  }, [loadLots, refreshKey]);

  const visibleLots = useMemo(
    () => lots.filter((lot) => matchesFinanceSearch(lot, filters.search)),
    [filters.search, lots],
  );

  const openLedger = (lot) => {
    onLedgerFilters?.({
      invoice_id: lot.invoice_id ? String(lot.invoice_id) : "",
      profit_lot_id: lot.id ? String(lot.id) : "",
    });
    onViewChange?.("ledger");
  };

  const openInvoice = (invoiceId) => {
    if (!invoiceId) {
      return;
    }
    window.location.assign(`/admin?tab=invoices&invoice_id=${invoiceId}`);
  };

  const columns = [
    { title: "Лот", dataIndex: "id", width: 72, render: (value) => <span className="text-muted">#{value}</span> },
    {
      title: "Счёт",
      dataIndex: "invoice_number",
      width: 150,
      render: (value, lot) => value || (lot.invoice_id ? `#${lot.invoice_id}` : "—"),
    },
    { title: "Компания", dataIndex: "company_name", width: 150, ellipsis: true, render: (value, lot) => value || lot.company_id || "—" },
    { title: "Usage", dataIndex: "usage_log_id", width: 92, render: (value) => (value ? `#${value}` : "—") },
    { title: "Gross", dataIndex: "gross_amount", width: 116, align: "right", render: (value) => <span className="font-monospace">{formatMoney(value)}</span> },
    { title: "Allocated", dataIndex: "allocated_amount", width: 116, align: "right", render: (value) => <span className="font-monospace text-danger">{formatMoney(value)}</span> },
    {
      title: "Remaining",
      dataIndex: "remaining_amount",
      width: 124,
      align: "right",
      render: (value) => <span className={Number(value) > 0 ? "font-monospace text-success" : "font-monospace"}>{formatMoney(value)}</span>,
    },
    { title: "Проводки", dataIndex: "linked_entries_count", width: 92, align: "center" },
    { title: "Создан", dataIndex: "created_at", width: 132, render: formatDateTime },
    {
      title: "Статус",
      dataIndex: "remaining_amount",
      width: 118,
      align: "center",
      render: (value) => (Number(value) > 0 ? <Tag color="processing">Открыт</Tag> : <Tag color="default">Распределён</Tag>),
    },
    {
      title: "",
      width: 158,
      fixed: "right",
      align: "right",
      render: (_, lot) => (
        <Space size={4}>
          <Button size="small" onClick={() => openLedger(lot)}>Проводки</Button>
          <Button size="small" onClick={() => openInvoice(lot.invoice_id)} disabled={!lot.invoice_id}>Счёт</Button>
        </Space>
      ),
    },
  ];

  return (
    <div data-eopp-component="ProfitLotsView" className="finance-profit-lots-view">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Лоты прибыли</h2>
            <div className="small text-muted">Показано {visibleLots.length} из {lots.length}</div>
          </div>
        }
        right={<Button size="small" onClick={loadLots}>Обновить</Button>}
      />
      <div className="small text-muted mb-2">
        Лот рассчитывается из счёта и проводок. Прямое редактирование недоступно.
      </div>
      <FinanceFilters
        filters={filters}
        onChange={setFilters}
        companies={companies}
        showKind={false}
        showEditState={false}
        showPayout={false}
        showStatus
        statusOptions={STATUS_OPTIONS}
      />
      <div className="mt-3">
        <DataTable
          rowKey="id"
          columns={columns}
          data={visibleLots}
          loading={loading}
          error={error}
          emptyText="Нет лотов прибыли"
        />
      </div>
    </div>
  );
}
