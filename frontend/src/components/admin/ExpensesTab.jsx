import React from "react";

export function ExpensesTab({ expenses, total, users, onEdit, onDelete }) {
  return (
    <>
      {expenses.length === 0 && (
        <div className="table__empty">Нет записей</div>
      )}

      {total > 0 && (
        <div className="alert alert-secondary mb-3" style={{ fontSize: "0.875rem" }}>
          <strong>Всего расходов:</strong> {total.toLocaleString("ru-RU")} ₽
        </div>
      )}

      <div className="table-responsive">
        <table className="table table-sm table-hover table-bordered align-middle">
          <thead className="table-light">
            <tr>
              <th className="text-center">ID</th>
              <th className="text-end">Сумма</th>
              <th>Причина</th>
              <th>Комментарий</th>
              <th>Кто понес</th>
              <th className="text-center">Распределение</th>
              <th className="text-center">Создан</th>
              <th className="text-center">Действия</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td className="text-center fw-bold">{e.id}</td>
                <td className="text-end font-monospace small">{e.amount.toLocaleString("ru-RU")} ₽</td>
                <td>{e.reason}</td>
                <td className="small">{e.comment || "—"}</td>
                <td>
                  {e.user_name || "—"}
                </td>
                <td className="text-center">
                  {e.allocation ? (
                    <span className={`badge ${
                      e.allocation.status === "fully_allocated" ? "bg-success" :
                      e.allocation.status === "partially_allocated" ? "bg-warning text-dark" :
                      "bg-secondary"
                    }`}>
                      {e.allocation.status === "fully_allocated" ? "Распределён" :
                       e.allocation.status === "partially_allocated" ? `Частично (${e.allocation.allocated_pct}%)` :
                       "Не распределён"}
                    </span>
                  ) : (
                    <span className="badge bg-secondary">Не распределён</span>
                  )}
                </td>
                <td className="text-center text-muted small">
                  {new Date(e.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="text-center">
                  <button
                    className="btn btn-sm btn-outline-primary me-1"
                    onClick={() => onEdit(e)}
                    title="Редактировать"
                  >
                    &#9998;
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => onDelete(e.id)}
                    title="Удалить"
                  >
                    &#128465;
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}