import React from "react";

export function PayoutModal({ show, form, setForm, onSubmit, onClose, preview, users, onPctChange }) {
  if (!show) return null;

  const handlePct1Change = (val) => {
    setForm((p) => ({ ...p, split_pct1: val }));
    onPctChange?.(parseInt(val) || 0, parseInt(form.split_pct2) || 0);
  };

  const handlePct2Change = (val) => {
    setForm((p) => ({ ...p, split_pct2: val }));
    onPctChange?.(parseInt(form.split_pct1) || 0, parseInt(val) || 0);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
  };

  const totalPct = (parseInt(form.split_pct1) || 0) + (parseInt(form.split_pct2) || 0);
  const pctWarning = totalPct !== 100;

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{form.id ? "Редактировать выплату" : "Новая выплата"}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleSubmit}>
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

              <hr />
              <h6 className="mb-3">Пользователь 1</h6>
              <div className="row g-2 mb-3">
                <div className="col-7">
                  <label className="form-label small">Пользователь</label>
                  <select
                    value={form.user_id1 ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, user_id1: e.target.value ? parseInt(e.target.value) : null }))}
                    className="form-select"
                  >
                    <option value="">— Не выбран —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-5">
                  <label className="form-label small">Процент</label>
                  <div className="input-group">
                    <input
                      type="number"
                      value={form.split_pct1}
                      onChange={(e) => handlePct1Change(e.target.value)}
                      className={`form-control ${pctWarning ? "is-invalid" : ""}`}
                      min="0"
                      max="100"
                      required
                    />
                    <span className="input-group-text">%</span>
                  </div>
                </div>
              </div>

              <hr />
              <h6 className="mb-3">Пользователь 2</h6>
              <div className="row g-2 mb-3">
                <div className="col-7">
                  <label className="form-label small">Пользователь</label>
                  <select
                    value={form.user_id2 ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, user_id2: e.target.value ? parseInt(e.target.value) : null }))}
                    className="form-select"
                  >
                    <option value="">— Не выбран —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-5">
                  <label className="form-label small">Процент</label>
                  <div className="input-group">
                    <input
                      type="number"
                      value={form.split_pct2}
                      onChange={(e) => handlePct2Change(e.target.value)}
                      className={`form-control ${pctWarning ? "is-invalid" : ""}`}
                      min="0"
                      max="100"
                      required
                    />
                    <span className="input-group-text">%</span>
                  </div>
                </div>
              </div>

              {pctWarning && (
                <div className="alert alert-warning py-2 small">
                  Сумма процентов: {totalPct}% (должно быть 100%)
                </div>
              )}

              {preview && (
                <div className="alert alert-secondary py-2">
                  <div className="small text-muted mb-1">
                    {preview.invoice_count} счетов &rarr; доход {preview.total_income.toLocaleString("ru-RU")} ₽
                    &nbsp;&minus;&nbsp; расходы {preview.total_expenses.toLocaleString("ru-RU")} ₽
                    &nbsp;=&nbsp; <strong>net {preview.net_amount.toLocaleString("ru-RU")} ₽</strong>
                  </div>
                  <div className="font-monospace small">
                    {form.user_id1 ? users.find(u => u.id === form.user_id1)?.name || "?" : "?"}:{" "}
                    <span className="text-danger">−{preview.expenses_user1.toLocaleString("ru-RU")} ₽</span>{" "}
                    <span className="text-success">+{preview.amount_user1.toLocaleString("ru-RU")} ₽</span>{" "}
                    <strong>= {(preview.expenses_user1 + preview.amount_user1).toLocaleString("ru-RU")} ₽</strong>
                    {" | "}
                    {form.user_id2 ? users.find(u => u.id === form.user_id2)?.name || "?" : "?"}:{" "}
                    <span className="text-danger">−{preview.expenses_user2.toLocaleString("ru-RU")} ₽</span>{" "}
                    <span className="text-success">+{preview.amount_user2.toLocaleString("ru-RU")} ₽</span>{" "}
                    <strong>= {(preview.expenses_user2 + preview.amount_user2).toLocaleString("ru-RU")} ₽</strong>
                  </div>
                </div>
              )}
            </form>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-sm btn-primary" onClick={handleSubmit} disabled={pctWarning}>
              {form.id ? "Сохранить" : "Создать"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}