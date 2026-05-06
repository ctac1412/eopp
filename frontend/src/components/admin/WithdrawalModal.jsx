import React from "react";

export function WithdrawalModal({ show, form, setForm, onSubmit, onClose }) {
  if (!show) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
  };

  return (
    <div className="modal__overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal--sm" onClick={(e) => e.stopPropagation()}>
        <h3>{form.id ? "Редактировать способ вывода" : "Новый способ вывода"}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Название</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="input"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Процент</label>
            <input
              type="number"
              value={form.percent}
              onChange={(e) => setForm((p) => ({ ...p, percent: e.target.value }))}
              className="input"
              min="0"
              max="100"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Реквизиты</label>
            <input
              type="text"
              value={form.requisites}
              onChange={(e) => setForm((p) => ({ ...p, requisites: e.target.value }))}
              className="input"
              required
            />
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
