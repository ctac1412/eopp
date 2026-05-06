import React from "react";

export function WithdrawalsTab({ withdrawals, onEdit, onDelete }) {
  return (
    <>
      {withdrawals.length === 0 && (
        <div className="table__empty">Нет записей</div>
      )}

      <div className="admin-withdrawals-container">
        <div className="admin-withdrawals-header">
          <div className="admin-withdrawals-header__id">ID</div>
          <div className="admin-withdrawals-header__name">Название</div>
          <div className="admin-withdrawals-header__percent">Процент</div>
          <div className="admin-withdrawals-header__requisites">Реквизиты</div>
          <div className="admin-withdrawals-header__date">Создан</div>
          <div className="admin-withdrawals-header__actions">Действия</div>
        </div>

        <div className="admin-withdrawals-list">
          {withdrawals.map((w) => (
            <div className="admin-withdrawal-row" key={w.id}>
              <div className="admin-withdrawal-cell admin-withdrawal-cell--id">{w.id}</div>
              <div className="admin-withdrawal-cell admin-withdrawal-cell--name">{w.name}</div>
              <div className="admin-withdrawal-cell admin-withdrawal-cell--percent">{w.percent}%</div>
              <div className="admin-withdrawal-cell admin-withdrawal-cell--requisites">{w.requisites}</div>
              <div className="admin-withdrawal-cell admin-withdrawal-cell--date">{new Date(w.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              <div className="admin-withdrawal-cell admin-withdrawal-cell--actions">
                <button
                  className="btn btn--sm btn--ghost"
                  onClick={() => onEdit(w)}
                  title="Редактировать"
                >
                  ✏️
                </button>
                <button
                  className="btn btn--sm btn--danger"
                  onClick={() => onDelete(w.id)}
                  title="Удалить"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
