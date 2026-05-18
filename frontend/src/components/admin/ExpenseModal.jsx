import React from "react";

export function ExpenseModal({ show, form, setForm, onSubmit, onClose, users }) {
  if (!show) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
  };

  const formatDateForInput = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const parseInputDate = (val) => {
    if (!val) return null;
    return new Date(val).toISOString();
  };

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-dialog-centered modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{form.id ? "Редактировать расход" : "Новый расход"}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label">Сумма (₽)</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  className="form-control"
                  min="0"
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Причина</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                  className="form-control"
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Кто понес</label>
                <select
                  value={form.user_id ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, user_id: e.target.value ? parseInt(e.target.value) : null }))}
                  className="form-select"
                >
                  <option value="">— Не указан —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label">Дата</label>
                <input
                  type="datetime-local"
                  value={form.created_at ? formatDateForInput(form.created_at) : formatDateForInput(new Date().toISOString())}
                  onChange={(e) => setForm((p) => ({ ...p, created_at: parseInputDate(e.target.value) }))}
                  className="form-control"
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Комментарий</label>
                <textarea
                  value={form.comment}
                  onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
                  className="form-control"
                  rows="2"
                />
              </div>
            </form>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-sm btn-primary" onClick={handleSubmit}>
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
