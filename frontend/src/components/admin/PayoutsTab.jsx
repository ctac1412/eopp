import React, { useMemo, useState } from "react";
import { Card, Modal, Space } from "antd";
import {
  Button,
  DataTable,
  FilterBar,
  MetricsStrip,
  SelectInput,
  StatusTag,
  TextInput,
  Toolbar,
} from "../../ui";

const STATUS_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "pending", label: "Ожидает" },
  { value: "completed", label: "Завершена" },
  { value: "cancelled", label: "Отменена" },
];

const STATUS_META = {
  pending: { status: "pending", label: "Ожидает" },
  completed: { status: "confirmed", label: "Завершена" },
  cancelled: { status: "offline", label: "Отменена" },
};

function formatMoney(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("ru-RU")} ₽`;
}

function formatDate(iso, withTime = false) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("ru-RU", withTime
    ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit", year: "numeric" });
}

function payoutSearchText(payout) {
  return [
    payout.id,
    payout.name,
    payout.status,
    ...(payout.invoices || []).map((invoice) => invoice.invoice_number || invoice.invoice_id),
    ...(payout.shares || []).map((share) => share.user_name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function statusTag(status) {
  const meta = STATUS_META[status] || { status: "neutral", label: status || "—" };
  return <StatusTag status={meta.status} label={meta.label} />;
}

function MoneyCell({ value, tone = "" }) {
  return <span className={`font-monospace text-nowrap ${tone}`}>{formatMoney(value)}</span>;
}

function PayoutDetails({ payout }) {
  const invoices = payout.invoices || [];
  const expenses = payout.expenses || [];
  const shares = payout.shares || [];

  const invoiceColumns = [
    { title: "Счёт", dataIndex: "invoice_number", render: (value, row) => <span className="font-monospace">{value || row.invoice_id || row.id}</span> },
    { title: "Доход", dataIndex: "debt_amount", align: "right", render: (value) => <MoneyCell value={value} tone="text-success" /> },
    { title: "Комиссия", dataIndex: "percent_amount", align: "right", render: (value) => <MoneyCell value={value} tone="text-info" /> },
    { title: "Налог", dataIndex: "tax_amount", align: "right", render: (value) => <MoneyCell value={value} tone="text-warning" /> },
    { title: "Итого", dataIndex: "total_amount", align: "right", render: (value, row) => <MoneyCell value={value || row.amount} /> },
    { title: "Оплата", dataIndex: "paid", align: "center", render: (value) => <StatusTag status={value ? "paid" : "unpaid"} label={value ? "Опл." : "Нет"} /> },
  ];

  const expenseColumns = [
    { title: "ID", dataIndex: "expense_id", width: 80, render: (value, row) => <span className="text-muted">#{value || row.id}</span> },
    { title: "Компенсация", dataIndex: "amount", align: "right", render: (value) => <MoneyCell value={value} tone="text-danger" /> },
  ];

  const shareColumns = [
    { title: "Участник", dataIndex: "user_name", ellipsis: true },
    { title: "%", dataIndex: "split_pct", width: 70, align: "center", render: (value) => `${value || 0}%` },
    { title: "Комиссия", dataIndex: "commission_amount", align: "right", render: (value) => <MoneyCell value={value} tone="text-info" /> },
    { title: "Налог", dataIndex: "tax_amount", align: "right", render: (value) => <MoneyCell value={value} tone="text-warning" /> },
    { title: "Расходы", dataIndex: "expenses_compensation", align: "right", render: (value) => <MoneyCell value={value} tone="text-danger" /> },
    { title: "Прибыль", dataIndex: "profit_share", align: "right", render: (value) => <MoneyCell value={value} tone="text-success" /> },
    { title: "Итого", dataIndex: "total", align: "right", render: (value) => <MoneyCell value={value} /> },
  ];

  return (
    <div data-eopp-component="PayoutDetails" className="payout-details">
      <div className="payout-details-grid">
        <Card size="small" title={`Счета (${invoices.length})`}>
          <DataTable rowKey={(row) => row.invoice_id || row.id} data={invoices} columns={invoiceColumns} pagination={false} emptyText="Нет счетов" scroll={false} />
        </Card>
        <Card size="small" title={`Расходы (${expenses.length})`}>
          <DataTable rowKey={(row) => row.expense_id || row.id} data={expenses} columns={expenseColumns} pagination={false} emptyText="Нет расходов" scroll={false} />
        </Card>
      </div>
      <Card className="mt-2" size="small" title={`Доли участников (${shares.length})`}>
        <DataTable rowKey={(row) => `${row.user_id}-${row.user_name}`} data={shares} columns={shareColumns} pagination={false} emptyText="Нет долей" />
      </Card>
    </div>
  );
}

export function PayoutsTab({ payouts, onEdit, onDelete, onRecalculate, onStatusChange, onCreate, onRefresh }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const allUserNames = useMemo(() => {
    const names = new Set();
    payouts.forEach((payout) => {
      (payout.shares || []).forEach((share) => {
        if (share.user_name) names.add(share.user_name);
      });
    });
    return [...names].sort();
  }, [payouts]);

  const filteredPayouts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return payouts.filter((payout) => {
      const createdAt = payout.created_at ? new Date(payout.created_at) : null;
      if (q && !payoutSearchText(payout).includes(q)) return false;
      if (statusFilter !== "all" && payout.status !== statusFilter) return false;
      if (userFilter !== "all" && !(payout.shares || []).some((share) => share.user_name === userFilter)) return false;
      if (from && createdAt && createdAt < from) return false;
      if (to && createdAt && createdAt > to) return false;
      return true;
    });
  }, [dateFrom, dateTo, payouts, search, statusFilter, userFilter]);

  const stats = useMemo(() => ({
    pending: filteredPayouts.filter((payout) => payout.status === "pending").length,
    completed: filteredPayouts.filter((payout) => payout.status === "completed").length,
    net: filteredPayouts.reduce((sum, payout) => sum + (payout.net_amount || 0), 0),
    income: filteredPayouts.reduce((sum, payout) => sum + (payout.total_income || 0), 0),
    expenses: filteredPayouts.reduce((sum, payout) => sum + (payout.total_expenses || 0), 0),
    commission: filteredPayouts.reduce((sum, payout) => sum + (payout.total_commission || 0), 0),
    tax: filteredPayouts.reduce((sum, payout) => sum + (payout.total_tax || 0), 0),
  }), [filteredPayouts]);

  const userTotals = useMemo(() => {
    const totals = {};
    allUserNames.forEach((name) => {
      totals[name] = { total: 0, commission: 0, tax: 0, expenses: 0, profit: 0 };
    });
    filteredPayouts.forEach((payout) => {
      (payout.shares || []).forEach((share) => {
        if (!share.user_name || !totals[share.user_name]) return;
        totals[share.user_name].total += share.total || 0;
        totals[share.user_name].commission += share.commission_amount || 0;
        totals[share.user_name].tax += share.tax_amount || 0;
        totals[share.user_name].expenses += share.expenses_compensation || 0;
        totals[share.user_name].profit += share.profit_share || 0;
      });
    });
    return totals;
  }, [allUserNames, filteredPayouts]);

  const visibleUserNames = allUserNames.filter((name) => userFilter === "all" || name === userFilter);

  const metrics = [
    { key: "count", label: "Выплаты", value: `${filteredPayouts.length} / ${payouts.length}`, tone: filteredPayouts.length === payouts.length ? "neutral" : "warning" },
    { key: "pending", label: "Ожидают", value: stats.pending, tone: stats.pending > 0 ? "warning" : "success" },
    { key: "completed", label: "Завершены", value: stats.completed, tone: stats.completed > 0 ? "success" : "neutral" },
    { key: "income", label: "Доход", value: formatMoney(stats.income), tone: "success" },
    { key: "expenses", label: "Расходы", value: formatMoney(stats.expenses), tone: stats.expenses > 0 ? "danger" : "neutral" },
    { key: "net", label: "Net", value: formatMoney(stats.net), tone: stats.net > 0 ? "info" : "neutral" },
  ];

  const confirmDelete = (payout) => {
    Modal.confirm({
      title: "Удалить выплату?",
      content: `Выплата #${payout.id} будет удалена.`,
      okText: "Удалить",
      okButtonProps: { danger: true },
      cancelText: "Отмена",
      onOk: () => onDelete(payout.id),
    });
  };

  const columns = [
    {
      title: "Выплата",
      dataIndex: "name",
      width: 230,
      ellipsis: true,
      render: (value, payout) => (
        <div title={value || `#${payout.id}`} className="payout-title-cell">
          <span className="fw-semibold">{value || `#${payout.id}`}</span>
          <span className="text-muted">#{payout.id} · {formatDate(payout.completed_at || payout.created_at)}</span>
        </div>
      ),
    },
    { title: "Статус", dataIndex: "status", width: 100, align: "center", render: statusTag },
    {
      title: "Сч/Р",
      width: 72,
      align: "center",
      render: (_, payout) => `${payout.invoices?.length || 0}/${payout.expenses?.length || 0}`,
    },
    { title: "Доход", dataIndex: "total_income", width: 104, align: "right", render: (value) => <MoneyCell value={value} tone="text-success" /> },
    { title: "Комис.", dataIndex: "total_commission", width: 96, align: "right", render: (value) => <MoneyCell value={value} tone="text-info" /> },
    { title: "Налог", dataIndex: "total_tax", width: 92, align: "right", render: (value) => <MoneyCell value={value} tone="text-warning" /> },
    { title: "Net", dataIndex: "net_amount", width: 104, align: "right", render: (value) => <MoneyCell value={value} /> },
    {
      title: "",
      width: 160,
      align: "right",
      render: (_, payout) => (
        <Space size={4} wrap>
          {payout.status === "pending" && (
            <>
              <Button size="small" onClick={() => onEdit(payout)}>Изм.</Button>
              <Button size="small" onClick={() => onRecalculate(payout.id)}>↻</Button>
              <Button size="small" variant="primary" onClick={() => onStatusChange(payout.id, "completed")}>✓</Button>
              <Button size="small" onClick={() => onStatusChange(payout.id, "cancelled")}>×</Button>
            </>
          )}
          <Button size="small" variant="danger" onClick={() => confirmDelete(payout)}>Удал.</Button>
        </Space>
      ),
    },
  ];

  return (
    <div data-eopp-component="PayoutsTab" className="payouts-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Выплаты</h2>
            <div className="small text-muted">
              Распределение доходов, налогов, комиссий и компенсаций расходов по участникам
            </div>
          </div>
        }
        right={
          <Space wrap>
            <Button size="small" onClick={onRefresh}>Обновить</Button>
            <Button size="small" variant="primary" onClick={onCreate}>Новая выплата</Button>
          </Space>
        }
      />

      <MetricsStrip items={metrics} />

      {visibleUserNames.length > 0 && (
        <div data-eopp-component="PayoutUsersSummary" className="payout-users-strip">
          {visibleUserNames.map((name) => {
            const total = userTotals[name] || {};
            return (
              <Card key={name} size="small" title={name}>
                <div className="payout-user-lines">
                  <div><span>Комиссия</span><strong className="text-info">{formatMoney(total.commission)}</strong></div>
                  <div><span>Налог</span><strong className="text-warning">{formatMoney(total.tax)}</strong></div>
                  <div><span>Расходы</span><strong className="text-danger">-{formatMoney(total.expenses)}</strong></div>
                  <div><span>Прибыль</span><strong className="text-success">{formatMoney(total.profit)}</strong></div>
                  <div className="payout-user-total"><span>Итого</span><strong>{formatMoney(total.total)}</strong></div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card data-eopp-component="PayoutsListCard" className="mt-3" size="small" title="Список выплат">
        <FilterBar className="mb-3">
          <label className="form-label small mb-0 payouts-search">
            Поиск
            <TextInput size="small" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="название, счёт, участник, ID" />
          </label>
          <label className="form-label small mb-0">
            Статус
            <SelectInput size="small" value={statusFilter} onChange={(value) => setStatusFilter(value || "all")} options={STATUS_OPTIONS} allowClear={false} style={{ minWidth: 150 }} />
          </label>
          <label className="form-label small mb-0">
            Участник
            <SelectInput
              size="small"
              value={userFilter}
              onChange={(value) => setUserFilter(value || "all")}
              options={[{ value: "all", label: "Все" }, ...allUserNames.map((name) => ({ value: name, label: name }))]}
              allowClear={false}
              style={{ minWidth: 170 }}
            />
          </label>
          <label className="form-label small mb-0">
            С даты
            <TextInput
              data-eopp-component="PayoutsDateFrom"
              size="small"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label className="form-label small mb-0">
            По дату
            <TextInput
              data-eopp-component="PayoutsDateTo"
              size="small"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
        </FilterBar>

        <DataTable
          className="payouts-table"
          rowKey="id"
          data={filteredPayouts}
          columns={columns}
          emptyText="Нет выплат"
          pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: [10, 15, 30, 50] }}
          scroll={false}
          expandable={{
            expandedRowRender: (payout) => <PayoutDetails payout={payout} />,
            rowExpandable: (payout) => Boolean((payout.invoices?.length || 0) || (payout.expenses?.length || 0) || (payout.shares?.length || 0)),
          }}
        />
      </Card>
    </div>
  );
}
