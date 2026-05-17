import React from "react";

export function StatusBadge({ status }) {
  const clsMap = {
    confirmed: "bg-success",
    pending: "bg-warning text-dark",
    failed: "bg-danger",
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