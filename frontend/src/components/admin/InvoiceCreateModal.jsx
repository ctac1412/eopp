import React, { useState } from "react";
import { formatMoney } from "../../utils/format";

function adminHeaders(token) {
  return { "Content-Type": "application/json", "X-Admin-Token": token };
}

export function InvoiceCreateModal({ show, onClose, onCreated, adminToken, users }) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [comment, setComment] = useState("");
  const [percentRate, setPercentRate] = useState(5);
  const [taxRate, setTaxRate] = useState(6);
  const [commissionUserId, setCommissionUserId] = useState(null);
  const [taxUserId, setTaxUserId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const addItem = () => {
    setItems((prev) => [...prev, { description: "", amount: 0 }]);
  };

  const removeItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: field === "amount" ? (Number(value) || 0) : value };
      return next;
    });
  };

  const itemsTotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const combinedRate = percentRate + taxRate;
  const divisor = combinedRate < 100 ? 1 - combinedRate / 100 : 0;
  const calcTotal = divisor > 0 ? Math.round(itemsTotal / divisor) : 0;
  const calcPercent = Math.round(calcTotal * percentRate / 100);
  const calcTax = Math.round(calcTotal * taxRate / 100);

  const handleSubmit = async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const body = {
        invoice_number: invoiceNumber || undefined,
        comment,
        percent_rate: percentRate,
        tax_rate: taxRate,
        debt_amount: itemsTotal,
        percent_amount: calcPercent,
        tax_amount: calcTax,
        total_amount: calcTotal,
        commission_user_id: commissionUserId,
        tax_user_id: taxUserId,
        items: items.map((it, i) => ({ description: it.description, amount: Number(it.amount) || 0, sort_order: i })),
      };
      const res = await fetch("/admin/invoices", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onCreated?.(data);
      setInvoiceNumber("");
      setComment("");
      setPercentRate(5);
      setTaxRate(6);
      setCommissionUserId(null);
      setTaxUserId(null);
      setItems([]);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Новый счёт</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
            {/* Invoice number */}
            <div className="mb-3">
              <label className="form-label">Номер счёта</label>
              <input
                type="text"
                className="form-control"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Авто, если пусто"
              />
            </div>

            {/* Line items */}
            <div className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <label className="form-label fw-bold mb-0">Строки счёта</label>
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={addItem}>+ Добавить</button>
              </div>
              {items.length === 0 && (
                <div className="text-muted small mb-2">Добавьте хотя бы одну строку</div>
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
                <div className="small fw-semibold">Сумма строк (debt): {formatMoney(itemsTotal)}</div>
              )}
            </div>

            <hr />

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
                    value={percentRate}
                    onChange={(e) => setPercentRate(Number(e.target.value) || 0)}
                  />
                  <div className="small text-muted mt-1">{formatMoney(calcPercent)} от ИТОГО</div>
                </div>
                <div className="col-6">
                  <label className="form-label small text-muted">Налог (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control form-control-sm"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                  />
                  <div className="small text-muted mt-1">{formatMoney(calcTax)} от ИТОГО</div>
                </div>
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
                    value={commissionUserId ?? ""}
                    onChange={(e) => setCommissionUserId(e.target.value ? Number(e.target.value) : null)}
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
                    value={taxUserId ?? ""}
                    onChange={(e) => setTaxUserId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— Не указан —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Total */}
            <div className="alert alert-secondary py-2 mb-2">
              <div className="small">
                debt {formatMoney(itemsTotal)} / (1 − {combinedRate.toFixed(2)}%) = <strong>{formatMoney(calcTotal)}</strong>
              </div>
            </div>

            {/* Comment */}
            <div className="mb-3">
              <label className="form-label">Комментарий</label>
              <textarea
                className="form-control"
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>Отмена</button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleSubmit}
              disabled={loading || items.length === 0 || itemsTotal <= 0}
            >
              {loading ? "Создание..." : "Создать"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
