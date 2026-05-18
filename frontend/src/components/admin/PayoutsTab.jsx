import React, { useState } from "react";

const STATUS_LABELS = {
  pending: { label: "Ожидает", className: "bg-warning text-dark" },
  completed: { label: "Завершена", className: "bg-success text-white" },
  cancelled: { label: "Отменена", className: "bg-secondary text-white" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_LABELS[status] || { label: status, className: "bg-light text-dark" };
  return <span className={`badge ${cfg.className}`}>{cfg.label}</span>;
}

function formatMoney(n) {
  return (n || 0).toLocaleString("ru-RU");
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function InvoiceDetails({ invoices }) {
  const [expanded, setExpanded] = useState(false);

  if (!invoices || invoices.length === 0) return <span className="text-muted">—</span>;

  return (
    <div className="small">
      <button
        className="btn btn-sm btn-link p-0 text-decoration-none"
        onClick={() => setExpanded(!expanded)}
        style={{ fontSize: "inherit" }}
      >
        {invoices.length} {invoices.length === 1 ? "счёт" : invoices.length < 5 ? "счёта" : "счетов"}
        {expanded ? " ▲" : " ▼"}
      </button>
      {expanded && (
        <table className="table table-sm table-bordered mt-1 mb-0" style={{ fontSize: "0.75rem" }}>
          <thead className="table-light">
            <tr>
              <th>Номер</th>
              <th className="text-end">Доход</th>
              <th className="text-end">Комиссия</th>
              <th className="text-end">Налог</th>
              <th className="text-end">Итого</th>
              <th>Оплата</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.invoice_id || inv.id}>
                <td><code>{inv.invoice_number || inv.invoice_id}</code></td>
                <td className="text-end font-monospace text-success">+{formatMoney(inv.debt_amount)}</td>
                <td className="text-end font-monospace text-info">{formatMoney(inv.percent_amount || 0)}</td>
                <td className="text-end font-monospace text-warning">{formatMoney(inv.tax_amount || 0)}</td>
                <td className="text-end font-monospace fw-bold">{formatMoney(inv.total_amount || inv.amount)}</td>
                <td>{inv.paid ? <span className="badge bg-success">✓</span> : <span className="badge bg-secondary">—</span>}</td>
                <td className="text-muted">{formatDate(inv.invoice_created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function PayoutsTab({ payouts, onEdit, onDelete, onRecalculate, onStatusChange }) {
  const allUserNames = new Set();
  payouts.forEach((p) => {
    (p.shares || []).forEach((sh) => {
      if (sh.user_name) allUserNames.add(sh.user_name);
    });
  });
  const userNames = [...allUserNames];

  const totalNet = payouts.reduce((s, p) => s + (p.net_amount || 0), 0);
  const totalCommission = payouts.reduce((s, p) => s + (p.total_commission || 0), 0);
  const totalTax = payouts.reduce((s, p) => s + (p.total_tax || 0), 0);

  const userTotals = {};
  userNames.forEach((name) => {
    userTotals[name] = { commission: 0, tax: 0, expenses: 0, profit: 0 };
  });
  payouts.forEach((p) => {
    (p.shares || []).forEach((sh) => {
      if (sh.user_name && userTotals[sh.user_name]) {
        userTotals[sh.user_name].commission += sh.commission_amount || 0;
        userTotals[sh.user_name].tax += sh.tax_amount || 0;
        userTotals[sh.user_name].expenses += sh.expenses_compensation || 0;
        userTotals[sh.user_name].profit += sh.profit_share || 0;
      }
    });
  });

  return (
    <>
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
              <th>Счета</th>
              <th className="text-end">Доход</th>
              <th className="text-end">Комиссия</th>
              <th className="text-end">Налог</th>
              <th className="text-end">Расходы</th>
              <th className="text-end">Net</th>
              {userNames.map((name) => (
                <th key={name} className="text-center" style={{ minWidth: "140px" }}>
                  {name}
                </th>
              ))}
              <th className="text-center">Создана</th>
              <th className="text-center">Действия</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => {
              const shares = p.shares || [];
              return (
                <tr key={p.id}>
                  <td className="text-center fw-bold">{p.id}</td>
                  <td>{p.name || "—"}</td>
                  <td className="text-center"><StatusBadge status={p.status} /></td>
                  <td><InvoiceDetails invoices={p.invoices || []} /></td>
                  <td className="text-end font-monospace small text-success">+{formatMoney(p.total_income)} ₽</td>
                  <td className="text-end font-monospace small text-info">{formatMoney(p.total_commission || 0)} ₽</td>
                  <td className="text-end font-monospace small text-warning">{formatMoney(p.total_tax || 0)} ₽</td>
                  <td className="text-end font-monospace small text-danger">−{formatMoney(p.total_expenses)} ₽</td>
                  <td className="text-end font-monospace small fw-bold">{formatMoney(p.net_amount)} ₽</td>

                  {userNames.map((name) => {
                    const sh = shares.find((s) => s.user_name === name);
                    if (!sh) {
                      return <td key={name} className="text-center text-muted">—</td>;
                    }
                    const total = (sh.commission_amount || 0) + (sh.tax_amount || 0) + (sh.expenses_compensation || 0) + (sh.profit_share || 0);
                    return (
                      <td key={name} className="small text-center">
                        <div className="text-muted">{sh.split_pct}%</div>
                        {(sh.commission_amount || 0) > 0 && (
                          <div className="text-info">+{formatMoney(sh.commission_amount)}</div>
                        )}
                        {(sh.tax_amount || 0) > 0 && (
                          <div className="text-warning">+{formatMoney(sh.tax_amount)}</div>
                        )}
                        {(sh.expenses_compensation || 0) > 0 && (
                          <div className="text-danger">−{formatMoney(sh.expenses_compensation)}</div>
                        )}
                        {(sh.profit_share || 0) > 0 && (
                          <div className="text-success">+{formatMoney(sh.profit_share)}</div>
                        )}
                        {total !== 0 && (
                          <div className="fw-bold">= {formatMoney(total)} ₽</div>
                        )}
                      </td>
                    );
                  })}

                  <td className="text-center text-muted small">
                    {new Date(p.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </td>

                  <td className="text-center" style={{ whiteSpace: "nowrap" }}>
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
