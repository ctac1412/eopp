import React from "react";

export function UsersTab({ users, onEdit, onDelete }) {
  return (
    <>
      {users.length === 0 && (
        <div className="table__empty">Нет пользователей</div>
      )}

      <div className="table-responsive">
        <table className="table table-sm table-hover table-bordered align-middle">
          <thead className="table-light">
            <tr>
              <th className="text-center">ID</th>
              <th>Имя</th>
              <th className="text-center">Создан</th>
              <th className="text-center">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="text-center fw-bold">{u.id}</td>
                <td>{u.name}</td>
                <td className="text-center text-muted small">
                  {new Date(u.created_at).toLocaleDateString("ru-RU", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </td>
                <td className="text-center">
                  <button
                    className="btn btn-sm btn-outline-primary me-1"
                    onClick={() => onEdit(u)}
                    title="Редактировать"
                  >
                    &#9998;
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => onDelete(u.id)}
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