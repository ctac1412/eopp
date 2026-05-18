import React from "react";

const STATUS_LABELS = {
  pending: { label: "Ожидает", className: "bg-warning text-dark" },
  completed: { label: "Завершена", className: "bg-success text-white" },
  cancelled: { label: "Отменена", className: "bg-secondary text-white" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_LABELS[status] || { label: status, className: "bg-light text-dark" };
  return <span className={`badge ${cfg.className}`}>{cfg.label}</span>;
}

export function PayoutsTab({ payouts, onEdit, onDelete, onRecalculate, onStatusChange }) {
  const totalNet = payouts.reduce((s, p) => s + (p.net_amount || 0), 0);
  const totalExp1 = payouts.reduce((s, p) => s + (p.expenses_user1 || 0), 0);
  const totalExp2 = payouts.reduce((s, p) => s + (p.expenses_user2 || 0), 0);
  const totalProf1 = payouts.reduce((s, p) => s + (p.amount_user1 || 0), 0);
  const totalProf2 = payouts.reduce((s, p) => s + (p.amount_user2 || 0), 0);
  const totalAll1 = totalExp1 + totalProf1;
  const totalAll2 = totalExp2 + totalProf2;

  return (
    <>
      <div className="d-flex gap-2 mb-3" style={{ fontSize: "0.8rem" }}>
        <div className="alert alert-secondary py-1 mb-0 flex-fill text-center">
          <div className="small text-muted">Net (все)</div>
          <strong>{totalNet.toLocaleString("ru-RU")} ₽</strong>
        </div>
        <div className="alert alert-warning py-1 mb-0 flex-fill text-center">
          <div className="small text-muted">Итого {payouts[0]?.user1_name || "Пользователь 1"}</div>
          <strong className="text-danger">-{totalExp1.toLocaleString("ru-RU")} ₽</strong>
          <span className="mx-1">+</span>
          <strong className="text-success">{totalProf1.toLocaleString("ru-RU")} ₽</strong>
          <div className="fw-bold">= {totalAll1.toLocaleString("ru-RU")} ₽</div>
        </div>
        <div className="alert alert-info py-1 mb-0 flex-fill text-center">
          <div className="small text-muted">Итого {payouts[0]?.user2_name || "Пользователь 2"}</div>
          <strong className="text-danger">-{totalExp2.toLocaleString("ru-RU")} ₽</strong>
          <span className="mx-1">+</span>
          <strong className="text-success">{totalProf2.toLocaleString("ru-RU")} ₽</strong>
          <div className="fw-bold">= {totalAll2.toLocaleString("ru-RU")} ₽</div>
        </div>
      </div>

      {payouts.length === 0 && (
        <div className="table__empty">Нет выплат</div>
      )}

      <div className="table-responsive">
        <table className="table table-sm table-hover table-bordered align-middle">
          <thead className="table-light">
            <tr>
              <th className="text-center">ID</th>
              <th>Название</th>
              <th className="text-center">Статус</th>
              <th className="text-end">Доход</th>
              <th className="text-end">Расходы</th>
              <th className="text-end">Net</th>
              <th>Пользователь 1</th>
              <th className="text-end">За расходы</th>
              <th className="text-end">За прибыль</th>
              <th className="text-end">Итого</th>
              <th>Пользователь 2</th>
              <th className="text-end">За расходы</th>
              <th className="text-end">За прибыль</th>
              <th className="text-end">Итого</th>
              <th className="text-center">Создана</th>
              <th className="text-center">Действия</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => {
              const total1 = (p.expenses_user1 || 0) + (p.amount_user1 || 0);
              const total2 = (p.expenses_user2 || 0) + (p.amount_user2 || 0);
              return (
                <tr key={p.id}>
                  <td className="text-center fw-bold">{p.id}</td>
                  <td>{p.name || "—"}</td>
                  <td className="text-center"><StatusBadge status={p.status} /></td>
                  <td className="text-end font-monospace small text-success">+{p.total_income.toLocaleString("ru-RU")} ₽</td>
                  <td className="text-end font-monospace small text-danger">−{p.total_expenses.toLocaleString("ru-RU")} ₽</td>
                  <td className="text-end font-monospace small fw-bold">{p.net_amount.toLocaleString("ru-RU")} ₽</td>

                  <td className="small">
                    {p.user1_name || <span className="text-muted">—</span>}
                    <br />
                    <span className="text-muted">{p.split_pct1}%</span>
                  </td>
                  <td className="text-end font-monospace small text-danger">
                    {(p.expenses_user1 || 0) > 0 ? `−${p.expenses_user1.toLocaleString("ru-RU")} ₽` : "—"}
                  </td>
                  <td className="text-end font-monospace small text-success">
                    {(p.amount_user1 || 0) > 0 ? `+${p.amount_user1.toLocaleString("ru-RU")} ₽` : "—"}
                  </td>
                  <td className="text-end font-monospace fw-bold">
                    {total1 > 0 ? `${total1.toLocaleString("ru-RU")} ₽` : "—"}
                  </td>

                  <td className="small">
                    {p.user2_name || <span className="text-muted">—</span>}
                    <br />
                    <span className="text-muted">{p.split_pct2}%</span>
                  </td>
                  <td className="text-end font-monospace small text-danger">
                    {(p.expenses_user2 || 0) > 0 ? `−${p.expenses_user2.toLocaleString("ru-RU")} ₽` : "—"}
                  </td>
                  <td className="text-end font-monospace small text-success">
                    {(p.amount_user2 || 0) > 0 ? `+${p.amount_user2.toLocaleString("ru-RU")} ₽` : "—"}
                  </td>
                  <td className="text-end font-monospace fw-bold">
                    {total2 > 0 ? `${total2.toLocaleString("ru-RU")} ₽` : "—"}
                  </td>

                  <td className="text-center text-muted small">
                    {new Date(p.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </td>

                  <td className="text-center">
                    {p.status === "pending" && (
                      <>
                        <button className="btn btn-sm btn-outline-primary me-1" onClick={() => onEdit(p)} title="Редактировать">&#9998;</button>
                        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => onRecalculate(p.id)} title="Пересчитать">↻</button>
                        <button className="btn btn-sm btn-success me-1" onClick={() => onStatusChange(p.id, "completed")} title="Завершить">✓</button>
                        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => onStatusChange(p.id, "cancelled")} title="Отменить">✕</button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => onDelete(p.id)} title="Удалить">&#128465;</button>
                      </>
                    )}
                    {p.status !== "pending" && (
                      <button className="btn btn-sm btn-outline-danger" onClick={() => onDelete(p.id)} title="Удалить">&#128465;</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}