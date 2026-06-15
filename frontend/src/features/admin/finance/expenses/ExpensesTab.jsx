import React, { useMemo, useState } from "react";
import { Card, Modal, Space } from "antd";
import {
  Button,
  DataTable,
  FilterBar,
  MetricsStrip,
  SelectInput,
  StatusTag,
  TextInput,
  Toolbar,
} from "../../../../ui";

function formatMoney(amount) {
  return `${Math.round(Number(amount || 0)).toLocaleString("ru-RU")} ₽`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("ru-RU", {
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

function allocationLabel(allocation) {
  const status = allocation?.status || "not_allocated";
  if (status === "fully_allocated") return "Распределён";
  if (status === "partially_allocated") return `Частично ${allocation.allocated_pct || 0}%`;
  return "Не распределён";
}

function allocationTone(allocation) {
  const status = allocation?.status || "not_allocated";
  if (status === "fully_allocated") return "confirmed";
  if (status === "partially_allocated") return "warning";
  return "neutral";
}

export function ExpensesTab({ expenses, total, users, onEdit, onDelete, onCreate, onRefresh }) {
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
    return [...options.entries()].map(([value, label]) => ({ value, label }));
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
  }, [allocationFilter, dateFrom, dateTo, expenses, search, userFilter]);

  const stats = useMemo(() => {
    const sum = filteredExpenses.reduce((acc, expense) => acc + (expense.amount || 0), 0);
    const allocated = filteredExpenses.filter((expense) => allocationStatus(expense) === "fully_allocated").length;
    const partial = filteredExpenses.filter((expense) => allocationStatus(expense) === "partially_allocated").length;
    const unallocated = filteredExpenses.length - allocated - partial;
    return { sum, allocated, partial, unallocated, avg: filteredExpenses.length ? Math.round(sum / filteredExpenses.length) : 0 };
  }, [filteredExpenses]);

  const metrics = [
    { key: "count", label: "Показано", value: `${filteredExpenses.length} / ${expenses.length}`, tone: filteredExpenses.length === expenses.length ? "neutral" : "warning" },
    { key: "sum", label: "Сумма", value: formatMoney(stats.sum), tone: stats.sum > 0 ? "danger" : "neutral" },
    { key: "avg", label: "Средний", value: formatMoney(stats.avg), tone: "neutral" },
    { key: "allocated", label: "Распределены", value: stats.allocated, tone: stats.allocated > 0 ? "success" : "neutral" },
    { key: "partial", label: "Частично", value: stats.partial, tone: stats.partial > 0 ? "warning" : "neutral" },
    { key: "open", label: "Не распределены", value: stats.unallocated, tone: stats.unallocated > 0 ? "warning" : "success" },
  ];

  const confirmDelete = (expense) => {
    Modal.confirm({
      title: "Удалить расход?",
      content: `Расход #${expense.id} на ${formatMoney(expense.amount)} будет удалён.`,
      okText: "Удалить",
      okButtonProps: { danger: true },
      cancelText: "Отмена",
      onOk: () => onDelete(expense.id),
    });
  };

  const columns = [
    { title: "ID", dataIndex: "id", width: 54, render: (value) => <span className="text-muted">#{value}</span> },
    {
      title: "Сумма",
      dataIndex: "amount",
      width: 92,
      align: "right",
      render: (value) => <span className="font-monospace">{formatMoney(value)}</span>,
    },
    { title: "Причина", dataIndex: "reason", width: 150, ellipsis: true, render: (value) => value || "—" },
    { title: "Комментарий", dataIndex: "comment", width: 180, ellipsis: true, render: (value) => <span title={value || "—"}>{value || "—"}</span> },
    { title: "Кто понёс", dataIndex: "user_name", width: 120, ellipsis: true, render: (value) => value || "—" },
    {
      title: "Распределение",
      dataIndex: "allocation",
      width: 136,
      align: "center",
      render: (allocation) => <StatusTag status={allocationTone(allocation)} label={allocationLabel(allocation)} />,
    },
    { title: "Создан", dataIndex: "created_at", width: 132, render: formatDate },
    {
      title: "",
      width: 112,
      align: "right",
      render: (_, expense) => (
        <Space size={4}>
          <Button size="small" onClick={() => onEdit(expense)}>Изм.</Button>
          <Button size="small" variant="danger" onClick={() => confirmDelete(expense)}>Удал.</Button>
        </Space>
      ),
    },
  ];

  return (
    <div data-eopp-component="ExpensesTab" className="expenses-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Расходы</h2>
            <div className="small text-muted">
              Операционные расходы, ответственные пользователи и статус распределения по выплатам
            </div>
          </div>
        }
        right={
          <Space wrap>
            <Button size="small" onClick={onRefresh}>Обновить</Button>
            <Button size="small" variant="primary" onClick={onCreate}>Новый расход</Button>
          </Space>
        }
      />

      <MetricsStrip items={metrics} />

      {total > 0 && total !== stats.sum && (
        <div className="text-muted small mt-2">Всего расходов без фильтров: {formatMoney(total)}</div>
      )}

      <Card data-eopp-component="ExpensesListCard" className="mt-3" size="small" title="Список расходов">
        <FilterBar className="mb-3">
          <label className="form-label small mb-0 expenses-search">
            Поиск
            <TextInput
              size="small"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="причина, комментарий, пользователь, ID"
            />
          </label>
          <label className="form-label small mb-0">
            Кто понёс
            <SelectInput
              size="small"
              value={userFilter}
              onChange={(value) => setUserFilter(value || "all")}
              options={[{ value: "all", label: "Все" }, ...userOptions]}
              allowClear={false}
              style={{ minWidth: 170 }}
            />
          </label>
          <label className="form-label small mb-0">
            Распределение
            <SelectInput
              size="small"
              value={allocationFilter}
              onChange={(value) => setAllocationFilter(value || "all")}
              options={[
                { value: "all", label: "Все" },
                { value: "fully_allocated", label: "Распределены" },
                { value: "partially_allocated", label: "Частично" },
                { value: "not_allocated", label: "Не распределены" },
              ]}
              allowClear={false}
              style={{ minWidth: 170 }}
            />
          </label>
          <label className="form-label small mb-0">
            С даты
            <TextInput
              data-eopp-component="ExpensesDateFrom"
              size="small"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label className="form-label small mb-0">
            По дату
            <TextInput
              data-eopp-component="ExpensesDateTo"
              size="small"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
        </FilterBar>

        <DataTable
          className="expenses-table"
          rowKey="id"
          data={filteredExpenses}
          columns={columns}
          emptyText="Нет расходов"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
        />
      </Card>
    </div>
  );
}
