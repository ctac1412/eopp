import React from "react";

export function UsageLogEditModal({ show, entry, form, setForm, onSubmit, onClose }) {
  if (!show || !entry) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
  };

  return (
    <div className="modal__overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal--sm" onClick={(e) => e.stopPropagation()}>
        <h3>Редактировать запись #{entry.id}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Цена (₽)</label>
            <input
              type="number"
              value={form.price}
              onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
              className="input"
              min="0"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Оплата</label>
            <select
              value={form.paid}
              onChange={(e) => setForm((p) => ({ ...p, paid: e.target.value }))}
              className="input"
            >
              <option value="">Не задано</option>
              <option value="true">Оплачено</option>
              <option value="false">Не оплачено</option>
            </select>
          </div>
          <div className="modal__footer">
            <button type="button" className="btn btn--secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn--primary">
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
