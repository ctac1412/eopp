import React from "react";
import { Modal, Spin } from "antd";
import { DataTable, MetricsStrip } from "../../../ui";

function money(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
}

function formatDate(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UserStatsModal({ show, stats, loading, onClose }) {
  const user = stats?.user;
  const metrics = stats
    ? [
        { key: "keys", label: "API keys", value: stats.api_keys.count, tone: stats.api_keys.count ? "info" : "neutral" },
        { key: "usage", label: "Заявки", value: stats.usage.total, tone: stats.usage.total ? "info" : "neutral" },
        { key: "confirmed", label: "Успешно", value: stats.usage.confirmed, tone: stats.usage.confirmed ? "success" : "neutral" },
        { key: "failed", label: "Ошибки", value: stats.usage.failed, tone: stats.usage.failed ? "warning" : "neutral" },
        { key: "revenue", label: "Выручка", value: money(stats.usage.revenue), tone: stats.usage.revenue ? "success" : "neutral" },
        { key: "expenses", label: "Расходы", value: money(stats.expenses.total_amount), tone: stats.expenses.total_amount ? "warning" : "neutral" },
        { key: "payouts", label: "Выплаты", value: money(stats.payouts.total_amount), tone: stats.payouts.total_amount ? "info" : "neutral" },
      ]
    : [];

  return (
    <Modal
      data-eopp-component="UserStatsModal"
      title={user ? `Статистика: ${user.name}` : "Статистика пользователя"}
      open={!!show}
      onCancel={onClose}
      footer={null}
      width={920}
      destroyOnHidden
    >
      {loading && (
        <div className="text-center py-4">
          <Spin />
        </div>
      )}
      {!loading && stats && (
        <div className="users-stats">
          <div className="small text-muted mb-3">
            Логин: {user.login || "-"} · Роль: {user.role} · Компания: {user.company_name || "-"}
          </div>
          <MetricsStrip items={metrics} />
          <h3 className="fs-6 fw-semibold mt-4 mb-2">Последние заявки</h3>
          <DataTable
            rowKey="id"
            data={stats.usage.recent || []}
            columns={[
              { title: "ID", dataIndex: "id", width: 80 },
              { title: "Бронь", dataIndex: "reservation_id", ellipsis: true },
              { title: "Статус", dataIndex: "status", width: 120 },
              { title: "Цена", dataIndex: "price", width: 110, render: money },
              { title: "Создана", dataIndex: "created_at", width: 170, render: formatDate },
            ]}
            emptyText="Нет заявок"
            pagination={false}
          />
          <h3 className="fs-6 fw-semibold mt-4 mb-2">Последние выплаты</h3>
          <DataTable
            rowKey="id"
            data={stats.payouts.recent || []}
            columns={[
              { title: "ID", dataIndex: "id", width: 80 },
              { title: "Название", dataIndex: "name", ellipsis: true },
              { title: "Статус", dataIndex: "status", width: 120 },
              { title: "Сумма", dataIndex: "total", width: 120, render: money },
              { title: "Создана", dataIndex: "created_at", width: 170, render: formatDate },
            ]}
            emptyText="Нет выплат"
            pagination={false}
          />
        </div>
      )}
    </Modal>
  );
}
