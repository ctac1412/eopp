import React, { useState, useEffect, useCallback, useRef } from "react";

export function PayoutModal({
  show,
  form,
  setForm,
  onSubmit,
  onClose,
  preview,
  users,
  availableInvoices,
  availableExpenses,
  onPreview,
  previewLoading,
}) {
  const [debouncedPreview, setDebouncedPreview] = useState(null);
  const timerRef = useRef(null);

  // Debounced preview call
  const triggerPreview = useCallback(
    (invoiceIds, expenseIds, splits) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onPreview?.(invoiceIds, expenseIds, splits);
      }, 400);
    },
    [onPreview],
  );

  // Trigger preview when form changes
  useEffect(() => {
    if (!show) return;
    const splits = (form.splits || []).filter((s) => s.user_id != null);
    if (splits.length === 0) return;
    triggerPreview(form.invoice_ids || [], form.expense_ids || [], splits);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show, form.invoice_ids, form.expense_ids, form.splits, triggerPreview]);

  if (!show) return null;

  const splits = form.splits || [];
  const totalPct = splits.reduce((s, sp) => s + (Number(sp.split_pct) || 0), 0);
  const pctWarning = Math.abs(totalPct - 100) > 0.01 && splits.length > 0;

  const handleAddSplit = () => {
    setForm((p) => ({
      ...p,
      splits: [...(p.splits || []), { user_id: null, split_pct: 0 }],
    }));
  };

  const handleRemoveSplit = (idx) => {
    setForm((p) => ({
      ...p,
      splits: (p.splits || []).filter((_, i) => i !== idx),
    }));
  };

  const handleSplitUserChange = (idx, userId) => {
    setForm((p) => {
      const newSplits = [...(p.splits || [])];
      newSplits[idx] = { ...newSplits[idx], user_id: userId };
      return { ...p, splits: newSplits };
    });
  };

  const handleSplitPctChange = (idx, val) => {
    setForm((p) => {
      const newSplits = [...(p.splits || [])];
      newSplits[idx] = { ...newSplits[idx], split_pct: Number(val) || 0 };
      return { ...p, splits: newSplits };
    });
  };

  const toggleInvoice = (invId) => {
    setForm((p) => {
      const ids = p.invoice_ids || [];
      const newIds = ids.includes(invId)
        ? ids.filter((id) => id !== invId)
        : [...ids, invId];
      return { ...p, invoice_ids: newIds };
    });
  };

  const toggleExpense = (expId) => {
    setForm((p) => {
      const ids = p.expense_ids || [];
      const newIds = ids.includes(expId)
        ? ids.filter((id) => id !== expId)
        : [...ids, expId];
      return { ...p, expense_ids: newIds };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
  };

  const formatMoney = (n) => (n || 0).toLocaleString("ru-RU");

  const userName = (userId) => {
    const u = users.find((u) => u.id === userId);
    return u ? u.name : "?";
  };

  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{form.id ? "Редактировать выплату" : "Новая выплата"}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
            <form onSubmit={handleSubmit}>
              {/* Name */}
              <div className="mb-3">
                <label className="form-label">Название</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="form-control"
                  placeholder="Выплата за май 2026"
                  required
                />
              </div>

              {/* Invoices selector */}
              <div className="mb-3">
                <label className="form-label fw-bold">
                  Счета ({(form.invoice_ids || []).length} выбрано из {availableInvoices.length})
                </label>
                <div style={{ maxHeight: "150px", overflowY: "auto", border: "1px solid #dee2e6", borderRadius: "6px", padding: "8px" }}>
                  {availableInvoices.length === 0 && (
                    <div className="text-muted small">Нет счетов</div>
                  )}
                  {availableInvoices.map((inv) => {
                    const checked = (form.invoice_ids || []).includes(inv.id);
                    return (
                      <label key={inv.id} className="d-flex align-items-center gap-2 mb-1" style={{ cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleInvoice(inv.id)}
                        />
                        <span className="small">
                          #{inv.id} {inv.invoice_number || ""} — <strong>{formatMoney(inv.debt_amount)} ₽</strong>
                          {inv.total_amount !== inv.debt_amount && <span className="text-muted"> (всего {formatMoney(inv.total_amount)})</span>}
                          {inv.comment && <span className="text-muted"> ({inv.comment})</span>}
                          {inv.allocation && inv.allocation.status !== "unallocated" && (
                            <span className={`badge ms-1 ${
                              inv.allocation.status === "fully_allocated" ? "bg-success" : "bg-warning text-dark"
                            }`}>
                              {inv.allocation.status === "fully_allocated" ? "распределён" : `${inv.allocation.allocated_pct}%`}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Expenses selector */}
              <div className="mb-3">
                <label className="form-label fw-bold">
                  Расходы ({(form.expense_ids || []).length} выбрано из {availableExpenses.length})
                </label>
                <div style={{ maxHeight: "150px", overflowY: "auto", border: "1px solid #dee2e6", borderRadius: "6px", padding: "8px" }}>
                  {availableExpenses.length === 0 && (
                    <div className="text-muted small">Нет расходов</div>
                  )}
                  {availableExpenses.map((exp) => {
                    const checked = (form.expense_ids || []).includes(exp.id);
                    return (
                      <label key={exp.id} className="d-flex align-items-center gap-2 mb-1" style={{ cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleExpense(exp.id)}
                        />
                        <span className="small">
                          #{exp.id} {exp.reason} — <strong>{formatMoney(exp.amount)} ₽</strong>
                          {exp.user_name && <span className="text-muted"> ({exp.user_name})</span>}
                          {exp.allocation && exp.allocation.status !== "unallocated" && (
                            <span className={`badge ms-1 ${
                              exp.allocation.status === "fully_allocated" ? "bg-success" : "bg-warning text-dark"
                            }`}>
                              {exp.allocation.status === "fully_allocated" ? "распределён" : `${exp.allocation.allocated_pct}%`}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <hr />

              {/* User splits */}
              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <label className="form-label fw-bold mb-0">Участники и доли</label>
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={handleAddSplit}>
                    + Добавить
                  </button>
                </div>

                {splits.length === 0 && (
                  <div className="text-muted small mb-2">Добавьте участников</div>
                )}

                {splits.map((sp, idx) => (
                  <div key={idx} className="row g-2 mb-2 align-items-center">
                    <div className="col-7">
                      <select
                        value={sp.user_id ?? ""}
                        onChange={(e) => handleSplitUserChange(idx, e.target.value ? parseInt(e.target.value) : null)}
                        className="form-select form-select-sm"
                      >
                        <option value="">— Пользователь —</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-4">
                      <div className="input-group input-group-sm">
                        <input
                          type="number"
                          value={sp.split_pct}
                          onChange={(e) => handleSplitPctChange(idx, e.target.value)}
                          className={`form-control ${pctWarning ? "is-invalid" : ""}`}
                          min="0"
                          max="100"
                          step="0.01"
                        />
                        <span className="input-group-text">%</span>
                      </div>
                    </div>
                    <div className="col-1 text-center">
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleRemoveSplit(idx)}>
                        ×
                      </button>
                    </div>
                  </div>
                ))}

                {pctWarning && (
                  <div className="alert alert-warning py-1 small mt-2 mb-0">
                    Сумма долей: {totalPct.toFixed(1)}% (должно быть 100%)
                  </div>
                )}
              </div>

              {/* Preview */}
              {(preview || previewLoading) && (
                <div className="mb-0">
                  {previewLoading ? (
                    <div className="small text-muted">Расчёт...</div>
                  ) : preview ? (
                    <div className="table-responsive">
                      <table className="table table-sm table-bordered align-middle mb-0" style={{ fontSize: "0.8rem" }}>
                        <thead className="table-light">
                          <tr>
                            <th>Участник</th>
                            <th className="text-end">Доля</th>
                            <th className="text-end">Прибыль</th>
                            <th className="text-end">Комиссия</th>
                            <th className="text-end">Налог</th>
                            <th className="text-end">Расходы</th>
                            <th className="text-end fw-bold">Итого</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(preview.shares || []).map((sh, i) => (
                            <tr key={i}>
                              <td className="fw-bold">{userName(sh.user_id)}</td>
                              <td className="text-end font-monospace">{sh.split_pct}%</td>
                              <td className="text-end font-monospace">{formatMoney(sh.profit_share)} ₽</td>
                              <td className="text-end font-monospace">{formatMoney(sh.commission_amount || 0)} ₽</td>
                              <td className="text-end font-monospace">{formatMoney(sh.tax_amount || 0)} ₽</td>
                              <td className="text-end font-monospace">{formatMoney(sh.expenses_compensation || 0)} ₽</td>
                              <td className="text-end font-monospace fw-bold">{formatMoney(sh.total)} ₽</td>
                            </tr>
                          ))}
                          <tr style={{ backgroundColor: "#e9ecef" }}>
                            <td className="fw-bold">Итого</td>
                            <td className="text-end font-monospace fw-bold">{splits.reduce((s, sp) => s + (Number(sp.split_pct) || 0), 0).toFixed(1)}%</td>
                            <td className="text-end font-monospace fw-bold">{formatMoney(preview.shares.reduce((s, sh) => s + (sh.profit_share || 0), 0))} ₽</td>
                            <td className="text-end font-monospace fw-bold">{formatMoney(preview.total_commission)} ₽</td>
                            <td className="text-end font-monospace fw-bold">{formatMoney(preview.total_tax)} ₽</td>
                            <td className="text-end font-monospace fw-bold">{formatMoney(preview.total_expenses)} ₽</td>
                            <td className="text-end font-monospace fw-bold">{formatMoney(preview.shares.reduce((s, sh) => s + (sh.total || 0), 0))} ₽</td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="small text-muted mt-1">
                        {preview.invoice_count} счетов, {preview.expense_count} расходов &rarr;
                        доход {formatMoney(preview.total_income)} ₽
                        &nbsp;−&nbsp; расходы {formatMoney(preview.total_expenses)} ₽
                        &nbsp;=&nbsp; <strong>net {formatMoney(preview.net_amount)} ₽</strong>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </form>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              onClick={handleSubmit}
              disabled={pctWarning || splits.length === 0}
            >
              {form.id ? "Сохранить" : "Создать"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
