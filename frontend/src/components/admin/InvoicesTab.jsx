import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney } from "../../utils/format";
import { InvoiceEditModal } from "./InvoiceEditModal";
import { InvoiceCreateModal } from "./InvoiceCreateModal";

function adminHeaders(token) {
  return { "Content-Type": "application/json", "X-Admin-Token": token };
}

function adminHeadersJson(token) {
  return { "X-Admin-Token": token };
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function allocationStatus(invoice) {
  return invoice.allocation?.status || "not_allocated";
}

function SummaryCard({ label, value, tone = "secondary" }) {
  return (
    <div className={`border-start border-4 border-${tone} bg-light p-2 h-100`}>
      <div className="text-muted small">{label}</div>
      <div className="fw-semibold">{value}</div>
    </div>
  );
}

function AllocationBadge({ allocation }) {
  const status = allocation?.status || "not_allocated";
  if (status === "fully_allocated") {
    return <span className="badge bg-success">Распределен</span>;
  }
  if (status === "partially_allocated") {
    return (
      <span className="badge bg-warning text-dark">
        Частично ({allocation.allocated_pct}%)
      </span>
    );
  }
  return <span className="badge bg-secondary">Не распределен</span>;
}

function findUserName(users, id) {
  if (!id) return "—";
  return users?.find((user) => user.id === id)?.name || `#${id}`;
}

function invoiceSearchText(invoice, users) {
  return [
    invoice.id,
    invoice.invoice_number,
    invoice.comment,
    invoice.total_amount,
    invoice.debt_amount,
    findUserName(users, invoice.commission_user_id),
    findUserName(users, invoice.tax_user_id),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function InvoicesTab({ adminToken, onError, users }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [paidFilter, setPaidFilter] = useState("all");
  const [allocationFilter, setAllocationFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/admin/invoices", {
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onError]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const togglePaid = async (invoice) => {
    const newPaid = !invoice.paid;
    try {
      const res = await fetch(`/admin/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ paid: newPaid }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === invoice.id ? { ...inv, ...updated } : inv)),
      );
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    }
  };

  const deleteInvoice = async (invoice) => {
    if (!confirm(`Удалить счет #${invoice.id}?`)) return;
    try {
      const res = await fetch(`/admin/invoices/${invoice.id}`, {
        method: "DELETE",
        headers: adminHeaders(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInvoices((prev) => prev.filter((inv) => inv.id !== invoice.id));
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    }
  };

  const handleSaveEdit = async (updated) => {
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === updated.id ? { ...inv, ...updated } : inv)),
    );
  };

  const handleCreated = (newInvoice) => {
    setInvoices((prev) => [newInvoice, ...prev]);
  };

  const userOptions = useMemo(() => {
    const options = new Map();
    users?.forEach((user) => options.set(String(user.id), user.name));
    invoices.forEach((invoice) => {
      if (invoice.commission_user_id) {
        options.set(String(invoice.commission_user_id), findUserName(users, invoice.commission_user_id));
      }
      if (invoice.tax_user_id) {
        options.set(String(invoice.tax_user_id), findUserName(users, invoice.tax_user_id));
      }
    });
    return [...options.entries()].map(([id, name]) => ({ id, name }));
  }, [invoices, users]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return invoices.filter((invoice) => {
      const createdAt = invoice.created_at ? new Date(invoice.created_at) : null;
      if (q && !invoiceSearchText(invoice, users).includes(q)) return false;
      if (paidFilter === "paid" && !invoice.paid) return false;
      if (paidFilter === "unpaid" && invoice.paid) return false;
      if (allocationFilter !== "all" && allocationStatus(invoice) !== allocationFilter) return false;
      if (
        userFilter !== "all" &&
        String(invoice.commission_user_id || "") !== userFilter &&
        String(invoice.tax_user_id || "") !== userFilter
      ) {
        return false;
      }
      if (from && createdAt && createdAt < from) return false;
      if (to && createdAt && createdAt > to) return false;
      return true;
    });
  }, [invoices, search, users, paidFilter, allocationFilter, userFilter, dateFrom, dateTo]);

  const metrics = useMemo(() => {
    const sum = (field) => filteredInvoices.reduce((acc, invoice) => acc + (invoice[field] || 0), 0);
    const paid = filteredInvoices.filter((invoice) => invoice.paid);
    const unpaid = filteredInvoices.filter((invoice) => !invoice.paid);
    return {
      count: filteredInvoices.length,
      total: sum("total_amount"),
      debt: sum("debt_amount"),
      commission: sum("percent_amount"),
      tax: sum("tax_amount"),
      paidCount: paid.length,
      unpaidCount: unpaid.length,
      unpaidTotal: unpaid.reduce((acc, invoice) => acc + (invoice.total_amount || 0), 0),
    };
  }, [filteredInvoices]);

  if (loading) return <div className="text-center text-muted py-5">Загрузка…</div>;
  if (error) return <div className="alert alert-danger">Ошибка: {error}</div>;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex gap-2 align-items-center">
          <button className="btn btn-outline-secondary btn-sm" onClick={fetchInvoices}>
            Обновить
          </button>
          <span className="text-muted small">Показано: {filteredInvoices.length} из {invoices.length}</span>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(true)}>
          + Новый счет
        </button>
      </div>

      <div className="row g-2 mb-3">
        <div className="col-6 col-xl-2"><SummaryCard label="Счетов" value={metrics.count} tone="primary" /></div>
        <div className="col-6 col-xl-2"><SummaryCard label="Итого" value={formatMoney(metrics.total)} tone="dark" /></div>
        <div className="col-6 col-xl-2"><SummaryCard label="Долг" value={formatMoney(metrics.debt)} tone="success" /></div>
        <div className="col-6 col-xl-2"><SummaryCard label="Комиссия" value={formatMoney(metrics.commission)} tone="info" /></div>
        <div className="col-6 col-xl-2"><SummaryCard label="Налог" value={formatMoney(metrics.tax)} tone="warning" /></div>
        <div className="col-6 col-xl-2"><SummaryCard label="Не оплачено" value={`${metrics.unpaidCount} / ${formatMoney(metrics.unpaidTotal)}`} tone="danger" /></div>
      </div>

      <div className="row g-2 align-items-end mb-3">
        <div className="col-12 col-xl-4">
          <label className="form-label small mb-1">Поиск</label>
          <input className="form-control form-control-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Номер, ID, комментарий, участник" />
        </div>
        <div className="col-6 col-md-3 col-xl-2">
          <label className="form-label small mb-1">Оплата</label>
          <select className="form-select form-select-sm" value={paidFilter} onChange={(e) => setPaidFilter(e.target.value)}>
            <option value="all">Все</option>
            <option value="paid">Оплаченные</option>
            <option value="unpaid">Не оплаченные</option>
          </select>
        </div>
        <div className="col-6 col-md-3 col-xl-2">
          <label className="form-label small mb-1">Распределение</label>
          <select className="form-select form-select-sm" value={allocationFilter} onChange={(e) => setAllocationFilter(e.target.value)}>
            <option value="all">Все</option>
            <option value="fully_allocated">Распределены</option>
            <option value="partially_allocated">Частично</option>
            <option value="not_allocated">Не распределены</option>
          </select>
        </div>
        <div className="col-6 col-md-3 col-xl-2">
          <label className="form-label small mb-1">Участник</label>
          <select className="form-select form-select-sm" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="all">Все</option>
            {userOptions.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </div>
        <div className="col-6 col-md-3 col-xl-1">
          <label className="form-label small mb-1">С даты</label>
          <input className="form-control form-control-sm" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="col-6 col-md-3 col-xl-1">
          <label className="form-label small mb-1">По дату</label>
          <input className="form-control form-control-sm" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-sm table-hover table-bordered align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th className="text-center" style={{ width: "40px" }}>#</th>
              <th style={{ width: "80px" }}>ID</th>
              <th style={{ width: "140px" }}>Дата</th>
              <th>Номер</th>
              <th className="text-end">Долг</th>
              <th className="text-end">Комиссия</th>
              <th className="text-end">Налог</th>
              <th className="text-end fw-bold">Итого</th>
              <th>Комментарий</th>
              <th className="text-center">Распределение</th>
              <th className="text-center">Комиссия</th>
              <th className="text-center">Налог</th>
              <th className="text-center">Оплата</th>
              <th className="text-center">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.length === 0 ? (
              <tr><td colSpan={14} className="text-center text-muted py-4">Нет счетов по выбранным фильтрам</td></tr>
            ) : (
              filteredInvoices.map((invoice, idx) => (
                <tr key={invoice.id}>
                  <td className="text-center text-muted small">{idx + 1}</td>
                  <td className="text-center font-monospace small">{invoice.id}</td>
                  <td className="small text-nowrap">{formatDate(invoice.created_at)}</td>
                  <td className="small"><code>{invoice.invoice_number || "—"}</code></td>
                  <td className="text-end font-monospace small">{formatMoney(invoice.debt_amount)}</td>
                  <td className="text-end font-monospace small">{formatMoney(invoice.percent_amount)}</td>
                  <td className="text-end font-monospace small">{formatMoney(invoice.tax_amount)}</td>
                  <td className="text-end fw-bold text-primary">{formatMoney(invoice.total_amount)}</td>
                  <td className="small text-truncate" style={{ maxWidth: "180px" }} title={invoice.comment || ""}>{invoice.comment || "—"}</td>
                  <td className="text-center"><AllocationBadge allocation={invoice.allocation} /></td>
                  <td className="text-center small text-success">{findUserName(users, invoice.commission_user_id)}</td>
                  <td className="text-center small text-danger">{findUserName(users, invoice.tax_user_id)}</td>
                  <td className="text-center">
                    <button
                      className={`btn btn-sm ${invoice.paid ? "btn-success" : "btn-outline-secondary"}`}
                      onClick={() => togglePaid(invoice)}
                    >
                      {invoice.paid ? "Оплачен" : "Не оплачен"}
                    </button>
                  </td>
                  <td className="text-center text-nowrap">
                    <button
                      className="btn btn-sm btn-outline-primary me-1"
                      onClick={() => setEditingInvoice(invoice)}
                      title="Редактировать"
                    >
                      &#9998;
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => deleteInvoice(invoice)}
                      title="Удалить"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <InvoiceEditModal
        show={!!editingInvoice}
        invoice={editingInvoice}
        onClose={() => setEditingInvoice(null)}
        onSave={handleSaveEdit}
        adminToken={adminToken}
        users={users || []}
      />

      <InvoiceCreateModal
        show={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        adminToken={adminToken}
        users={users || []}
      />
    </div>
  );
}
