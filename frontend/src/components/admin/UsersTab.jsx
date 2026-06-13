import React, { useMemo, useState } from "react";
import { Card, Modal, Space } from "antd";
import {
  Button,
  DataTable,
  FilterBar,
  MetricsStrip,
  SelectInput,
  TextInput,
  Toolbar,
} from "../../ui";

function formatDate(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function toDate(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isCreatedWithin(user, days) {
  const createdAt = toDate(user.created_at);
  if (!createdAt) return false;
  const threshold = startOfDay(new Date());
  threshold.setDate(threshold.getDate() - days + 1);
  return createdAt >= threshold;
}

const ROLE_LABELS = {
  super_admin: "Супер админ",
  administrator: "Администратор",
  manager: "Менеджер",
  operator: "Оператор",
};

export function UsersTab({ users, onCreate, onEdit, onDelete, onStats }) {
  const [search, setSearch] = useState("");
  const [createdFilter, setCreatedFilter] = useState("all");

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((user) => {
      if (createdFilter === "today" && !isCreatedWithin(user, 1)) return false;
      if (createdFilter === "30d" && !isCreatedWithin(user, 30)) return false;
      if (!q) return true;
      return [
        user.id,
        user.name,
        user.login,
        user.role,
        user.system_role,
        user.company_name,
        user.master_profile?.active ? "master" : "",
        user.operator_profile?.active ? "operator" : "",
        user.finance_profile?.active ? "finance" : "",
        user.created_at,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [createdFilter, search, users]);

  const metrics = useMemo(() => {
    const todayCount = users.filter((user) => isCreatedWithin(user, 1)).length;
    const monthCount = users.filter((user) => isCreatedWithin(user, 30)).length;
    const newestUser = users
      .map((user) => ({ user, createdAt: toDate(user.created_at) }))
      .filter((item) => item.createdAt)
      .sort((a, b) => b.createdAt - a.createdAt)[0]?.user;

    return [
      { key: "users", label: "Пользователи", value: users.length, tone: users.length > 0 ? "info" : "neutral" },
      { key: "visible", label: "В выборке", value: filteredUsers.length, tone: filteredUsers.length === users.length ? "neutral" : "warning" },
      { key: "today", label: "Сегодня", value: todayCount, tone: todayCount > 0 ? "success" : "neutral" },
      { key: "month", label: "30 дней", value: monthCount, tone: monthCount > 0 ? "info" : "neutral" },
      { key: "newest", label: "Последний", value: newestUser ? formatDate(newestUser.created_at) : "-", tone: newestUser ? "neutral" : "warning" },
    ];
  }, [filteredUsers.length, users]);

  const confirmDelete = (user) => {
    Modal.confirm({
      title: "Удалить пользователя?",
      content: `Пользователь "${user.name}" будет удален.`,
      okText: "Удалить",
      okButtonProps: { danger: true },
      cancelText: "Отмена",
      onOk: () => onDelete(user.id),
    });
  };

  const columns = [
    {
      title: "ID",
      dataIndex: "id",
      width: 80,
      render: (value) => <span className="text-muted">#{value}</span>,
    },
    {
      title: "Имя",
      dataIndex: "name",
      ellipsis: true,
      render: (value) => <span className="fw-semibold">{value}</span>,
    },
    {
      title: "Логин",
      dataIndex: "login",
      ellipsis: true,
      render: (value) => value || <span className="text-muted">-</span>,
    },
    {
      title: "Роль",
      dataIndex: "role",
      width: 150,
      render: (value) => ROLE_LABELS[value] || value || "-",
    },
    {
      title: "Компания",
      dataIndex: "company_name",
      ellipsis: true,
      render: (value) => value || <span className="text-muted">-</span>,
    },
    {
      title: "Статус",
      dataIndex: "active",
      width: 100,
      align: "center",
      render: (value) => (value === false ? "Отключен" : "Активен"),
    },
    {
      title: "Profiles",
      width: 160,
      render: (_, user) => {
        const tags = [
          user.master_profile?.active ? "master" : null,
          user.operator_profile?.active ? "operator" : null,
          user.finance_profile?.active ? "finance" : null,
        ].filter(Boolean);
        return tags.length ? tags.join(", ") : <span className="text-muted">-</span>;
      },
    },
    {
      title: "Created",
      dataIndex: "created_at",
      width: 140,
      align: "center",
      render: formatDate,
    },
    {
      title: "",
      width: 220,
      align: "right",
      render: (_, user) => (
        <Space size={4}>
          <Button size="small" onClick={() => onStats(user)}>Стат.</Button>
          <Button size="small" onClick={() => onEdit(user)}>Изм.</Button>
          <Button size="small" variant="danger" onClick={() => confirmDelete(user)}>Удал.</Button>
        </Space>
      ),
    },
  ];

  return (
    <div data-eopp-component="UsersTab" className="users-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Пользователи и доступ</h2>
            <div className="small text-muted">
              Учетные записи админки, роли, компании и рабочая статистика.
            </div>
          </div>
        }
        right={
          <Button size="small" variant="primary" onClick={onCreate}>
            Новый пользователь
          </Button>
        }
      />

      <MetricsStrip items={metrics} />

      <Card data-eopp-component="UsersListCard" className="mt-3" size="small" title="Пользователи">
        <FilterBar className="mb-3">
          <label className="form-label small mb-0 users-search">
            Поиск
            <TextInput
              size="small"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="имя, логин, роль, компания"
            />
          </label>
          <label className="form-label small mb-0">
            Создан
            <SelectInput
              size="small"
              value={createdFilter}
              onChange={(value) => setCreatedFilter(value || "all")}
              options={[
                { value: "all", label: "Все даты" },
                { value: "today", label: "Сегодня" },
                { value: "30d", label: "30 дней" },
              ]}
            />
          </label>
        </FilterBar>

        <DataTable
          className="users-table"
          rowKey="id"
          data={filteredUsers}
          columns={columns}
          emptyText="Нет пользователей"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
        />
      </Card>
    </div>
  );
}
