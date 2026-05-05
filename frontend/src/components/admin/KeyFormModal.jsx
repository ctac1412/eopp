import React from "react";

export function KeyFormModal({ show, mode, form, setForm, onSubmit, onClose }) {
  if (!show) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
  };

  return (
    <div className="modal__overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{mode === "create" ? "Создать новый ключ" : "Редактировать ключ"}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Label</label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              placeholder={mode === "create" ? "напр. production" : ""}
              className="input"
              required={mode === "create"}
            />
          </div>
          {mode === "edit" && (
            <>
              <div className="form-group">
                <label className="form-label">Комментарий</label>
                <input
                  type="text"
                  value={form.comment}
                  onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
                  className="input"
                />
              </div>
              <div className="form-row">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                  className="checkbox"
                />
                Активен
              </div>
            </>
          )}
          <div className="form-group">
            <label className="form-label">Max Uses (пусто = без лимита)</label>
            <input
              type="number"
              value={form.maxUses}
              onChange={(e) => setForm((p) => ({ ...p, maxUses: e.target.value }))}
              placeholder="∞"
              className="input"
              min="1"
            />
          </div>
          {mode === "edit" && (
            <div className="admin-tariff-section">
              <div className="admin-tariff-title">Тариф</div>
              <div className="admin-tariff-inputs">
                <div className="form-group">
                  <label className="form-label">Запись (₽)</label>
                  <input
                    type="number"
                    value={form.priceCreate}
                    onChange={(e) => setForm((p) => ({ ...p, priceCreate: e.target.value }))}
                    placeholder="0"
                    className="input"
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Бронь (₽)</label>
                  <input
                    type="number"
                    value={form.priceReschedule}
                    onChange={(e) => setForm((p) => ({ ...p, priceReschedule: e.target.value }))}
                    placeholder="0"
                    className="input"
                    min="0"
                  />
                </div>
              </div>
            </div>
          )}
          <div className="modal__footer">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
            >
              Отмена
            </button>
            <button type="submit" className="btn btn--primary">
              {mode === "create" ? "Создать" : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DeleteConfirmModal({ show, onConfirm, onClose }) {
  if (!show) return null;
  return (
    <div className="modal__overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal modal--sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Подтверждение</h3>
        <p className="admin-confirm-text">
          Вы уверены, что хотите удалить этот ключ? Это действие нельзя отменить.
        </p>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--danger" onClick={onConfirm}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}