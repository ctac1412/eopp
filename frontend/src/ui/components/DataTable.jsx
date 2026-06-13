import React from "react";
import { Alert, Table } from "antd";
import { EmptyState } from "./EmptyState";

export function DataTable({
  columns,
  data,
  className = "",
  rowKey = "id",
  loading = false,
  error = null,
  density = "compact",
  sticky = true,
  pagination = false,
  scroll = { x: "max-content" },
  emptyText = "Нет записей",
  ...props
}) {
  if (error) {
    return <Alert type="error" showIcon message="Ошибка загрузки" description={error} />;
  }

  return (
    <div
      data-eopp-component="DataTable"
      className={`eopp-data-table eopp-data-table--${density} ${className}`}
    >
      <Table
        data-eopp-component="DataTable"
        rowKey={rowKey}
        columns={columns}
        dataSource={data}
        loading={loading}
        size={density === "compact" ? "small" : "middle"}
        sticky={sticky}
        pagination={pagination}
        locale={{ emptyText: <EmptyState title={emptyText} /> }}
        scroll={scroll === false ? undefined : scroll}
        {...props}
      />
    </div>
  );
}
