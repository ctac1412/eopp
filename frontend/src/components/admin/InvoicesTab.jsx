import React, { useState, useEffect, useCallback } from "react";
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
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InvoicesTab({ adminToken, onError, users }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState({});
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

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
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

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
        prev.map((inv) => (inv.id === invoice.id ? { ...inv, ...updated } : inv))
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteInvoice = async (invoice) => {
    if (!confirm(`Удалить счёт ${invoice.invoice_number}?`)) return;
    try {
      const res = await fetch(`/admin/invoices/${invoice.id}`, {
        method: "DELETE",
        headers: adminHeaders(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInvoices((prev) => prev.filter((inv) => inv.id !== invoice.id));
    } catch (err) {
      setError(err.message);
    }
  };

  const generatePdf = async (invoice) => {
    setPdfLoading((prev) => ({ ...prev, [invoice.id]: true }));
    try {
      const res = await fetch(`/admin/invoices/${invoice.id}/generate-pdf`, {
        method: "POST",
        headers: adminHeaders(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err.message);
    } finally {
      setPdfLoading((prev) => ({ ...prev, [invoice.id]: false }));
    }
  };

  const handleSaveEdit = async (updated) => {
    setInvoices((prev) => prev.map((inv) => inv.id === updated.id ? { ...inv, ...updated } : inv));
  };

  const handleCreated = (newInvoice) => {
    setInvoices((prev) => [newInvoice, ...prev]);
  };

  if (loading) return <div className="text-center text-muted py-5">Загрузка…</div>;
  if (error) return <div className="alert alert-danger">Ошибка: {error}</div>;

  const unpaidInvoices = invoices.filter((inv) => !inv.paid);
  const unpaidTotal = unpaidInvoices.reduce((acc, inv) => acc + (inv.total_amount || 0), 0);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex gap-3 align-items-center">
          <button className="btn btn-outline-secondary btn-sm" onClick={fetchInvoices}>
            Обновить
          </button>
          <span className="text-muted small">Всего: {invoices.length}</span>
          <span className="text-danger small fw-semibold">Не оплачено: {unpaidInvoices.length} ({formatMoney(unpaidTotal)})</span>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(true)}>
          + Новый счёт
        </button>
      </div>

      <div className="table-responsive">
        <table className="table table-sm table-hover table-bordered align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th className="text-center" style={{ width: "40px" }}>#</th>
              <th>Номер счёта</th>
              <th style={{ width: "140px" }}>Дата</th>
              <th className="text-end">Сумма долга</th>
              <th className="text-end">Комиссия</th>
              <th className="text-end">Налог</th>
              <th className="text-end fw-bold">ИТОГО (с налогом)</th>
              <th className="text-end fw-bold text-success">Прибыль</th>
              <th>Комментарий</th>
              <th className="text-center" style={{ width: "120px" }}>Распределение</th>
              <th className="text-center" style={{ width: "100px" }}>Комиссия</th>
              <th className="text-center" style={{ width: "100px" }}>Налог</th>
              <th className="text-center" style={{ width: "110px" }}>Оплата</th>
              <th className="text-center" style={{ width: "110px", whiteSpace: "nowrap" }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={14} className="text-center text-muted py-4">Нет счетов</td></tr>
            ) : (
              invoices.map((inv, idx) => (
                <tr key={inv.id}>
                  <td className="text-center text-muted small">{idx + 1}</td>
                  <td><code>{inv.invoice_number}</code></td>
                  <td className="small">{formatDate(inv.created_at)}</td>
                  <td className="text-end font-monospace small">{formatMoney(inv.debt_amount)}</td>
                  <td className="text-end font-monospace small">{formatMoney(inv.percent_amount)}</td>
                  <td className="text-end font-monospace small">{formatMoney(inv.tax_amount)}</td>
                  <td className="text-end fw-bold text-primary">{formatMoney(inv.total_amount)}</td>
                  <td className="text-end fw-bold text-success">{formatMoney(inv.debt_amount)}</td>
                  <td className="small text-truncate" style={{ maxWidth: "150px" }} title={inv.comment || ""}>{inv.comment || "—"}</td>
                <td className="text-center">
                  {inv.allocation ? (
                    <span className={`badge ${
                      inv.allocation.status === "fully_allocated" ? "bg-success" :
                      inv.allocation.status === "partially_allocated" ? "bg-warning text-dark" :
                      "bg-secondary"
                    }`}>
                      {inv.allocation.status === "fully_allocated" ? "Распределён" :
                       inv.allocation.status === "partially_allocated" ? `Частично (${inv.allocation.allocated_pct}%)` :
                       "Не распределён"}
                    </span>
                  ) : (
                    <span className="badge bg-secondary">Не распределён</span>
                  )}
                </td>
                <td className="text-center small">
                  {inv.commission_user_id ? (
                    <span className="text-success">{(users || []).find(u => u.id === inv.commission_user_id)?.name || "—"}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="text-center small">
                  {inv.tax_user_id ? (
                    <span className="text-danger">{(users || []).find(u => u.id === inv.tax_user_id)?.name || "—"}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="text-center">
                    <button
                      className={`btn btn-sm ${inv.paid ? "btn-success" : "btn-outline-secondary"}`}
                      onClick={() => togglePaid(inv)}
                    >
                      {inv.paid ? "✓ Оплачен" : "Не оплачен"}
                    </button>
                  </td>
                  <td className="text-center" style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="btn btn-sm btn-outline-primary me-1"
                      onClick={() => setEditingInvoice(inv)}
                      title="Редактировать"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => deleteInvoice(inv)}
                    >
                      ✕
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
