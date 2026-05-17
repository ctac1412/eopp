import React from "react";

export function UsageLogEditModal({ show, entry, form, setForm, onSubmit, onClose }) {
  if (!show || !entry) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
  };

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-dialog-centered modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Редактировать запись #{entry.id}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label">Цена (₽)</label>
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                  className="form-control"
                  min="0"
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Оплата</label>
                <select
                  value={form.paid}
                  onChange={(e) => setForm((p) => ({ ...p, paid: e.target.value }))}
                  className="form-select"
                >
                  <option value="">Не задано</option>
                  <option value="true">Оплачено</option>
                  <option value="false">Не оплачено</option>
                </select>
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
