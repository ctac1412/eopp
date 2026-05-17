import React, { useState, useEffect, useCallback } from "react";

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

export function InvoicesTab({ adminToken, onError }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState({});

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

  const generatePdf = async (invoice) => {
    setPdfLoading((prev) => ({ ...prev, [invoice.id]: true }));
    try {
      const res = await fetch(`/admin/invoices/${invoice.id}/generate-pdf`, {
        method: "POST",
        headers: adminHeaders(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (onError) onError(`PDF ${data.invoice_number} создан: ${data.path}`);
      fetchInvoices();
    } catch (err) {
      setError(err.message);
    } finally {
      setPdfLoading((prev) => ({ ...prev, [invoice.id]: false }));
    }
  };

  if (loading) return <div className="text-center text-muted py-5">Загрузка…</div>;
  if (error) return <div className="alert alert-danger">Ошибка: {error}</div>;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-secondary btn-sm" onClick={fetchInvoices}>
          Обновить
        </button>
        <span className="text-muted small">Всего: {invoices.length}</span>
      </div>

      <div className="table-responsive">
        <table className="table table-sm table-hover table-bordered align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th className="text-center" style={{ width: "40px" }}>#</th>
              <th>Номер счёта</th>
              <th style={{ width: "140px" }}>Дата</th>
              <th className="text-center" style={{ width: "60px" }}>Записей</th>
              <th className="text-end">Сумма долга</th>
              <th className="text-end">Комиссия</th>
              <th className="text-end">Налог</th>
              <th className="text-end fw-bold">ИТОГО</th>
              <th>Комментарий</th>
              <th className="text-center" style={{ width: "110px" }}>Оплата</th>
              <th className="text-center" style={{ width: "70px" }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={11} className="text-center text-muted py-4">Нет счетов</td></tr>
            ) : (
              invoices.map((inv, idx) => (
                <tr key={inv.id}>
                  <td className="text-center text-muted small">{idx + 1}</td>
                  <td><code>{inv.invoice_number}</code></td>
                  <td className="small">{formatDate(inv.created_at)}</td>
                  <td className="text-center">{inv.usage_log_ids?.length || 0}</td>
                  <td className="text-end font-monospace small">{inv.debt_amount} ₽</td>
                  <td className="text-end font-monospace small">{inv.percent_amount} ₽</td>
                  <td className="text-end font-monospace small">{inv.tax_amount} ₽</td>
                  <td className="text-end fw-bold text-primary">{inv.total_amount} ₽</td>
                  <td className="small text-truncate" style={{ maxWidth: "150px" }} title={inv.comment || ""}>{inv.comment || "—"}</td>
                  <td className="text-center">
                    <button
                      className={`btn btn-sm ${inv.paid ? "btn-success" : "btn-outline-secondary"}`}
                      onClick={() => togglePaid(inv)}
                    >
                      {inv.paid ? "✓ Оплачен" : "Не оплачен"}
                    </button>
                  </td>
                  <td className="text-center">
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => generatePdf(inv)}
                      disabled={pdfLoading[inv.id]}
                    >
                      {pdfLoading[inv.id] ? "..." : "PDF"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
