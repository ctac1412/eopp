import React from "react";

export function StatusBadge({ status }) {
  const clsMap = {
    confirmed: "badge--success",
    pending: "badge--warning",
    failed: "badge--error",
  };
  const labelMap = {
    confirmed: "Подтверждено",
    pending: "Ожидание",
    failed: "Ошибка",
  };
  return (
    <span className={`badge ${clsMap[status] || ""}`}>
      {labelMap[status] || status}
    </span>
  );
}