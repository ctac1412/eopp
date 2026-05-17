import React from "react";

export function WithdrawalsTab({ withdrawals, onEdit, onDelete }) {
  return (
    <>
      {withdrawals.length === 0 && (
        <div className="table__empty">Нет записей</div>
      )}

      <div className="table-responsive">
        <table className="table table-sm table-hover table-bordered align-middle">
          <thead className="table-light">
            <tr>
              <th className="text-center">ID</th>
              <th>Название</th>
              <th className="text-center">Процент</th>
              <th className="text-center">Тип</th>
              <th className="text-center">Налог</th>
              <th>Реквизиты</th>
              <th className="text-center">Создан</th>
              <th className="text-center">Действия</th>
            </tr>
          </thead>
          <tbody>
            {withdrawals.map((w) => (
              <tr key={w.id}>
                <td className="text-center fw-bold">{w.id}</td>
                <td>{w.name}</td>
                <td className="text-center font-monospace small">{w.percent}%</td>
                <td className="text-center small">{w.percent_type === "included" ? "Вкл" : "Не вкл"}</td>
                <td className="text-center font-monospace small">{w.tax_percent || 0}%</td>
                <td className="small">{w.requisites}</td>
                <td className="text-center text-muted small">
                  {new Date(w.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="text-center">
                  <button
                    className="btn btn-sm btn-outline-primary me-1"
                    onClick={() => onEdit(w)}
                    title="Редактировать"
                  >
                    &#9998;
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => onDelete(w.id)}
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
