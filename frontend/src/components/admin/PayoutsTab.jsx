import React, { useMemo, useState } from "react";

const STATUS_LABELS = {
  pending: { label: "Ожидает", className: "bg-warning text-dark" },
  completed: { label: "Завершена", className: "bg-success text-white" },
  cancelled: { label: "Отменена", className: "bg-secondary text-white" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_LABELS[status] || { label: status || "—", className: "bg-light text-dark" };
  return <span className={`badge ${cfg.className}`}>{cfg.label}</span>;
}

function formatMoney(n) {
  return `${Math.round(Number(n || 0)).toLocaleString("ru-RU")} в‚Ѕ`;
}

function formatDate(iso, withTime = false) {
  if (!iso) return "—";
  const options = withTime
    ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit", year: "numeric" };
  return new Date(iso).toLocaleDateString("ru-RU", options);
}

function SummaryCard({ label, value, tone = "secondary" }) {
  return (
    <div className={`border-start border-4 border-${tone} bg-dark-subtle rounded px-2 py-1 h-100`}>
      <div className="text-secondary-emphasis small">{label}</div>
      <div className="fw-semibold text-light">{value}</div>
    </div>
  );
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
        {invoices.length} {invoices.length === 1 ? "счет" : invoices.length < 5 ? "счета" : "счетов"}
        {expanded ? " в–І" : " в–ј"}
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
            {invoices.map((invoice) => (
              <tr key={invoice.invoice_id || invoice.id}>
                <td><code>{invoice.invoice_number || invoice.invoice_id}</code></td>
                <td className="text-end font-monospace text-success">+{formatMoney(invoice.debt_amount)}</td>
                <td className="text-end font-monospace text-info">{formatMoney(invoice.percent_amount || 0)}</td>
                <td className="text-end font-monospace text-warning">{formatMoney(invoice.tax_amount || 0)}</td>
                <td className="text-end font-monospace fw-bold">{formatMoney(invoice.total_amount || invoice.amount)}</td>
                <td>{invoice.paid ? <span className="badge bg-success">опл.</span> : <span className="badge bg-secondary">нет</span>}</td>
                <td className="text-muted">{formatDate(invoice.invoice_created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ExpenseDetails({ expenses }) {
  const [expanded, setExpanded] = useState(false);
  if (!expenses || expenses.length === 0) return <span className="text-muted">—</span>;

  const compensated = expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
  return (
    <div className="small">
      <button
        className="btn btn-sm btn-link p-0 text-decoration-none"
        onClick={() => setExpanded(!expanded)}
        style={{ fontSize: "inherit" }}
      >
        {expenses.length} расхода, {formatMoney(compensated)}
        {expanded ? " в–І" : " в–ј"}
      </button>
      {expanded && (
        <table className="table table-sm table-bordered mt-1 mb-0" style={{ fontSize: "0.75rem" }}>
          <thead className="table-light">
            <tr>
              <th>ID</th>
              <th className="text-end">Компенсация</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => (
              <tr key={expense.expense_id || expense.id}>
                <td><code>{expense.expense_id || expense.id}</code></td>
                <td className="text-end font-monospace text-danger">−{formatMoney(expense.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function payoutSearchText(payout) {
  return [
    payout.id,
    payout.name,
    payout.status,
    ...(payout.invoices || []).map((invoice) => invoice.invoice_number || invoice.invoice_id),
    ...(payout.shares || []).map((share) => share.user_name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function PayoutsTab({ payouts, onEdit, onDelete, onRecalculate, onStatusChange, onCreate, onRefresh }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const allUserNames = useMemo(() => {
    const names = new Set();
    payouts.forEach((payout) => {
      (payout.shares || []).forEach((share) => {
        if (share.user_name) names.add(share.user_name);
      });
    });
    return [...names].sort();
  }, [payouts]);

  const filteredPayouts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return payouts.filter((payout) => {
      const createdAt = payout.created_at ? new Date(payout.created_at) : null;
      if (q && !payoutSearchText(payout).includes(q)) return false;
      if (statusFilter !== "all" && payout.status !== statusFilter) return false;
      if (userFilter !== "all" && !(payout.shares || []).some((share) => share.user_name === userFilter)) return false;
      if (from && createdAt && createdAt < from) return false;
      if (to && createdAt && createdAt > to) return false;
      return true;
    });
  }, [payouts, search, statusFilter, userFilter, dateFrom, dateTo]);

  const metrics = useMemo(() => ({
    count: filteredPayouts.length,
    pending: filteredPayouts.filter((payout) => payout.status === "pending").length,
    completed: filteredPayouts.filter((payout) => payout.status === "completed").length,
    net: filteredPayouts.reduce((sum, payout) => sum + (payout.net_amount || 0), 0),
    income: filteredPayouts.reduce((sum, payout) => sum + (payout.total_income || 0), 0),
    expenses: filteredPayouts.reduce((sum, payout) => sum + (payout.total_expenses || 0), 0),
    commission: filteredPayouts.reduce((sum, payout) => sum + (payout.total_commission || 0), 0),
    tax: filteredPayouts.reduce((sum, payout) => sum + (payout.total_tax || 0), 0),
  }), [filteredPayouts]);

  const userTotals = useMemo(() => {
    const totals = {};
    allUserNames.forEach((name) => {
      totals[name] = { commission: 0, tax: 0, expenses: 0, profit: 0, total: 0 };
    });
    filteredPayouts.forEach((payout) => {
      (payout.shares || []).forEach((share) => {
        if (!share.user_name || !totals[share.user_name]) return;
        totals[share.user_name].commission += share.commission_amount || 0;
        totals[share.user_name].tax += share.tax_amount || 0;
        totals[share.user_name].expenses += share.expenses_compensation || 0;
        totals[share.user_name].profit += share.profit_share || 0;
        totals[share.user_name].total += share.total || 0;
      });
    });
    return totals;
  }, [filteredPayouts, allUserNames]);

  const visibleUserNames = allUserNames.filter((name) => userFilter === "all" || name === userFilter);

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex gap-2 align-items-center">
          <button className="btn btn-outline-secondary btn-sm" onClick={onRefresh}>
            Обновить
          </button>
          <span className="text-muted small">Показано: {filteredPayouts.length} из {payouts.length}</span>
        </div>
        <button className="btn btn-sm btn-primary" onClick={onCreate}>
          + Новая выплата
        </button>
      </div>

      <div className="row g-2 mb-3">
        <div className="col-6 col-xl-2"><SummaryCard label="Выплат" value={`${metrics.count} из ${payouts.length}`} tone="primary" /></div>
        <div className="col-6 col-xl-2"><SummaryCard label="Ожидают" value={metrics.pending} tone="warning" /></div>
        <div className="col-6 col-xl-2"><SummaryCard label="Завершены" value={metrics.completed} tone="success" /></div>
        <div className="col-6 col-xl-2"><SummaryCard label="Доход" value={formatMoney(metrics.income)} tone="success" /></div>
        <div className="col-6 col-xl-2"><SummaryCard label="Расходы" value={formatMoney(metrics.expenses)} tone="danger" /></div>
        <div className="col-6 col-xl-2"><SummaryCard label="Net" value={formatMoney(metrics.net)} tone="dark" /></div>
      </div>

      <div className="row g-2 align-items-end mb-3">
        <div className="col-12 col-xl-4">
          <label className="form-label small mb-1">Поиск</label>
          <input className="form-control form-control-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Название, счет, участник, ID" />
        </div>
        <div className="col-6 col-md-3 col-xl-2">
          <label className="form-label small mb-1">Статус</label>
          <select className="form-select form-select-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Все</option>
            <option value="pending">Ожидает</option>
            <option value="completed">Завершена</option>
            <option value="cancelled">Отменена</option>
          </select>
        </div>
        <div className="col-6 col-md-3 col-xl-2">
          <label className="form-label small mb-1">Участник</label>
          <select className="form-select form-select-sm" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="all">Все</option>
            {allUserNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div className="col-6 col-md-3 col-xl-2">
          <label className="form-label small mb-1">С даты</label>
          <input className="form-control form-control-sm" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="col-6 col-md-3 col-xl-2">
          <label className="form-label small mb-1">По дату</label>
          <input className="form-control form-control-sm" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {visibleUserNames.length > 0 && (
        <div className="row g-2 mb-3">
          {visibleUserNames.map((name) => {
            const total = userTotals[name] || {};
            return (
              <div className="col-12 col-md-6 col-xl-3" key={name}>
                <div className="border rounded p-2 bg-dark-subtle h-100">
                  <div className="fw-semibold mb-1 text-light">{name}</div>
                  <div className="d-flex justify-content-between small"><span>Комиссия</span><span className="text-info">{formatMoney(total.commission)}</span></div>
                  <div className="d-flex justify-content-between small"><span>Налог</span><span className="text-warning">{formatMoney(total.tax)}</span></div>
                  <div className="d-flex justify-content-between small"><span>Расходы</span><span className="text-danger">−{formatMoney(total.expenses)}</span></div>
                  <div className="d-flex justify-content-between small"><span>Прибыль</span><span className="text-success">{formatMoney(total.profit)}</span></div>
                  <div className="d-flex justify-content-between border-top mt-1 pt-1 fw-semibold"><span className="text-secondary-emphasis">Итого</span><span className="text-light">{formatMoney(total.total)}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {payouts.length === 0 && <div className="table__empty">Нет выплат</div>}

      <div className="table-responsive">
        <table className="table table-sm table-hover table-bordered align-middle">
          <thead className="table-light">
            <tr>
              <th className="text-center">ID</th>
              <th>Выплата</th>
              <th className="text-center">Статус</th>
              <th>Счета</th>
              <th>Расходы</th>
              <th className="text-end">Доход</th>
              <th className="text-end">Комиссия</th>
              <th className="text-end">Налог</th>
              <th className="text-end">Net</th>
              {visibleUserNames.map((name) => (
                <th key={name} className="text-center" style={{ minWidth: "150px" }}>{name}</th>
              ))}
              <th className="text-center">Создана</th>
              <th className="text-center">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayouts.length === 0 ? (
              <tr><td colSpan={11 + visibleUserNames.length} className="text-center text-muted py-4">Нет выплат по выбранным фильтрам</td></tr>
            ) : filteredPayouts.map((payout) => {
              const shares = payout.shares || [];
              return (
                <tr key={payout.id}>
                  <td className="text-center fw-bold">{payout.id}</td>
                  <td>
                    <div className="fw-semibold">{payout.name || "—"}</div>
                    {payout.completed_at && <div className="text-muted small">Закрыта: {formatDate(payout.completed_at, true)}</div>}
                  </td>
                  <td className="text-center"><StatusBadge status={payout.status} /></td>
                  <td><InvoiceDetails invoices={payout.invoices || []} /></td>
                  <td><ExpenseDetails expenses={payout.expenses || []} /></td>
                  <td className="text-end font-monospace small text-success">+{formatMoney(payout.total_income)}</td>
                  <td className="text-end font-monospace small text-info">{formatMoney(payout.total_commission || 0)}</td>
                  <td className="text-end font-monospace small text-warning">{formatMoney(payout.total_tax || 0)}</td>
                  <td className="text-end font-monospace small fw-bold">{formatMoney(payout.net_amount)}</td>

                  {visibleUserNames.map((name) => {
                    const share = shares.find((item) => item.user_name === name);
                    if (!share) return <td key={name} className="text-center text-muted">—</td>;
                    return (
                      <td key={name} className="small">
                        <div className="d-flex justify-content-between"><span>{share.split_pct}%</span><strong>{formatMoney(share.total)}</strong></div>
                        {(share.commission_amount || 0) > 0 && <div className="d-flex justify-content-between text-info"><span>ком.</span><span>{formatMoney(share.commission_amount)}</span></div>}
                        {(share.tax_amount || 0) > 0 && <div className="d-flex justify-content-between text-warning"><span>налог</span><span>{formatMoney(share.tax_amount)}</span></div>}
                        {(share.expenses_compensation || 0) > 0 && <div className="d-flex justify-content-between text-danger"><span>расх.</span><span>−{formatMoney(share.expenses_compensation)}</span></div>}
                        {(share.profit_share || 0) > 0 && <div className="d-flex justify-content-between text-success"><span>приб.</span><span>{formatMoney(share.profit_share)}</span></div>}
                      </td>
                    );
                  })}

                  <td className="text-center text-muted small">{formatDate(payout.created_at)}</td>
                  <td className="text-center" style={{ whiteSpace: "nowrap" }}>
                    {payout.status === "pending" && (
                      <>
                        <button className="btn btn-sm btn-outline-primary me-1" onClick={() => onEdit(payout)} title="Редактировать">&#9998;</button>
                        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => onRecalculate(payout.id)} title="Пересчитать">↻</button>
                        <button className="btn btn-sm btn-success me-1" onClick={() => onStatusChange(payout.id, "completed")} title="Завершить">✓</button>
                        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => onStatusChange(payout.id, "cancelled")} title="Отменить">×</button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => onDelete(payout.id)} title="Удалить">&#128465;</button>
                      </>
                    )}
                    {payout.status !== "pending" && (
                      <button className="btn btn-sm btn-outline-danger" onClick={() => onDelete(payout.id)} title="Удалить">&#128465;</button>
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



