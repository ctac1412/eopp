import React from "react";
import { Tag } from "antd";

const STATUS_MAP = {
  confirmed: { color: "success", label: "Успех" },
  failed: { color: "error", label: "Ошибка" },
  pending: { color: "processing", label: "В работе" },
  paid: { color: "success", label: "Оплачено" },
  unpaid: { color: "error", label: "Не оплачено" },
  online: { color: "success", label: "Онлайн" },
  offline: { color: "default", label: "Офлайн" },
  warning: { color: "warning", label: "Внимание" },
  neutral: { color: "default", label: "Нет данных" },
  create: { color: "success", label: "Создание" },
  reschedule: { color: "blue", label: "Перенос" },
};

export function StatusTag({ status = "neutral", label, color, ...props }) {
  const meta = STATUS_MAP[status] || STATUS_MAP.neutral;
  return (
    <Tag data-eopp-component="StatusTag" color={color || meta.color} {...props}>
      {label || meta.label}
    </Tag>
  );
}
