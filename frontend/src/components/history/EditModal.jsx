import React from "react";

export function EditModal({ show, form, setForm, onSubmit, onClose }) {
  if (!show) return null;

  return (
    <div className="modal__overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Редактировать запись</h3>
        <form onSubmit={onSubmit}>
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
          <div className="form-row">
            <input
              type="checkbox"
              checked={form.paid}
              onChange={(e) => setForm((p) => ({ ...p, paid: e.target.checked }))}
              className="checkbox"
            />
            Оплачен
          </div>
          <div className="modal__footer">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
            >
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