import React from "react";

export function KeyFormModal({ show, mode, form, setForm, onSubmit, onClose, onResetUsage, onDeleteKey, companies = [] }) {
  if (!show) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
  };

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-dialog modal-dialog-centered ${mode === "edit" ? "modal-lg" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{mode === "create" ? "Создать новый ключ" : "Редактировать ключ"}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label">Label</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                  placeholder={mode === "create" ? "напр. production" : ""}
                  className="form-control"
                  required={mode === "create"}
                />
              </div>
              {mode === "edit" && (
                <>
                  <div className="mb-3">
                    <label className="form-label">Комментарий</label>
                    <input
                      type="text"
                      value={form.comment}
                      onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
                      className="form-control"
                    />
                  </div>
                  <div className="mb-3 form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="keyActive"
                      checked={form.active}
                      onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                    />
                    <label className="form-check-label" htmlFor="keyActive">
                      Активен
                    </label>
                  </div>
                </>
              )}
              <div className="mb-3 form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="keyIsExternal"
                  checked={form.isExternal || false}
                  onChange={(e) => setForm((p) => ({ ...p, isExternal: e.target.checked }))}
                />
                <label className="form-check-label" htmlFor="keyIsExternal">
                  Внешний клиент
                </label>
              </div>
              <div className="mb-3">
                <label className="form-label">Компания</label>
                <select
                  className="form-select"
                  value={form.companyId || ""}
                  onChange={(e) => setForm((p) => ({ ...p, companyId: e.target.value }))}
                  style={{ background: "#0d1117", color: "#c9d1d9", border: "1px solid #30363d" }}
                >
                  <option value="">Без компании</option>
                  {companies.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label">Max Uses (пусто = без лимита)</label>
                <input
                  type="number"
                  value={form.maxUses}
                  onChange={(e) => setForm((p) => ({ ...p, maxUses: e.target.value }))}
                  placeholder="∞"
                  className="form-control"
                  min="1"
                />
              </div>
              {mode === "edit" && (
                <div className="mb-3">
                  <div className="fw-semibold mb-2">Тариф</div>
                  <div className="row g-2">
                    <div className="col">
                      <label className="form-label">Бронь (₽)</label>
                      <input
                        type="number"
                        value={form.priceCreate}
                        onChange={(e) => setForm((p) => ({ ...p, priceCreate: e.target.value }))}
                        placeholder="1000"
                        className="form-control"
                        min="0"
                      />
                    </div>
                    <div className="col">
                      <label className="form-label">Перенос (₽)</label>
                      <input
                        type="number"
                        value={form.priceReschedule}
                        onChange={(e) => setForm((p) => ({ ...p, priceReschedule: e.target.value }))}
                        placeholder="7000"
                        className="form-control"
                        min="0"
                      />
                    </div>
                    <div className="col">
                      <label className="form-label">Бронь 12:00 (₽)</label>
                      <input
                        type="number"
                        value={form.priceCreatePeak}
                        onChange={(e) => setForm((p) => ({ ...p, priceCreatePeak: e.target.value }))}
                        placeholder="как перенос"
                        className="form-control"
                        min="0"
                      />
                    </div>
                    <div className="col">
                      <label className="form-label">Свои слоты (₽)</label>
                      <input
                        type="number"
                        value={form.priceCustomSlots}
                        onChange={(e) => setForm((p) => ({ ...p, priceCustomSlots: e.target.value }))}
                        placeholder="0"
                        className="form-control"
                        min="0"
                      />
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
          <div className="modal-footer">
            {mode === "edit" && (
              <>
                <button type="button" className="btn btn-sm btn-outline-secondary me-auto" onClick={() => onResetUsage()}>
                  Сбросить использование
                </button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => onDeleteKey()}>
                  Удалить ключ
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={onClose}
            >
              Отмена
            </button>
            <button type="submit" className="btn btn-sm btn-primary" onClick={handleSubmit}>
              {mode === "create" ? "Создать" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DeleteConfirmModal({ show, onConfirm, onClose }) {
  if (!show) return null;
  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-dialog-centered modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Подтверждение</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <p>Вы уверены, что хотите удалить этот ключ? Это действие нельзя отменить.</p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-sm btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button className="btn btn-sm btn-danger" onClick={onConfirm}>
              Удалить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
