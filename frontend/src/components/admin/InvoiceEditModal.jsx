import React, { useState, useEffect } from "react";
import { formatMoney } from "../../utils/format";

function adminHeaders(token) {
  return { "Content-Type": "application/json", "X-Admin-Token": token };
}

export function InvoiceEditModal({ show, invoice, onClose, onSave, adminToken, users }) {
  const [form, setForm] = useState({
    comment: "",
    percent_rate: 0,
    tax_rate: 0,
    debt_amount: 0,
    percent_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    commission_user_id: null,
    tax_user_id: null,
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [usageLogs, setUsageLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (show && invoice) {
      setForm({
        comment: invoice.comment || "",
        percent_rate: invoice.percent_rate || 0,
        tax_rate: invoice.tax_rate || 0,
        debt_amount: invoice.debt_amount || 0,
        percent_amount: invoice.percent_amount || 0,
        tax_amount: invoice.tax_amount || 0,
        total_amount: invoice.total_amount || 0,
        commission_user_id: invoice.commission_user_id || null,
        tax_user_id: invoice.tax_user_id || null,
      });
      setItems(invoice.items || []);
      // Load usage logs for this invoice
      setLogsLoading(true);
      fetch(`/usage-log?invoice_id=${invoice.id}`, { headers: { "X-Admin-Token": adminToken } })
        .then((r) => r.json())
        .then((data) => setUsageLogs(Array.isArray(data) ? data : []))
        .catch(() => setUsageLogs([]))
        .finally(() => setLogsLoading(false));
    }
  }, [show, invoice]);

  const combinedRate = (form.percent_rate || 0) + (form.tax_rate || 0);
  const divisor = combinedRate < 100 ? 1 - combinedRate / 100 : 0;
  const calcTotal = divisor > 0 ? Math.round(form.debt_amount / divisor) : 0;
  const calcPercent = Math.round(calcTotal * (form.percent_rate || 0) / 100);
  const calcTax = Math.round(calcTotal * (form.tax_rate || 0) / 100);

  const addItem = () => {
    setItems((prev) => [...prev, { id: null, description: "", amount: 0, sort_order: prev.length }]);
  };

  const removeItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const itemsTotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const body = {
        comment: form.comment,
        percent_rate: form.percent_rate,
        tax_rate: form.tax_rate,
        debt_amount: form.debt_amount,
        percent_amount: form.percent_amount,
        tax_amount: form.tax_amount,
        total_amount: form.total_amount,
        commission_user_id: form.commission_user_id,
        tax_user_id: form.tax_user_id,
        items: items.map((it, i) => ({
          description: it.description,
          amount: Number(it.amount) || 0,
          sort_order: it.sort_order ?? i,
        })),
      };
      const res = await fetch(`/admin/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      onSave?.(data);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!show || !invoice) return null;

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Редактировать счёт #{invoice.id}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
            {/* Line items */}
            <div className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <label className="form-label fw-bold mb-0">Строки счёта</label>
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={addItem}>+ Добавить</button>
              </div>
              {items.length === 0 && (
                <div className="text-muted small mb-2">Нет строк</div>
              )}
              {items.map((it, idx) => (
                <div key={idx} className="row g-2 mb-2 align-items-center">
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Описание"
                      value={it.description}
                      onChange={(e) => updateItem(idx, "description", e.target.value)}
                    />
                  </div>
                  <div className="col-3">
                    <div className="input-group input-group-sm">
                      <input
                        type="number"
                        className="form-control"
                        value={it.amount}
                        onChange={(e) => updateItem(idx, "amount", e.target.value)}
                      />
                      <span className="input-group-text">₽</span>
                    </div>
                  </div>
                  <div className="col-1 text-center">
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeItem(idx)}>×</button>
                  </div>
                </div>
              ))}
              {items.length > 0 && (
                <div className="small text-muted">Сумма строк: {formatMoney(itemsTotal)}</div>
              )}
            </div>

            <hr />

            {/* Linked usage logs */}
            <div className="mb-3">
              <label className="form-label fw-bold">Записи в счёте</label>
              {logsLoading && <div className="text-muted small">Загрузка...</div>}
              {!logsLoading && usageLogs.length === 0 && (
                <div className="text-muted small">Нет привязанных записей</div>
              )}
              {usageLogs.length > 0 && (
                <div style={{ maxHeight: "150px", overflowY: "auto" }}>
                  <table className="table table-sm table-borderless small mb-0">
                    <thead>
                      <tr className="text-muted">
                        <th>ID</th><th>Дата</th><th>Ключ</th><th>Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageLogs.map((log) => (
                        <tr key={log.id}>
                          <td>{log.id}</td>
                          <td>{log.created_at ? new Date(log.created_at).toLocaleDateString("ru-RU") : "—"}</td>
                          <td>{log.label || log.api_key_id || "—"}</td>
                          <td>{formatMoney(log.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <hr />

            {/* Amounts */}
            <div className="mb-3">
              <label className="form-label fw-bold">Суммы</label>
              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label small text-muted">Сумма долга (debt)</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={form.debt_amount}
                    onChange={(e) => setForm((p) => ({ ...p, debt_amount: Number(e.target.value) || 0 }))}
                  />
                </div>
                <div className="col-6">
                  <label className="form-label small text-muted">Итого (total)</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={form.total_amount}
                    onChange={(e) => setForm((p) => ({ ...p, total_amount: Number(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            </div>

            {/* Rates */}
            <div className="mb-3">
              <label className="form-label fw-bold">Ставки</label>
              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label small text-muted">Комиссия (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control form-control-sm"
                    value={form.percent_rate}
                    onChange={(e) => setForm((p) => ({ ...p, percent_rate: Number(e.target.value) || 0 }))}
                  />
                </div>
                <div className="col-6">
                  <label className="form-label small text-muted">Налог (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control form-control-sm"
                    value={form.tax_rate}
                    onChange={(e) => setForm((p) => ({ ...p, tax_rate: Number(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              <div className="small text-muted mt-1">
                Расчёт: debt {formatMoney(form.debt_amount)} / (1 − {((form.percent_rate || 0) + (form.tax_rate || 0)).toFixed(2)}%) = {formatMoney(calcTotal)}
              </div>
            </div>

            {/* User assignments */}
            <div className="mb-3">
              <label className="form-label fw-bold">Распределение</label>
              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label small text-muted">Кто получает комиссию</label>
                  <select
                    className="form-select form-select-sm"
                    value={form.commission_user_id ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, commission_user_id: e.target.value ? Number(e.target.value) : null }))}
                  >
                    <option value="">— Не указан —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label small text-muted">Кто платит налог</label>
                  <select
                    className="form-select form-select-sm"
                    value={form.tax_user_id ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, tax_user_id: e.target.value ? Number(e.target.value) : null }))}
                  >
                    <option value="">— Не указан —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Comment */}
            <div className="mb-3">
              <label className="form-label">Комментарий</label>
              <textarea
                className="form-control"
                rows={2}
                value={form.comment}
                onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>Отмена</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
