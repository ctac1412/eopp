import React from "react";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WithdrawalModal({ show, withdrawals, form, setForm, onCreate, onUpdate, onDelete, onClose }) {
  if (!show) return null;

  return (
    <div className="modal__overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal--lg" onClick={(e) => e.stopPropagation()}>
        <h3>Withdrawals</h3>
        <div className="admin-withdrawals-toolbar">
          <button
            className="btn btn--primary"
            onClick={() => setForm({ id: null, name: "", percent: "", requisites: "" })}
          >
            + Новый
          </button>
          <button className="btn btn--secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Процент</th>
                <th>Реквизиты</th>
                <th>Создан</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table__empty">Нет записей</td>
                </tr>
              ) : (
                withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td>{w.name}</td>
                    <td>{w.percent}%</td>
                    <td>{w.requisites}</td>
                    <td className="table__cell--date">{formatDate(w.created_at)}</td>
                    <td className="table__cell--actions">
                      <button
                        className="btn btn--sm"
                        onClick={() => setForm({ id: w.id, name: w.name, percent: String(w.percent), requisites: w.requisites })}
                      >
                        Изменить
                      </button>
                      <button
                        className="btn btn--sm btn--danger"
                        onClick={() => onDelete(w.id)}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {form.name !== "" && (
          <div className="admin-withdrawal-form">
            <h4>{form.id ? "Редактировать" : "Создать"}</h4>
            <form onSubmit={form.id ? onUpdate : onCreate}>
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
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setForm({ id: null, name: "", percent: "", requisites: "" })}
                >
                  Отмена
                </button>
                <button type="submit" className="btn btn--primary">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}