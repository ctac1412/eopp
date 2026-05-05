import React from "react";

export function InvoiceModal({ show, withdrawals, selectedCount, form, setForm, onGenerate, onClose }) {
  if (!show) return null;

  return (
    <div className="modal__overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Генерация счёта</h3>
        <div className="form-group">
          <label className="form-label">Получатель</label>
          <select
            value={form.withdrawalId}
            onChange={(e) => setForm((p) => ({ ...p, withdrawalId: e.target.value }))}
            className="input select"
            required
          >
            <option value="">Выберите получателя</option>
            {withdrawals.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.percent}%)
              </option>
            ))}
          </select>
        </div>
        <div className="admin-invoice-summary">
          <div className="admin-invoice-summary-title">Выбранные записи:</div>
          <div className="admin-invoice-summary-count">
            {selectedCount}
          </div>
        </div>
        <div className="modal__footer">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onGenerate}
          >
            Сгенерировать
          </button>
        </div>
      </div>
    </div>
  );
}