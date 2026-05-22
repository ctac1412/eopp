import React, { useMemo, useState } from "react";

function formatMoney(amount) {
  return `${Math.round(Number(amount || 0)).toLocaleString("ru-RU")} ₽`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function allocationStatus(item) {
  return item.allocation?.status || "not_allocated";
}

function SummaryCard({ label, value, tone = "secondary" }) {
  return (
    <div className={`border-start border-4 border-${tone} bg-light p-2 h-100`}>
      <div className="text-muted small">{label}</div>
      <div className="fw-semibold">{value}</div>
    </div>
  );
}

function AllocationBadge({ allocation }) {
  const status = allocation?.status || "not_allocated";
  if (status === "fully_allocated") {
    return <span className="badge bg-success">Распределен</span>;
  }
  if (status === "partially_allocated") {
    return (
      <span className="badge bg-warning text-dark">
        Частично ({allocation.allocated_pct}%)
      </span>
    );
  }
  return <span className="badge bg-secondary">Не распределен</span>;
}

export function ExpensesTab({ expenses, total, users, onEdit, onDelete }) {
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [allocationFilter, setAllocationFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const userOptions = useMemo(() => {
    const options = new Map();
    expenses.forEach((expense) => {
      if (expense.user_id) {
        options.set(String(expense.user_id), expense.user_name || `#${expense.user_id}`);
      }
    });
    users?.forEach((user) => options.set(String(user.id), user.name));
    return [...options.entries()].map(([id, name]) => ({ id, name }));
  }, [expenses, users]);

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return expenses.filter((expense) => {
      const createdAt = expense.created_at ? new Date(expense.created_at) : null;
      const haystack = [
        expense.id,
        expense.amount,
        expense.reason,
        expense.comment,
        expense.user_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (q && !haystack.includes(q)) return false;
      if (userFilter !== "all" && String(expense.user_id || "") !== userFilter) return false;
      if (allocationFilter !== "all" && allocationStatus(expense) !== allocationFilter) return false;
      if (from && createdAt && createdAt < from) return false;
      if (to && createdAt && createdAt > to) return false;
      return true;
    });
  }, [expenses, search, userFilter, allocationFilter, dateFrom, dateTo]);

  const metrics = useMemo(() => {
    const sum = filteredExpenses.reduce((acc, expense) => acc + (expense.amount || 0), 0);
    const allocated = filteredExpenses.filter(
      (expense) => allocationStatus(expense) === "fully_allocated",
    ).length;
    const partial = filteredExpenses.filter(
      (expense) => allocationStatus(expense) === "partially_allocated",
    ).length;
    return {
      count: filteredExpenses.length,
      sum,
      avg: filteredExpenses.length ? Math.round(sum / filteredExpenses.length) : 0,
      allocated,
      partial,
      unallocated: filteredExpenses.length - allocated - partial,
    };
  }, [filteredExpenses]);

  return (
    <>
      <div className="row g-2 mb-3">
        <div className="col-6 col-xl-2">
          <SummaryCard label="Показано" value={`${metrics.count} из ${expenses.length}`} tone="primary" />
        </div>
        <div className="col-6 col-xl-2">
          <SummaryCard label="Сумма" value={formatMoney(metrics.sum)} tone="danger" />
        </div>
        <div className="col-6 col-xl-2">
          <SummaryCard label="Средний расход" value={formatMoney(metrics.avg)} />
        </div>
        <div className="col-6 col-xl-2">
          <SummaryCard label="Распределены" value={metrics.allocated} tone="success" />
        </div>
        <div className="col-6 col-xl-2">
          <SummaryCard label="Частично" value={metrics.partial} tone="warning" />
        </div>
        <div className="col-6 col-xl-2">
          <SummaryCard label="Не распределены" value={metrics.unallocated} tone="dark" />
        </div>
      </div>

      <div className="row g-2 align-items-end mb-3">
        <div className="col-12 col-xl-4">
          <label className="form-label small mb-1">Поиск</label>
          <input
            className="form-control form-control-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Причина, комментарий, пользователь, ID"
          />
        </div>
        <div className="col-6 col-md-3 col-xl-2">
          <label className="form-label small mb-1">Кто понес</label>
          <select className="form-select form-select-sm" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="all">Все</option>
            {userOptions.map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-3 col-xl-2">
          <label className="form-label small mb-1">Распределение</label>
          <select className="form-select form-select-sm" value={allocationFilter} onChange={(e) => setAllocationFilter(e.target.value)}>
            <option value="all">Все</option>
            <option value="fully_allocated">Распределены</option>
            <option value="partially_allocated">Частично</option>
            <option value="not_allocated">Не распределены</option>
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

      {expenses.length === 0 && <div className="table__empty">Нет записей</div>}
      {total > 0 && total !== metrics.sum && (
        <div className="text-muted small mb-2">Всего расходов без фильтров: {formatMoney(total)}</div>
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
            {filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-4">
                  Нет расходов по выбранным фильтрам
                </td>
              </tr>
            ) : (
              filteredExpenses.map((expense) => (
                <tr key={expense.id}>
                  <td className="text-center fw-bold">{expense.id}</td>
                  <td className="text-end font-monospace small">{formatMoney(expense.amount)}</td>
                  <td>{expense.reason}</td>
                  <td className="small">{expense.comment || "—"}</td>
                  <td>{expense.user_name || "—"}</td>
                  <td className="text-center"><AllocationBadge allocation={expense.allocation} /></td>
                  <td className="text-center text-muted small">{formatDate(expense.created_at)}</td>
                  <td className="text-center">
                    <button
                      className="btn btn-sm btn-outline-primary me-1"
                      onClick={() => onEdit(expense)}
                      title="Редактировать"
                    >
                      &#9998;
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => onDelete(expense.id)}
                      title="Удалить"
                    >
                      &#128465;
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
